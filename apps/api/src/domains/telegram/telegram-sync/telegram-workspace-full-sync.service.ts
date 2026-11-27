import { AdCampaignInviteWindowsService } from '../../growth/ad-campaigns/ad-campaign-invite-windows.service';
import { loadDueCampaignInviteWindows } from '../../growth/ad-campaigns/ad-campaign-invite-window-sync';
import {
  BadRequestException,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { ContextIdFactory, ModuleRef } from '@nestjs/core';
import type {
  BulkActionResultItem,
  TelegramChannelSyncProgressItem,
  TelegramWorkspaceFullSyncResult,
  TelegramWorkspaceSyncProgressItem,
  TelegramWorkspaceSyncSelection,
} from '@telegram-system/shared';
import { sanitizeOperationalError } from '../../../common/security/operational-error';
import { PrismaService } from '../../../prisma/prisma.service';
import { TelegramChannelSyncOrchestrator } from '../telegram-channels/telegram-channel-sync.orchestrator';

export type TelegramWorkspaceFullSyncActor =
  | { type: 'SYSTEM_BOT'; userId: string }
  | { type: 'MANUAL'; userId: string }
  | { type: 'SCHEDULED_TASK' };

@Injectable()
export class TelegramWorkspaceFullSyncService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly moduleRef: ModuleRef,
  ) {}

  async syncWorkspace(input: {
    workspaceId: string;
    actor: TelegramWorkspaceFullSyncActor;
    selection?: TelegramWorkspaceSyncSelection;
    onProgress?: (
      item: TelegramWorkspaceSyncProgressItem,
      current: number,
      total: number,
    ) => void;
    signal?: AbortSignal;
  }): Promise<TelegramWorkspaceFullSyncResult> {
    if (input.selection && !Object.values(input.selection).some(Boolean)) {
      throw new BadRequestException('Select at least one sync section');
    }
    const startedAt = Date.now();
    const [workspace, channels, actorUserId] = await Promise.all([
      this.prisma.workspace.findUniqueOrThrow({
        where: { id: input.workspaceId },
        select: { name: true },
      }),
      this.prisma.telegramChannel.findMany({
        where: {
          workspaceId: input.workspaceId,
          isActive: true,
          archivedAt: null,
          // Manual "Sync all" covers only channels this workspace can
          // administer in Telegram, never every catalog channel it tracks.
          ...(input.actor.type === 'MANUAL'
            ? { adminLinks: { some: {} } }
            : {}),
          ...(input.actor.type !== 'MANUAL'
            ? {
                autoSyncEnabled: true,
                adminLinks: {
                  some: {
                    telegramUserAccountIntegration: {
                      isActive: true,
                      status: 'connected',
                    },
                  },
                },
              }
            : {}),
        },
        orderBy: { title: 'asc' },
        select: {
          id: true,
          title: true,
          syncIncludePublicInfo: true,
          syncIncludeInviteLinks: true,
          syncIncludeHistoricalPosts: true,
          syncIncludePostMetrics: true,
          syncIncludeOlderPosts: true,
          syncIncludeChannelStats: true,
          syncIncludeManagedPosts: true,
          syncIncludeAudienceSnapshot: true,
          ...(input.actor.type === 'SCHEDULED_TASK' ? {
            inviteLinks: {
              where: { isRevoked: false,
                OR: [{ adCampaign: { endedAt: null } }, { botRequestTrackingCampaigns: { some: { adCampaign: { endedAt: null } } } }],
              },
              select: { id: true }, take: 1,
            },
          } : {}),
          adminLinks: {
            where: {
              telegramUserAccountIntegration: {
                isActive: true,
                status: 'connected',
              },
            },
            orderBy: { createdAt: 'desc' },
            take: 1,
            select: { telegramUserAccountIntegrationId: true },
          },
        },
      }),
      this.actorUserId(input.workspaceId, input.actor),
    ]);

    const contextId = ContextIdFactory.create();
    this.moduleRef.registerRequestByContextId(
      { headers: { 'x-workspace-id': input.workspaceId } },
      contextId,
    );
    const channelService = await this.moduleRef.resolve(
      TelegramChannelSyncOrchestrator,
      contextId,
      { strict: false },
    );
    const dueWindows = input.actor.type === 'SCHEDULED_TASK'
      ? await loadDueCampaignInviteWindows(
          this.prisma, input.workspaceId,
          channels.filter(({ inviteLinks }) => inviteLinks?.length).map(({ id }) => id),
          new Date(startedAt),
        )
      : undefined;
    let inviteWindows: Promise<AdCampaignInviteWindowsService> | undefined;
    let successful = 0;
    let failed = 0;
    let skipped = 0;
    const failures: TelegramWorkspaceFullSyncResult['failures'] = [];

    for (const [index, channel] of channels.entries()) {
      input.signal?.throwIfAborted();
      const current = index + 1;
      const notify = (
        item: Omit<
          TelegramWorkspaceSyncProgressItem,
          'channelId' | 'channelTitle' | 'successful' | 'failed' | 'skipped'
        >,
      ) =>
        input.onProgress?.(
          {
            ...item,
            channelId: channel.id,
            channelTitle: channel.title,
            successful,
            failed,
            skipped,
          },
          current,
          channels.length,
        );
      const hasTrackedLinks = input.actor.type === 'SCHEDULED_TASK' && Boolean(channel.inviteLinks?.length);
      const hasSelection = input.selection
        ? Object.values(input.selection).some(Boolean)
        : [
            channel.syncIncludePublicInfo,
            channel.syncIncludeInviteLinks || hasTrackedLinks,
            channel.syncIncludeHistoricalPosts,
            channel.syncIncludePostMetrics,
            channel.syncIncludeOlderPosts,
            channel.syncIncludeChannelStats,
            channel.syncIncludeManagedPosts,
            channel.syncIncludeAudienceSnapshot,
          ].some(Boolean);
      if (!hasSelection) {
        skipped += 1;
        notify({
          phase: 'channel_skipped',
          message: 'No synchronization sections selected for this channel.',
        });
        continue;
      }
      notify({
        phase: 'channel_started',
        message: 'Starting channel synchronization…',
      });
      try {
        const scheduledAccount =
          input.actor.type === 'SCHEDULED_TASK'
            ? channel.adminLinks[0]?.telegramUserAccountIntegrationId
            : undefined;
        const payload = input.selection
          ? {
              ...input.selection,
              ...(scheduledAccount
                ? { telegramUserAccountId: scheduledAccount }
                : {}),
              saveSelection: false,
            }
          : scheduledAccount
            ? { telegramUserAccountId: scheduledAccount, saveSelection: false,
                ...(hasTrackedLinks ? { syncIncludeInviteLinks: true } : {}), }
            : undefined;
        const channelProgress = input.onProgress
          ? (
              item: BulkActionResultItem | TelegramChannelSyncProgressItem,
              stepCurrent: number,
              stepTotal: number,
            ) =>
              notify({
                phase: 'channel_progress',
                message:
                  item.message ||
                  ('action' in item ? item.action : 'Synchronizing channel…'),
                stepPhase: 'phase' in item ? item.phase : undefined,
                stageCurrent:
                  ('stageCurrent' in item ? item.stageCurrent : undefined) ??
                  stepCurrent,
                stageTotal:
                  ('stageTotal' in item ? item.stageTotal : undefined) ??
                  stepTotal,
              })
          : undefined;
        const outcome = channelProgress
          ? await channelService.syncNow(
              actorUserId,
              channel.id,
              payload,
              channelProgress,
            )
          : await channelService.syncNow(actorUserId, channel.id, payload);
        if (outcome.status !== 'success') {
          failed += 1;
          failures.push({
            channelId: channel.id,
            channelTitle: channel.title,
            reason: this.outcomeFailureReason(outcome),
          });
          notify({
            phase: 'channel_failed',
            message: this.outcomeFailureReason(outcome),
          });
        } else {
          const window = dueWindows?.get(channel.id);
          if (window) {
            try {
              const service = await (inviteWindows ??= this.moduleRef.resolve<AdCampaignInviteWindowsService>(
                AdCampaignInviteWindowsService, contextId, { strict: false },
              ));
              await service.refresh(actorUserId, window.campaignId, [window.inviteLinkId]);
            } catch {
              notify({ phase: 'channel_progress', message: 'Campaign invite interval could not be refreshed.' });
            }
          }
          successful += 1;
          notify({
            phase: 'channel_completed',
            message: 'Channel synchronization completed.',
          });
        }
      } catch (error) {
        failed += 1;
        failures.push({
          channelId: channel.id,
          channelTitle: channel.title,
          reason: sanitizeOperationalError(error, 'Channel sync failed'),
        });
        notify({
          phase: 'channel_failed',
          message: sanitizeOperationalError(error, 'Channel sync failed'),
        });
      }
    }
    return this.result(
      workspace.name,
      channels.length,
      successful,
      failed,
      skipped,
      failures,
      startedAt,
    );
  }

  private outcomeFailureReason(outcome: {
    status: string;
    steps?: Array<{
      step?: string;
      status?: string;
      message?: string | null;
      errorCode?: string | null;
    }>;
  }) {
    const problems = (outcome.steps ?? [])
      .filter((step) => step.status === 'failed' || step.status === 'partial')
      .slice(0, 3)
      .map((step) => {
        const label = step.step || 'sync step';
        const detail =
          step.message || step.errorCode || `${step.status} result`;
        return `${label}: ${sanitizeOperationalError(detail, 'step failed')}`;
      });
    return problems.length
      ? sanitizeOperationalError(problems.join('; '), 'Channel sync failed')
      : `Channel sync finished with ${outcome.status} status`;
  }

  private async actorUserId(
    workspaceId: string,
    actor: TelegramWorkspaceFullSyncActor,
  ) {
    const membership = await this.prisma.workspaceMember.findFirst({
      where: {
        workspaceId,
        ...(actor.type === 'SYSTEM_BOT' || actor.type === 'MANUAL'
          ? { userId: actor.userId }
          : {}),
      },
      orderBy: { createdAt: 'asc' },
      select: { userId: true },
    });
    if (!membership) {
      throw new ForbiddenException(
        'No authorized workspace actor is available',
      );
    }
    return membership.userId;
  }

  private result(
    workspaceName: string,
    total: number,
    successful: number,
    failed: number,
    skipped: number,
    failures: TelegramWorkspaceFullSyncResult['failures'],
    startedAt: number,
  ): TelegramWorkspaceFullSyncResult {
    const durationMs = Date.now() - startedAt;
    return {
      workspaceName,
      total,
      successful,
      failed,
      skipped,
      durationMs,
      summary: `Synced ${successful}/${total} channels${failed ? `, ${failed} failed` : ''}${skipped ? `, ${skipped} skipped` : ''}.`,
      failures,
    };
  }
}
