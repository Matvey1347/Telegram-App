import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  Logger,
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
import { BulkProgressCallback } from './telegram-channels.internal';

@Injectable()
export class TelegramPostMetricsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly mtprotoClient: TelegramMtprotoClient,
    private readonly sourceAccessService: TelegramSourceAccessService,
    private readonly applicationLogger: ApplicationLoggerService,
    private readonly telegramChannelsSupportService: TelegramChannelsSupportService,
    private readonly telegramChannelAccessService: TelegramChannelAccessService,
    private readonly telegramChannelCatalogService: TelegramChannelCatalogService,
  ) {}
  private readonly logger = new Logger('TelegramChannelsService');

  private readonly defaultPostSyncLimit = 50;

  async syncPostsMetrics(
    userId: string,
    channelId: string,
    dto: { telegramUserAccountId?: string; postLimit?: number },
    onProgress?: BulkProgressCallback,
    progressStep = { current: 3, total: 8 },
  ) {
    const workspaceId =
      await this.telegramChannelsSupportService.workspace(userId);
    const result = await this.syncPostsMetricsForWorkspace(
      workspaceId,
      channelId,
      dto,
      onProgress,
      progressStep,
    );
    this.telegramChannelsSupportService.invalidateTelegramChannelReadCache(
      userId,
      workspaceId,
    );
    return result;
  }

  async syncPostsMetricsForWorkspace(
    workspaceId: string,
    channelId: string,
    dto: { telegramUserAccountId?: string; postLimit?: number },
    onProgress?: BulkProgressCallback,
    progressStep = { current: 3, total: 8 },
  ) {
    const startedAt = Date.now();
    const channel = (await (this.prisma.telegramChannel as any).findFirst({
      where: { id: channelId, workspaceId, isActive: true },
    })) as {
      id: string;
      username: string | null;
      telegramChatId: string | null;
    } | null;
    if (!channel) throw new NotFoundException('Telegram channel not found');
    const importPolicy =
      await this.telegramChannelCatalogService.getChannelSyncCutoffs(
        workspaceId,
        channelId,
      );
    const account = await this.telegramChannelAccessService.connectedAccount(
      workspaceId,
      channelId,
      dto.telegramUserAccountId,
    );
    const channelReference =
      this.telegramChannelAccessService.mtprotoChannelReference(channel);
    if (!channelReference.telegramChatId && !channelReference.username)
      throw new BadRequestException('Channel must have username or chatId');
    try {
      const metrics = await this.mtprotoClient.getChannelPostsMetrics({
        ...this.telegramChannelAccessService.accountCredentials(account),
        channel: channelReference,
        postLimit: dto.postLimit || this.defaultPostSyncLimit,
      });
      await this.telegramChannelsSupportService.notifyDetailedTaskProgress(
        onProgress,
        progressStep.current,
        progressStep.total,
        `Downloaded ${metrics.length} posts, saving metrics to the database`,
      );
      const persistence = await this.persistPostMetrics(
        workspaceId,
        channel.id,
        metrics,
        onProgress,
        progressStep,
      );
      const changed =
        persistence.changedPosts > 0 || persistence.snapshotsCreated > 0;
      if (changed) {
        for (const dataType of [
          TelegramChannelDataType.POSTS,
          TelegramChannelDataType.VIEWS,
          TelegramChannelDataType.REACTIONS,
        ]) {
          await this.sourceAccessService.recordDataSource({
            workspaceId,
            channelId,
            sourceId: account.id,
            sourceType: TelegramSourceType.MTPROTO,
            dataType,
            status: TelegramDataSourceStatus.SUCCESS,
            sourceDisplayName:
              this.telegramChannelAccessService.sourceDisplayName(account),
            metadata: { syncedPosts: metrics.length },
          });
        }
      }
      const audienceSnapshot = changed
        ? await this.telegramChannelsSupportService.createAudienceSnapshotSafely(
            channelId,
            'sync',
          )
        : null;
      const result = {
        source: 'mtproto',
        ...this.telegramChannelCatalogService.syncCutoffMetadata(importPolicy),
        syncedPosts: metrics.length,
        ...persistence,
        audienceSnapshot,
      };
      return result;
    } catch (error) {
      this.logger.error(
        `MTProto post metrics sync failed for channel=${channelId}: ${error instanceof Error ? error.message : 'unknown error'}`,
      );
      this.applicationLogger.writeStructured({
        level: 'error',
        kind: 'integration',
        source: 'TelegramChannelsService',
        event: 'telegram.post_metrics_sync.failed',
        message:
          error instanceof Error
            ? error.message
            : 'Failed to sync channel post metrics',
        workspaceId,
        durationMs: Date.now() - startedAt,
        errorName: error instanceof Error ? error.name : 'Error',
        stack: error instanceof Error ? error.stack || null : null,
        metadata: { channelId, sourceAccountId: account.id },
      });
      throw new InternalServerErrorException(
        'Failed to sync channel post metrics',
      );
    }
  }

  public async persistPostMetrics(
    workspaceId: string,
    channelId: string,
    metrics: any[],
    onProgress?: BulkProgressCallback,
    progressStep = { current: 3, total: 8 },
  ) {
    const affectedDays = new Set<string>();
    const incomingMessageIds = metrics.map((post) =>
      String(post.telegramMessageId),
    );
    // Fetch only the window returned by Telegram. A missing item from this
    // window is not a deleted historical post, so it must not cause every old
    // day in a channel to be recalculated on each sync.
    const persisted = incomingMessageIds.length
      ? await this.prisma.telegramPost.findMany({
          where: {
            workspaceId,
            telegramChannelId: channelId,
            telegramMessageId: { in: incomingMessageIds },
          },
          select: {
            id: true,
            telegramMessageId: true,
            postDate: true,
            text: true,
            formattedText: true,
            hasMedia: true,
            mediaKind: true,
            viewsCount: true,
            forwardsCount: true,
            reactionsCount: true,
            commentsCount: true,
            reactions: true,
            rawMessage: true,
          },
        })
      : [];
    const existingByMessageId = new Map(
      persisted.map((post) => [String(post.telegramMessageId), post]),
    );
    let changedPosts = 0;
    let snapshotsCreated = 0;
    for (const [index, post] of metrics.entries()) {
      if (index > 0 && index % 100 === 0) {
        await this.telegramChannelsSupportService.notifyDetailedTaskProgress(
          onProgress,
          progressStep.current,
          progressStep.total,
          `Saved ${index}/${metrics.length} post metrics`,
        );
      }
      const existing = existingByMessageId.get(String(post.telegramMessageId));
      const changed = !existing || this.postMetricsChanged(existing, post);
      if (!changed) continue;
      const data = {
        postDate: post.postDate,
        text: post.text,
        formattedText: post.formattedText,
        hasMedia: post.hasMedia,
        mediaKind: post.mediaKind,
        viewsCount: post.viewsCount,
        forwardsCount: post.forwardsCount,
        reactionsCount: post.reactionsCount,
        commentsCount: post.commentsCount,
        reactions: post.reactions,
        rawMessage: post.rawMessage,
      };
      const upserted = existing
        ? await this.prisma.telegramPost.update({
            where: { id: existing.id },
            data,
          })
        : await this.prisma.telegramPost.create({
            data: {
              workspaceId,
              telegramChannelId: channelId,
              telegramMessageId: post.telegramMessageId,
              ...data,
            },
          });
      await this.prisma.telegramPostMetricSnapshot.create({
        data: {
          telegramPostId: upserted.id,
          viewsCount: post.viewsCount,
          forwardsCount: post.forwardsCount,
          reactionsCount: post.reactionsCount,
          commentsCount: post.commentsCount,
          reactions: post.reactions,
        },
      });
      changedPosts += 1;
      snapshotsCreated += 1;
      if (existing)
        affectedDays.add(existing.postDate.toISOString().slice(0, 10));
      affectedDays.add(post.postDate.toISOString().slice(0, 10));
    }
    await this.telegramChannelsSupportService.notifyDetailedTaskProgress(
      onProgress,
      progressStep.current,
      progressStep.total,
      `Recalculating daily stats for ${affectedDays.size} affected days`,
    );
    if (affectedDays.size) {
      await this.recalculateDailyStatsFromPosts(channelId, [...affectedDays]);
    }
    return { affectedDays: affectedDays.size, changedPosts, snapshotsCreated };
  }

  public postMetricsChanged(
    existing: Record<string, any>,
    incoming: Record<string, any>,
  ) {
    const fields = [
      'postDate',
      'text',
      'formattedText',
      'hasMedia',
      'mediaKind',
      'viewsCount',
      'forwardsCount',
      'reactionsCount',
      'commentsCount',
      'reactions',
      'rawMessage',
    ];
    return fields.some(
      (field) =>
        this.metricValue(existing[field]) !== this.metricValue(incoming[field]),
    );
  }

  public metricValue(value: unknown) {
    if (value instanceof Date) return value.toISOString();
    if (value == null) return '';
    if (typeof value === 'object') return JSON.stringify(value);
    if (typeof value === 'symbol') return value.description ?? '';
    if (typeof value === 'function') return value.name;
    if (typeof value === 'string') return value;
    if (typeof value === 'number' || typeof value === 'bigint') {
      return value.toString();
    }
    return value ? 'true' : 'false';
  }

  async telegramPostMedia(userId: string, channelId: string, postId: string) {
    const workspaceId =
      await this.telegramChannelsSupportService.workspace(userId);
    const [channel, post] = await Promise.all([
      this.prisma.telegramChannel.findFirst({
        where: { id: channelId, workspaceId, isActive: true },
      }),
      this.prisma.telegramPost.findFirst({
        where: { id: postId, telegramChannelId: channelId, workspaceId },
        select: { telegramMessageId: true, hasMedia: true },
      }),
    ]);
    if (!channel || !post)
      throw new NotFoundException('Telegram post not found');
    if (!post.hasMedia) throw new NotFoundException('Post has no media');
    const account = await this.telegramChannelAccessService.connectedAccount(
      workspaceId,
      channelId,
    );
    const channelReference =
      this.telegramChannelAccessService.mtprotoChannelReference(channel);
    if (!channelReference.telegramChatId && !channelReference.username)
      throw new BadRequestException('Channel has no Telegram reference');
    const media = await this.mtprotoClient.downloadChannelMessageMedia({
      ...this.telegramChannelAccessService.accountCredentials(account),
      channel: channelReference,
      messageId: post.telegramMessageId,
    });
    if (!media) throw new NotFoundException('Telegram post media not found');
    return media;
  }

  public oldestMessageId(metrics: Array<{ telegramMessageId: string }>) {
    return metrics.reduce<string | null>((oldest, post) => {
      const current = this.toFiniteMessageId(post.telegramMessageId);
      const previous = this.toFiniteMessageId(oldest);
      if (current == null) return oldest;
      if (previous == null || current < previous) return post.telegramMessageId;
      return oldest;
    }, null);
  }

  public toFiniteMessageId(value: unknown) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }

  public syncOlderPostsMetricsBackfillForWorkspace(
    workspaceId: string,
    channelId: string,
    dto: { telegramUserAccountId?: string; maxPages?: number },
  ) {
    void workspaceId;
    void channelId;
    void dto;
    return Promise.resolve({
      source: 'mtproto',
      syncedPosts: 0,
      pagesFetched: 0,
      skipped: true,
      message:
        'Older posts backfill is disabled because the channel keeps only the latest 50 posts for analytics.',
    });
  }

  public async recalculateDailyStatsFromPosts(
    channelId: string,
    dates: string[],
  ) {
    for (const value of dates) {
      const date = new Date(`${value}T00:00:00.000Z`);
      const nextDate = new Date(date.getTime() + 24 * 3600 * 1000);
      const aggregate = await this.prisma.telegramPost.aggregate({
        where: {
          telegramChannelId: channelId,
          postDate: { gte: date, lt: nextDate },
        },
        _sum: { viewsCount: true, reactionsCount: true, forwardsCount: true },
      });
      await this.prisma.telegramChannelDailyStats.upsert({
        where: {
          telegramChannelId_date: { telegramChannelId: channelId, date },
        },
        create: {
          telegramChannelId: channelId,
          date,
          viewsCount: aggregate._sum.viewsCount ?? 0,
          reactionsCount: aggregate._sum.reactionsCount ?? 0,
          forwardsCount: aggregate._sum.forwardsCount ?? 0,
        },
        update: {
          viewsCount: aggregate._sum.viewsCount ?? 0,
          reactionsCount: aggregate._sum.reactionsCount ?? 0,
          forwardsCount: aggregate._sum.forwardsCount ?? 0,
        },
      });
    }
  }
}
