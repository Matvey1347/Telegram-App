import { ForbiddenException, Injectable } from '@nestjs/common';
import { ContextIdFactory, ModuleRef } from '@nestjs/core';
import { sanitizeOperationalError } from '../../../common/security/operational-error';
import { PrismaService } from '../../../prisma/prisma.service';
import { TelegramChannelsService } from '../telegram-channels/telegram-channels.service';

export type TelegramWorkspaceFullSyncActor =
  | { type: 'SYSTEM_BOT'; userId: string }
  | { type: 'SCHEDULED_TASK' };

export type TelegramWorkspaceFullSyncResult = {
  workspaceName: string;
  total: number;
  successful: number;
  failed: number;
  skipped: number;
  durationMs: number;
  summary: string;
  failures: Array<{ channelId: string; channelTitle: string; reason: string }>;
};

@Injectable()
export class TelegramWorkspaceFullSyncService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly moduleRef: ModuleRef,
  ) {}

  async syncWorkspace(input: {
    workspaceId: string;
    actor: TelegramWorkspaceFullSyncActor;
  }): Promise<TelegramWorkspaceFullSyncResult> {
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
          autoSyncEnabled: true,
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
        },
      }),
      this.actorUserId(input.workspaceId, input.actor),
    ]);

    if (process.env.TELEGRAM_MTTPROTO_SYNC_ENABLED === 'false') {
      return this.result(
        workspace.name,
        channels.length,
        0,
        0,
        channels.length,
        [],
        startedAt,
      );
    }

    const contextId = ContextIdFactory.create();
    this.moduleRef.registerRequestByContextId(
      { headers: { 'x-workspace-id': input.workspaceId } },
      contextId,
    );
    const channelService = await this.moduleRef.resolve(
      TelegramChannelsService,
      contextId,
      { strict: false },
    );
    let successful = 0;
    let failed = 0;
    let skipped = 0;
    const failures: TelegramWorkspaceFullSyncResult['failures'] = [];

    for (const channel of channels) {
      const hasSelection = [
        channel.syncIncludePublicInfo,
        channel.syncIncludeInviteLinks,
        channel.syncIncludeHistoricalPosts,
        channel.syncIncludePostMetrics,
        channel.syncIncludeOlderPosts,
        channel.syncIncludeChannelStats,
        channel.syncIncludeManagedPosts,
        channel.syncIncludeAudienceSnapshot,
      ].some(Boolean);
      if (!hasSelection) {
        skipped += 1;
        continue;
      }
      try {
        const outcome = await channelService.syncNow(actorUserId, channel.id);
        if (outcome.status !== 'success') {
          failed += 1;
          failures.push({
            channelId: channel.id,
            channelTitle: channel.title,
            reason: this.outcomeFailureReason(outcome),
          });
        } else {
          successful += 1;
        }
      } catch (error) {
        failed += 1;
        failures.push({
          channelId: channel.id,
          channelTitle: channel.title,
          reason: sanitizeOperationalError(error, 'Channel sync failed'),
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
      .filter(
        (step) => step.status === 'failed' || step.status === 'partial',
      )
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
        ...(actor.type === 'SYSTEM_BOT' ? { userId: actor.userId } : {}),
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
