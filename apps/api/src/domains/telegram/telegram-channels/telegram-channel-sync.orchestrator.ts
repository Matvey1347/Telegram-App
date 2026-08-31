import { BadRequestException, Injectable } from '@nestjs/common';
import { TelegramChannelDataType } from '@prisma/client';
import type { SyncStepResult } from '@telegram-system/shared';
import { PrismaService } from '../../../prisma/prisma.service';
import { ApplicationLoggerService } from '../../operations/application-logs/application-logger.service';
import { SyncNowDto } from './dto';
import { TelegramBroadcastStatsService } from './telegram-broadcast-stats.service';
import { TelegramChannelAdmissionSyncService } from './telegram-channel-admission-sync.service';
import { TelegramChannelAccessService } from './telegram-channel-access.service';
import { TelegramChannelCatalogService } from './telegram-channel-catalog.service';
import { TelegramChannelHistoricalSyncService } from './telegram-channel-historical-sync.service';
import { TelegramChannelsSupportService } from './telegram-channels-support.service';
import {
  BulkProgressCallback,
  TelegramChannelSyncSelection,
} from './telegram-channels.internal';
import { TelegramManagedPostRemoteSyncService } from './telegram-managed-post-remote-sync.service';
import { TelegramPostMetricsService } from './telegram-post-metrics.service';
import { TelegramChannelSyncResultService } from './telegram-channel-sync-result.service';

@Injectable()
export class TelegramChannelSyncOrchestrator {
  constructor(
    private readonly prisma: PrismaService,
    private readonly applicationLogger: ApplicationLoggerService,
    private readonly telegramChannelsSupportService: TelegramChannelsSupportService,
    private readonly telegramChannelAccessService: TelegramChannelAccessService,
    private readonly telegramChannelCatalogService: TelegramChannelCatalogService,
    private readonly telegramManagedPostRemoteSyncService: TelegramManagedPostRemoteSyncService,
    private readonly telegramChannelHistoricalSyncService: TelegramChannelHistoricalSyncService,
    private readonly telegramPostMetricsService: TelegramPostMetricsService,
    private readonly telegramBroadcastStatsService: TelegramBroadcastStatsService,
    private readonly telegramChannelSyncResultService: TelegramChannelSyncResultService,
    private readonly telegramChannelAdmissionSyncService: TelegramChannelAdmissionSyncService,
  ) {}

  private readonly initialPostBackfillLimit = 50;

  private readonly olderPostBackfillMaxPages = 5;

  async syncNow(
    userId: string,
    channelId: string,
    dto: SyncNowDto = {},
    onProgress?: BulkProgressCallback,
  ) {
    const syncStartedAt = new Date();
    const startedAt = syncStartedAt.getTime();
    const workspaceId =
      await this.telegramChannelsSupportService.workspace(userId);
    const channel = await this.telegramChannelCatalogService.findOne(
      userId,
      channelId,
    );
    const selection = this.telegramChannelsSupportService.resolveSyncSelection(
      channel as Partial<TelegramChannelSyncSelection>,
      dto,
    );
    if (
      !this.telegramChannelsSupportService.syncSelectionHasAnyEnabled(selection)
    ) {
      throw new BadRequestException('Select at least one sync section');
    }
    if (dto.saveSelection) {
      await this.prisma.telegramChannel.update({
        where: { id: channelId },
        data: selection,
      });
    }
    const totalSteps =
      this.telegramChannelsSupportService.syncSelectionTotalSteps(selection);
    const account = await this.telegramChannelAccessService.connectedAccount(
      workspaceId,
      channelId,
      dto.telegramUserAccountId ||
        (await this.telegramChannelAccessService.bestMtprotoAccountId(
          workspaceId,
          channelId,
          TelegramChannelDataType.STATS,
        )),
    );
    this.applicationLogger.info({
      kind: 'integration',
      source: 'TelegramChannelsService',
      event: 'telegram.sync.started',
      message: `Telegram sync started for channel ${channelId}.`,
      workspaceId,
      userId,
      metadata: {
        channelId,
        sourceAccountId: account.id,
        selection,
      },
    });
    const steps: SyncStepResult[] = [];
    let progressStep = 0;
    const nextProgressStep = () => {
      progressStep += 1;
      return progressStep;
    };
    const postLimit =
      dto.postLimit ||
      (await this.telegramChannelCatalogService.postSyncLimitForChannel(
        channelId,
      ));
    let publicInfo: any = null;
    let historical: any = null;
    let postsMetricsSync: any = null;
    let olderPostsBackfill: any = null;
    let channelStatsSync: any = null;
    let managedPostsSync: any = null;
    let audienceSnapshot: any = null;
    let admissionAnalytics: any = null;

    if (selection.syncIncludePublicInfo) {
      const currentStep = nextProgressStep();
      await this.telegramChannelsSupportService.notifyTaskProgress(
        onProgress,
        currentStep,
        totalSteps,
        'Refreshing public channel info',
      );
      const publicInfoStartedAt = Date.now();
      try {
        publicInfo =
          await this.telegramChannelHistoricalSyncService.syncPublicChannelInfo(
            workspaceId,
            channelId,
            account,
          );
        steps.push(
          this.telegramChannelsSupportService.syncStepSuccess(
            'channel_info',
            publicInfoStartedAt,
            'Channel info refreshed',
            { subscribersCount: publicInfo?.subscribersCount ?? null },
          ),
        );
      } catch (error) {
        steps.push(
          this.telegramChannelsSupportService.syncStepFailure(
            'channel_info',
            publicInfoStartedAt,
            error,
            'CHANNEL_INFO_FAILED',
            'Failed to refresh channel info',
          ),
        );
        throw error;
      }
    }
    if (
      selection.syncIncludeInviteLinks ||
      selection.syncIncludeHistoricalPosts
    ) {
      const currentStep = nextProgressStep();
      await this.telegramChannelsSupportService.notifyTaskProgress(
        onProgress,
        currentStep,
        totalSteps,
        'Importing posts and invite links',
      );
      const historicalStartedAt = Date.now();
      try {
        historical =
          await this.telegramChannelHistoricalSyncService.syncHistorical(
            userId,
            channelId,
            {
              telegramUserAccountId: account.id,
              syncInviteLinks: selection.syncIncludeInviteLinks,
              syncPosts: selection.syncIncludeHistoricalPosts,
              postLimit,
            },
            onProgress,
            { current: currentStep, total: totalSteps },
          );
        const historicalMetadata = {
          importedInviteLinks: historical?.imported ?? 0,
          updatedInviteLinks: historical?.updated ?? 0,
          postsUpdated: historical?.postsUpdated ?? 0,
          inviteLinksScope: historical?.inviteLinksScope ?? null,
          inviteLinksExpectedTotal:
            historical?.inviteLinksExpectedTotal ?? null,
          inviteLinksFetchedTotal: historical?.inviteLinksFetchedTotal ?? 0,
          inviteLinksMissingTotal: historical?.inviteLinksMissingTotal ?? 0,
          inviteLinkWarnings: historical?.inviteLinkWarnings ?? [],
        };
        const historicalMessage =
          selection.syncIncludeInviteLinks &&
          selection.syncIncludeHistoricalPosts
            ? 'Posts and invite links synced'
            : selection.syncIncludeInviteLinks
              ? 'Invite links synced'
              : 'Historical posts synced';
        steps.push(
          historical?.inviteLinksScope === 'PARTIAL_ADMINS'
            ? this.telegramChannelsSupportService.syncStepPartial(
                'historical_posts',
                historicalStartedAt,
                'Posts synced, but invite-link sync completed partially',
                historicalMetadata,
              )
            : this.telegramChannelsSupportService.syncStepSuccess(
                'historical_posts',
                historicalStartedAt,
                historicalMessage,
                historicalMetadata,
              ),
        );
      } catch (error) {
        steps.push(
          this.telegramChannelsSupportService.syncStepFailure(
            'historical_posts',
            historicalStartedAt,
            error,
            'HISTORICAL_SYNC_FAILED',
            'Failed to sync historical Telegram data',
          ),
        );
        throw error;
      }
    }
    if (selection.syncIncludePostMetrics) {
      const currentStep = nextProgressStep();
      await this.telegramChannelsSupportService.notifyTaskProgress(
        onProgress,
        currentStep,
        totalSteps,
        'Updating post metrics',
      );
      const postsMetricsStartedAt = Date.now();
      try {
        postsMetricsSync =
          await this.telegramPostMetricsService.syncPostsMetrics(
            userId,
            channelId,
            {
              telegramUserAccountId: account.id,
              postLimit,
            },
            onProgress,
            { current: currentStep, total: totalSteps },
          );
        steps.push(
          this.telegramChannelsSupportService.syncStepSuccess(
            'post_metrics',
            postsMetricsStartedAt,
            'Post metrics synced',
            { syncedPosts: postsMetricsSync?.syncedPosts ?? 0 },
          ),
        );
      } catch (error) {
        steps.push(
          this.telegramChannelsSupportService.syncStepFailure(
            'post_metrics',
            postsMetricsStartedAt,
            error,
            'POST_METRICS_FAILED',
            'Failed to sync post metrics',
          ),
        );
        // A separately selected audience snapshot can still succeed when the
        // post-metrics transport is unavailable. Preserve the old fail-fast
        // behavior when no independent follow-up was requested.
        if (!selection.syncIncludeAudienceSnapshot) throw error;
      }
    }
    if (selection.syncIncludeOlderPosts) {
      const currentStep = nextProgressStep();
      await this.telegramChannelsSupportService.notifyTaskProgress(
        onProgress,
        currentStep,
        totalSteps,
        'Backfilling older post metrics',
      );
      const olderPostsStartedAt = Date.now();
      olderPostsBackfill =
        await this.telegramPostMetricsService.syncOlderPostsMetricsBackfillForWorkspace(
          workspaceId,
          channelId,
          {
            telegramUserAccountId: account.id,
            maxPages:
              postLimit === this.initialPostBackfillLimit
                ? this.olderPostBackfillMaxPages
                : 1,
          },
        );
      steps.push(
        olderPostsBackfill?.syncedPosts
          ? this.telegramChannelsSupportService.syncStepSuccess(
              'older_post_backfill',
              olderPostsStartedAt,
              'Older post metrics backfilled',
              {
                syncedPosts: olderPostsBackfill.syncedPosts,
                pagesFetched: olderPostsBackfill.pagesFetched ?? 0,
              },
            )
          : this.telegramChannelsSupportService.syncStepSkipped(
              'older_post_backfill',
              olderPostsStartedAt,
              'No older posts were available for backfill',
            ),
      );
    }
    if (selection.syncIncludeChannelStats) {
      const currentStep = nextProgressStep();
      await this.telegramChannelsSupportService.notifyTaskProgress(
        onProgress,
        currentStep,
        totalSteps,
        'Syncing channel stats',
      );
      const statsStartedAt = Date.now();
      try {
        channelStatsSync =
          await this.telegramBroadcastStatsService.syncBroadcastStats(
            userId,
            channelId,
            {
              telegramUserAccountId: account.id,
            },
          );
        const statsStatus =
          channelStatsSync?.success === true
            ? 'success'
            : channelStatsSync?.snapshot?.normalizedStats?.status ===
                'available'
              ? 'success'
              : 'skipped';
        steps.push(
          statsStatus === 'success'
            ? this.telegramChannelsSupportService.syncStepSuccess(
                'broadcast_stats',
                statsStartedAt,
                'Broadcast stats synced',
                { pointsUpserted: channelStatsSync?.pointsUpserted ?? 0 },
              )
            : this.telegramChannelsSupportService.syncStepSkipped(
                'broadcast_stats',
                statsStartedAt,
                'Broadcast stats unavailable for this channel/source',
                {
                  normalizedStatus:
                    channelStatsSync?.snapshot?.normalizedStats?.status ?? null,
                },
              ),
        );
      } catch (error) {
        steps.push(
          this.telegramChannelsSupportService.syncStepFailure(
            'broadcast_stats',
            statsStartedAt,
            error,
            'BROADCAST_STATS_FAILED',
            'Failed to sync broadcast stats',
          ),
        );
      }
    }
    if (selection.syncIncludeManagedPosts) {
      const currentStep = nextProgressStep();
      await this.telegramChannelsSupportService.notifyTaskProgress(
        onProgress,
        currentStep,
        totalSteps,
        'Syncing managed posts',
      );
      const managedPostsStartedAt = Date.now();
      try {
        managedPostsSync =
          await this.telegramManagedPostRemoteSyncService.syncManagedPosts(
            userId,
            channelId,
          );
        steps.push(
          this.telegramChannelsSupportService.syncStepSuccess(
            'managed_posts',
            managedPostsStartedAt,
            'Managed posts synced',
            { syncedPosts: managedPostsSync?.posts?.length ?? 0 },
          ),
        );
      } catch (error) {
        steps.push(
          this.telegramChannelsSupportService.syncStepSkipped(
            'managed_posts',
            managedPostsStartedAt,
            error instanceof Error
              ? error.message
              : 'Managed post sync is not available',
          ),
        );
      }
    }
    if (selection.syncIncludeAudienceSnapshot) {
      const currentStep = nextProgressStep();
      await this.telegramChannelsSupportService.notifyTaskProgress(
        onProgress,
        currentStep,
        totalSteps,
        postsMetricsSync?.audienceSnapshot
          ? 'Audience snapshot already saved with post metrics'
          : 'Saving audience snapshot',
      );
      const audienceStartedAt = Date.now();
      audienceSnapshot =
        postsMetricsSync?.audienceSnapshot ??
        (await this.telegramChannelsSupportService.createAudienceSnapshotSafely(
          channelId,
          'sync',
        ));
      steps.push(
        audienceSnapshot
          ? this.telegramChannelsSupportService.syncStepSuccess(
              'audience_snapshot',
              audienceStartedAt,
              'Audience snapshot saved',
            )
          : this.telegramChannelsSupportService.syncStepSkipped(
              'audience_snapshot',
              audienceStartedAt,
              'Audience snapshot was skipped',
            ),
      );
    }
    admissionAnalytics = await this.telegramChannelAdmissionSyncService.process(
      {
        workspaceId,
        channelId,
        syncStartedAt,
        selection,
        steps,
      },
    );
    return this.telegramChannelSyncResultService.finalize({
      onProgress,
      nextProgressStep,
      totalSteps,
      selection,
      steps,
      publicInfo,
      historical,
      postsMetricsSync,
      olderPostsBackfill,
      channelStatsSync,
      managedPostsSync,
      audienceSnapshot,
      admissionAnalytics,
      startedAt,
      workspaceId,
      userId,
      channelId,
      account,
    });
  }
}
