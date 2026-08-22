import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  TelegramChannelDataType,
  TelegramDataSourceStatus,
  TelegramSourceType,
} from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';
import { TelegramMtprotoClient } from '../../../telegram/shared/telegram-mtproto.client';
import { TelegramSourceAccessService } from '../../../telegram/shared/telegram-source-access.service';
import { ApplicationLoggerService } from '../../operations/application-logs/application-logger.service';
import { TelegramChannelAccessService } from './telegram-channel-access.service';
import { TelegramChannelCatalogService } from './telegram-channel-catalog.service';
import { TelegramChannelsSupportService } from './telegram-channels-support.service';
import { TELEGRAM_BROADCAST_STATS_MIN_SUBSCRIBERS } from './telegram-channels.internal';

@Injectable()
export class TelegramBroadcastStatsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly mtprotoClient: TelegramMtprotoClient,
    private readonly sourceAccessService: TelegramSourceAccessService,
    private readonly applicationLogger: ApplicationLoggerService,
    private readonly telegramChannelsSupportService: TelegramChannelsSupportService,
    private readonly telegramChannelAccessService: TelegramChannelAccessService,
    private readonly telegramChannelCatalogService: TelegramChannelCatalogService,
  ) {}

  async syncBroadcastStats(
    userId: string,
    channelId: string,
    dto: { telegramUserAccountId?: string },
  ) {
    const workspaceId =
      await this.telegramChannelsSupportService.workspace(userId);
    const account = await this.telegramChannelAccessService.connectedAccount(
      workspaceId,
      channelId,
      dto.telegramUserAccountId,
    );
    const result = await this.syncBroadcastStatsForWorkspace(
      workspaceId,
      channelId,
      account.id,
    );
    this.telegramChannelsSupportService.invalidateTelegramChannelReadCache(
      userId,
      workspaceId,
    );
    return result;
  }

  async syncBroadcastStatsForWorkspace(
    workspaceId: string,
    channelId: string,
    accountId: string,
  ) {
    const startedAt = Date.now();
    const channel = await this.prisma.telegramChannel.findFirst({
      where: { id: channelId, workspaceId, isActive: true },
    });
    if (!channel) throw new NotFoundException('Telegram channel not found');
    const account = await this.telegramChannelAccessService.connectedAccount(
      workspaceId,
      channelId,
      accountId,
    );
    const channelReference =
      this.telegramChannelAccessService.mtprotoChannelReference(channel);
    if (!channelReference.telegramChatId && !channelReference.username)
      throw new BadRequestException('Channel must have username or chatId');
    const stats = await this.mtprotoClient.getBroadcastStats({
      ...this.telegramChannelAccessService.accountCredentials(account),
      channel: channelReference,
    });
    const currentSubscribersCount = channel.currentSubscribersCount ?? 0;
    const statsUnavailableBecauseChannelIsTooSmall =
      stats.normalized.status !== 'available' &&
      currentSubscribersCount > 0 &&
      currentSubscribersCount < TELEGRAM_BROADCAST_STATS_MIN_SUBSCRIBERS;
    const statsDataSourceStatus =
      stats.normalized.status === 'available'
        ? TelegramDataSourceStatus.SUCCESS
        : statsUnavailableBecauseChannelIsTooSmall
          ? TelegramDataSourceStatus.SKIPPED
          : TelegramDataSourceStatus.FAILED;
    const statsUnavailableMessage = statsUnavailableBecauseChannelIsTooSmall
      ? `Stats are not available yet: Telegram usually opens channel analytics after ${TELEGRAM_BROADCAST_STATS_MIN_SUBSCRIBERS}+ subscribers. Current subscribers: ${currentSubscribersCount}.`
      : Array.isArray(stats.warnings)
        ? stats.warnings.join('; ')
        : 'Stats unavailable from this source';
    const syncedAt = new Date();
    const snapshotDate = this.telegramChannelsSupportService.toUtcDay(syncedAt);
    const snapshot = await this.prisma.telegramChannelStatsSnapshot.upsert({
      where: {
        telegramChannelId_snapshotDate: {
          telegramChannelId: channel.id,
          snapshotDate,
        },
      },
      create: {
        workspaceId,
        telegramChannelId: channel.id,
        syncedAt,
        snapshotDate,
        rawStats: stats.raw as any,
        normalizedStats: stats.normalized as any,
        availableFields: stats.availableFields,
        warnings: stats.warnings,
      },
      update: {
        syncedAt,
        rawStats: stats.raw as any,
        normalizedStats: stats.normalized as any,
        availableFields: stats.availableFields,
        warnings: stats.warnings,
      },
    });
    const points = this.extractBroadcastStatsPoints(
      workspaceId,
      channel.id,
      syncedAt,
      stats.normalized,
    );
    await this.prisma.$transaction(
      points.map((point) =>
        this.prisma.telegramChannelStatsPoint.upsert({
          where: {
            telegramChannelId_metric_series_date: {
              telegramChannelId: point.telegramChannelId,
              metric: point.metric,
              series: point.series,
              date: point.date,
            },
          },
          create: point,
          update: {
            seriesLabel: point.seriesLabel,
            color: point.color,
            graphType: point.graphType,
            value: point.value,
            latestSyncedAt: point.latestSyncedAt,
          },
        }),
      ),
    );
    await this.sourceAccessService.recordDataSource({
      workspaceId,
      channelId,
      sourceId: account.id,
      sourceType: TelegramSourceType.MTPROTO,
      dataType: TelegramChannelDataType.STATS,
      status: statsDataSourceStatus,
      sourceDisplayName:
        this.telegramChannelAccessService.sourceDisplayName(account),
      errorMessage:
        stats.normalized.status === 'available'
          ? null
          : statsUnavailableMessage,
      metadata: {
        availableFields: stats.availableFields,
        warnings: stats.warnings,
      },
    });
    const audienceSnapshot =
      await this.telegramChannelsSupportService.createAudienceSnapshotSafely(
        channelId,
        'sync',
      );
    const result = {
      source: 'mtproto',
      success: stats.normalized.status === 'available',
      snapshot,
      pointsUpserted: points.length,
      audienceSnapshot,
    };
    this.applicationLogger.info({
      level: result.success ? 'info' : 'warn',
      kind: 'integration',
      source: 'TelegramChannelsService',
      event: result.success
        ? 'telegram.broadcast_stats_sync.completed'
        : 'telegram.broadcast_stats_sync.skipped',
      message: result.success
        ? `Broadcast stats synced for channel ${channelId}.`
        : `Broadcast stats unavailable for channel ${channelId}.`,
      workspaceId,
      durationMs: Date.now() - startedAt,
      metadata: {
        channelId,
        sourceAccountId: account.id,
        pointsUpserted: points.length,
        normalizedStatus: stats.normalized.status,
        warnings: stats.warnings,
      },
    });
    return result;
  }

  public extractBroadcastStatsPoints(
    workspaceId: string,
    telegramChannelId: string,
    syncedAt: Date,
    normalizedStats: any,
  ) {
    const points: any[] = [];
    for (const [metric, graph] of Object.entries(
      normalizedStats?.graphs || {},
    )) {
      if ((graph as any)?.status !== 'available') continue;
      const payload = (graph as any).data;
      if (!Array.isArray(payload?.columns)) continue;
      const columns = payload.columns.filter((column: unknown) =>
        Array.isArray(column),
      );
      const dates = columns.find((column: any[]) => column[0] === 'x');
      if (!dates) continue;
      for (const values of columns.filter(
        (column: any[]) => column[0] !== 'x',
      )) {
        for (let index = 1; index < dates.length; index += 1) {
          const timestamp = Number(dates[index]);
          const value = Number(values[index]);
          if (!Number.isFinite(timestamp) || !Number.isFinite(value)) continue;
          points.push({
            workspaceId,
            telegramChannelId,
            metric,
            series: String(values[0]),
            seriesLabel: String(payload.names?.[values[0]] || values[0]),
            color: payload.colors?.[values[0]] || null,
            graphType: String(payload.types?.[values[0]] || 'line'),
            date: this.telegramChannelsSupportService.toUtcDay(
              new Date(
                timestamp < 100_000_000_000 ? timestamp * 1000 : timestamp,
              ),
            ),
            value,
            latestSyncedAt: syncedAt,
          });
        }
      }
    }
    return points;
  }

  async channelStatsSnapshots(userId: string, channelId: string, limit = 20) {
    const workspaceId =
      await this.telegramChannelsSupportService.workspace(userId);
    await this.telegramChannelCatalogService.findOne(userId, channelId);
    return this.prisma.telegramChannelStatsSnapshot.findMany({
      where: { workspaceId, telegramChannelId: channelId },
      orderBy: { syncedAt: 'desc' },
      take: Math.max(1, Math.min(100, limit)),
    });
  }
}
