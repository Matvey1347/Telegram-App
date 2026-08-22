import { Injectable } from '@nestjs/common';
import type {
  SyncOperationResult,
  SyncStepResult,
} from '@telegram-system/shared';
import { ApplicationLoggerService } from '../../operations/application-logs/application-logger.service';
import { TelegramChannelsSupportService } from './telegram-channels-support.service';
import type {
  BulkProgressCallback,
  TelegramChannelSyncSelection,
} from './telegram-channels.internal';

@Injectable()
export class TelegramChannelSyncResultService {
  constructor(
    private readonly applicationLogger: ApplicationLoggerService,
    private readonly support: TelegramChannelsSupportService,
  ) {}
  async finalize(params: {
    onProgress?: BulkProgressCallback;
    nextProgressStep: () => number;
    totalSteps: number;
    selection: TelegramChannelSyncSelection;
    steps: SyncStepResult[];
    publicInfo: any;
    historical: any;
    postsMetricsSync: any;
    olderPostsBackfill: any;
    channelStatsSync: any;
    managedPostsSync: any;
    audienceSnapshot: any;
    admissionAnalytics: any;
    startedAt: number;
    workspaceId: string;
    userId: string;
    channelId: string;
    account: { id: string };
  }) {
    const {
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
    } = params;
    await this.support.notifyTaskProgress(
      onProgress,
      nextProgressStep(),
      totalSteps,
      'Finalizing sync status',
    );
    const requiredStepNames = new Set<string>();
    if (selection.syncIncludePublicInfo) requiredStepNames.add('channel_info');
    if (
      selection.syncIncludeInviteLinks ||
      selection.syncIncludeHistoricalPosts
    ) {
      requiredStepNames.add('historical_posts');
    }
    if (selection.syncIncludePostMetrics) requiredStepNames.add('post_metrics');
    const requiredSteps = steps.filter((step) =>
      requiredStepNames.has(step.step),
    );
    const hasRequiredFailure = requiredSteps.some(
      (step) => step.status === 'failed',
    );
    const hasRequiredPartial = requiredSteps.some(
      (step) => step.status === 'partial',
    );
    const hasOptionalFailure = steps.some((step) => step.status === 'failed');
    const hasOptionalPartial = steps.some((step) => step.status === 'partial');
    const overallStatus = hasRequiredFailure
      ? 'failed'
      : hasRequiredPartial || hasOptionalFailure || hasOptionalPartial
        ? 'partial'
        : 'success';
    const result = {
      status: overallStatus,
      source: 'mtproto',
      steps,
      publicInfo,
      historical,
      postsMetricsSync,
      olderPostsBackfill,
      channelStatsSync,
      managedPostsSync,
      audienceSnapshot,
      admissionAnalytics,
    } satisfies SyncOperationResult & Record<string, unknown>;
    this.applicationLogger.info({
      level:
        overallStatus === 'failed'
          ? 'error'
          : overallStatus === 'partial'
            ? 'warn'
            : 'info',
      kind: 'integration',
      source: 'TelegramChannelsService',
      event:
        overallStatus === 'failed'
          ? 'telegram.sync.failed'
          : overallStatus === 'partial'
            ? 'telegram.sync.partial'
            : 'telegram.sync.completed',
      message: `Telegram sync finished with status ${overallStatus}.`,
      workspaceId,
      userId,
      durationMs: Date.now() - startedAt,
      metadata: { channelId, sourceAccountId: account.id, steps },
    });
    this.support.invalidateTelegramChannelReadCache(userId, workspaceId);
    return result;
  }
}
