import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { TelegramPostMetricsService } from '../telegram-channels/telegram-post-metrics.service';
import { TelegramBroadcastStatsService } from '../telegram-channels/telegram-broadcast-stats.service';
import { ApplicationLoggerService } from '../../operations/application-logs/application-logger.service';

@Injectable()
export class TelegramWorkspaceSyncTasksService {
  private readonly logger = new Logger(TelegramWorkspaceSyncTasksService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly telegramPostMetricsService: TelegramPostMetricsService,
    private readonly telegramBroadcastStatsService: TelegramBroadcastStatsService,
    private readonly applicationLogger: ApplicationLoggerService,
  ) {}

  async syncPostMetricsForWorkspace(workspaceId: string) {
    const startedAt = Date.now();
    const selection = await this.postMetricsChannelSelection(workspaceId);
    const channels = selection.eligible;
    let synced = 0;
    let failed = 0;
    let postsFetched = 0;
    let postsChanged = 0;
    let snapshotsCreated = 0;
    let dailyStatsRecalculated = 0;
    for (const channel of channels) {
      try {
        const result =
          await this.telegramPostMetricsService.syncPostsMetricsForWorkspace(
            workspaceId,
            channel.id,
            { postLimit: 100 },
          );
        synced += 1;
        postsFetched += result.syncedPosts;
        postsChanged += result.changedPosts;
        snapshotsCreated += result.snapshotsCreated;
        dailyStatsRecalculated += result.affectedDays;
      } catch (error) {
        failed += 1;
        this.logger.warn(
          `Post metrics sync failed for channel=${channel.id}: ${
            error instanceof Error ? error.message : 'unknown error'
          }`,
        );
      }
    }
    return {
      summary: `Synced post metrics for ${synced}/${channels.length} eligible channels (auto-sync skipped ${selection.autoSyncDisabled}, selection skipped ${selection.selectionDisabled})${
        failed ? `, ${failed} failed` : ''
      }.`,
    };
  }

  async syncBroadcastStatsForWorkspace(workspaceId: string) {
    const startedAt = Date.now();
    const channels = await this.broadcastStatsChannels(workspaceId);
    let synced = 0;
    let failed = 0;
    for (const channel of channels) {
      try {
        const link = await this.prisma.telegramChannelAdminLink.findFirst({
          where: { workspaceId, telegramChannelId: channel.id },
          orderBy: { createdAt: 'asc' },
        });
        if (!link) continue;
        await this.telegramBroadcastStatsService.syncBroadcastStatsForWorkspace(
          workspaceId,
          channel.id,
          link.telegramUserAccountIntegrationId,
        );
        synced += 1;
      } catch (error) {
        failed += 1;
        this.logger.warn(
          `Broadcast stats sync failed for channel=${channel.id}: ${
            error instanceof Error ? error.message : 'unknown error'
          }`,
        );
      }
    }
    return {
      summary: `Synced broadcast stats for ${synced}/${channels.length} channels${
        failed ? `, ${failed} failed` : ''
      }.`,
    };
  }

  private async postMetricsChannelSelection(workspaceId: string) {
    const rows = await this.prisma.telegramChannel.findMany({
      where: { workspaceId, isActive: true, adminLinks: { some: {} } },
      select: { id: true, autoSyncEnabled: true, syncIncludePostMetrics: true },
    });
    return {
      eligible: rows.filter(
        (row) => row.autoSyncEnabled && row.syncIncludePostMetrics,
      ),
      autoSyncDisabled: rows.filter((row) => !row.autoSyncEnabled).length,
      selectionDisabled: rows.filter(
        (row) => row.autoSyncEnabled && !row.syncIncludePostMetrics,
      ).length,
    };
  }

  private broadcastStatsChannels(workspaceId: string) {
    return this.prisma.telegramChannel.findMany({
      where: {
        workspaceId,
        isActive: true,
        autoSyncEnabled: true,
        syncIncludeChannelStats: true,
        adminLinks: { some: {} },
      },
      select: { id: true },
    });
  }
}
