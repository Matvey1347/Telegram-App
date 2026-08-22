import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import type {
  SyncStepResult,
  TelegramChannelSyncProgressItem,
} from '@telegram-system/shared';
import { ResponseCacheService } from '../../../common/response-cache.service';
import { WorkspaceService } from '../../../common/workspace.service';
import { normalizeTelegramUsername } from '../../../telegram/shared/telegram-import.helpers';
import { normalizeTelegramChannelId } from '../../../telegram/shared/telegram-post-url';
import { SyncNowDto } from './dto';
import { TelegramChannelAnalyticsService } from './telegram-channel-analytics.service';
import {
  BulkProgressCallback,
  TelegramChannelSyncSelection,
  TelegramTextEditOutcome,
} from './telegram-channels.internal';

@Injectable()
export class TelegramChannelsSupportService {
  constructor(
    private readonly workspaceService: WorkspaceService,
    private readonly responseCache: ResponseCacheService,
    private readonly analyticsService: TelegramChannelAnalyticsService,
  ) {}
  private readonly logger = new Logger('TelegramChannelsService');

  public workspace(userId: string) {
    return this.workspaceService.resolveWorkspaceIdForUser(userId);
  }

  public cacheScopePrefix(userId: string, workspaceId: string) {
    return `api:${userId}:${workspaceId || 'no-workspace'}`;
  }

  public managedPostsCalendarCacheKey(
    userId: string,
    workspaceId: string,
    channelId: string,
    fromIso: string,
    toIso: string,
  ) {
    return `${this.cacheScopePrefix(userId, workspaceId)}:GET:/telegram-channels/${channelId}/managed-posts/calendar?from=${fromIso}&to=${toIso}`;
  }

  public invalidateTelegramChannelReadCache(
    userId: string,
    workspaceId: string,
  ) {
    this.responseCache.clearByPrefix(
      `${this.cacheScopePrefix(userId, workspaceId)}:GET:/telegram-channels`,
    );
    this.responseCache.clearByPrefix(
      `${this.cacheScopePrefix(userId, '')}:GET:/telegram-channels`,
    );
    // Availability is derived from synced organic posts, so it cannot outlive a channel sync.
    this.responseCache.clearByPrefix(
      `telegram-ad-sales:availability:${workspaceId}:`,
    );
  }

  public telegramTextEditNote(result: TelegramTextEditOutcome) {
    return result.updatedCount > 0
      ? 'Text was edited in Telegram.'
      : 'Telegram text already matched the live post.';
  }

  public isBotMessageNotModified(description?: string | null) {
    const value = String(description || '').toLowerCase();
    return (
      value.includes('message is not modified') ||
      value.includes(
        'specified new message content and reply markup are exactly the same',
      )
    );
  }

  public async notifyTaskProgress(
    onProgress: BulkProgressCallback | undefined,
    current: number,
    total: number,
    message: string,
  ) {
    if (!onProgress) return;
    await onProgress(
      {
        phase: 'sync_step',
        message,
      },
      current,
      total,
    );
  }

  public async notifyInviteLinksProgress(
    onProgress: BulkProgressCallback | undefined,
    current: number,
    total: number,
    item: TelegramChannelSyncProgressItem,
  ) {
    if (!onProgress) return;
    await onProgress(item, current, total);
  }

  public async notifyDetailedTaskProgress(
    onProgress: BulkProgressCallback | undefined,
    current: number,
    total: number,
    message: string,
  ) {
    await this.notifyInviteLinksProgress(onProgress, current, total, {
      phase: 'sync_step',
      message,
    });
  }

  public async createAudienceSnapshotSafely(
    channelId: string,
    source = 'sync',
  ) {
    try {
      return await this.analyticsService.createAudienceSnapshot(
        channelId,
        source,
      );
    } catch (error) {
      this.logger.warn(
        `Audience snapshot skipped for channel=${channelId}: ${error instanceof Error ? error.message : 'unknown error'}`,
      );
      return null;
    }
  }

  public toUtcDay(value: Date) {
    return new Date(
      Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()),
    );
  }

  public syncStepSuccess(
    step: string,
    startedAt: number,
    message: string,
    metadata?: Record<string, unknown>,
  ): SyncStepResult {
    return {
      step,
      status: 'success' as const,
      errorCode: null,
      message,
      durationMs: Date.now() - startedAt,
      metadata: metadata || {},
    };
  }

  public syncStepPartial(
    step: string,
    startedAt: number,
    message: string,
    metadata?: Record<string, unknown>,
  ): SyncStepResult {
    return {
      step,
      status: 'partial' as const,
      errorCode: null,
      message,
      durationMs: Date.now() - startedAt,
      metadata: metadata || {},
    };
  }

  public syncStepFailure(
    step: string,
    startedAt: number,
    error: unknown,
    errorCode: string,
    fallbackMessage: string,
  ): SyncStepResult {
    return {
      step,
      status: 'failed' as const,
      errorCode,
      message: error instanceof Error ? error.message : fallbackMessage,
      durationMs: Date.now() - startedAt,
      metadata: {},
    };
  }

  public syncStepSkipped(
    step: string,
    startedAt: number,
    message: string,
    metadata?: Record<string, unknown>,
  ): SyncStepResult {
    return {
      step,
      status: 'skipped' as const,
      errorCode: null,
      message,
      durationMs: Date.now() - startedAt,
      metadata: metadata || {},
    };
  }

  public channelSyncSelection(channel: Partial<TelegramChannelSyncSelection>) {
    return {
      syncIncludePublicInfo: channel.syncIncludePublicInfo ?? true,
      syncIncludeInviteLinks: channel.syncIncludeInviteLinks ?? true,
      syncIncludeHistoricalPosts: channel.syncIncludeHistoricalPosts ?? true,
      syncIncludePostMetrics: channel.syncIncludePostMetrics ?? true,
      syncIncludeOlderPosts: channel.syncIncludeOlderPosts ?? true,
      syncIncludeChannelStats: channel.syncIncludeChannelStats ?? true,
      syncIncludeManagedPosts: channel.syncIncludeManagedPosts ?? true,
      syncIncludeAudienceSnapshot: channel.syncIncludeAudienceSnapshot ?? true,
    } satisfies TelegramChannelSyncSelection;
  }

  public resolveSyncSelection(
    channel: Partial<TelegramChannelSyncSelection>,
    dto?: SyncNowDto,
  ) {
    const stored = this.channelSyncSelection(channel);
    return {
      syncIncludePublicInfo:
        dto?.syncIncludePublicInfo ?? stored.syncIncludePublicInfo,
      syncIncludeInviteLinks:
        dto?.syncIncludeInviteLinks ?? stored.syncIncludeInviteLinks,
      syncIncludeHistoricalPosts:
        dto?.syncIncludeHistoricalPosts ?? stored.syncIncludeHistoricalPosts,
      syncIncludePostMetrics:
        dto?.syncIncludePostMetrics ?? stored.syncIncludePostMetrics,
      syncIncludeOlderPosts:
        dto?.syncIncludeOlderPosts ?? stored.syncIncludeOlderPosts,
      syncIncludeChannelStats:
        dto?.syncIncludeChannelStats ?? stored.syncIncludeChannelStats,
      syncIncludeManagedPosts:
        dto?.syncIncludeManagedPosts ?? stored.syncIncludeManagedPosts,
      syncIncludeAudienceSnapshot:
        dto?.syncIncludeAudienceSnapshot ?? stored.syncIncludeAudienceSnapshot,
    } satisfies TelegramChannelSyncSelection;
  }

  public syncSelectionHasAnyEnabled(selection: TelegramChannelSyncSelection) {
    return Object.values(selection).some(Boolean);
  }

  public syncSelectionTotalSteps(selection: TelegramChannelSyncSelection) {
    const includesHistorical =
      selection.syncIncludeInviteLinks || selection.syncIncludeHistoricalPosts;
    return (
      Number(selection.syncIncludePublicInfo) +
      Number(includesHistorical) +
      Number(selection.syncIncludePostMetrics) +
      Number(selection.syncIncludeOlderPosts) +
      Number(selection.syncIncludeChannelStats) +
      Number(selection.syncIncludeManagedPosts) +
      Number(selection.syncIncludeAudienceSnapshot) +
      1
    );
  }

  public normalizeUsername(value?: string | null) {
    return normalizeTelegramUsername(value);
  }

  public normalizeChatId(value?: string | null) {
    return normalizeTelegramChannelId(value);
  }

  public toOptionalDate(value: string | Date | null | undefined) {
    if (value === undefined) return undefined;
    if (value === null) return null;
    const date = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(date.getTime())) {
      throw new BadRequestException('Invalid sync cutoff date.');
    }
    return date;
  }
}
