import { AUTOPILOT_LEASE_MS } from './telegram-ai-posting-autopilot-policy';
import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../../../prisma/prisma.service';
import { ContextIdFactory, ModuleRef } from '@nestjs/core';
import { AiPostingAutopilotNotificationsService } from '../../operations/notifications/ai-posting-autopilot-notifications.service';
import { TelegramAiPostingAutopilotNotificationService } from './telegram-ai-posting-autopilot-notification.service';
import { classifyAutopilotError } from './telegram-ai-posting-autopilot-error';
import { WorkspaceService } from '../../../common/workspace.service';
import { notifyScheduledTaskDueWorkChanged } from '../../../common/scheduled-task-wake-notifier';
import { TelegramAiPostingAutopilotChannelService } from './telegram-ai-posting-autopilot-channel.service';



@Injectable()
export class TelegramAiPostingAutopilotService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly moduleRef: ModuleRef,
    private readonly workspace: WorkspaceService,
    private readonly notifications: TelegramAiPostingAutopilotNotificationService,
  ) {}

  async nextDueAt() {
    const now = new Date();
    const [next, leased, deliveryAt] = await Promise.all([
      this.prisma.telegramAiPostingSettings.findFirst({
        where: {
          autopilotEnabled: true,
          mode: { in: ['AUTOPILOT', 'REVIEW'] },
          autopilotNextRunAt: { not: null },
          OR: [{ autopilotLeaseExpiresAt: null }, { autopilotLeaseExpiresAt: { lte: now } }],
        },
        orderBy: { autopilotNextRunAt: 'asc' },
        select: { autopilotNextRunAt: true },
      }),
      this.prisma.telegramAiPostingSettings.findFirst({
        where: {
          autopilotEnabled: true, mode: { in: ['AUTOPILOT', 'REVIEW'] },
          autopilotNextRunAt: { lte: now }, autopilotLeaseExpiresAt: { gt: now },
        },
        orderBy: { autopilotLeaseExpiresAt: 'asc' },
        select: { autopilotLeaseExpiresAt: true },
      }),
      this.moduleRef
        .resolve(AiPostingAutopilotNotificationsService, undefined, {
          strict: false,
        })
        .then((service) => service.nextDueDeliveryAt()),
    ]);
    const values = [next?.autopilotNextRunAt, leased?.autopilotLeaseExpiresAt, deliveryAt]
      .filter((value): value is Date => value instanceof Date)
      .sort((left, right) => left.getTime() - right.getTime());
    return values[0] ?? null;
  }

  async processDueBatch(limit = 20) {
    const now = new Date();
    const due = await this.prisma.telegramAiPostingSettings.findMany({
      where: {
        autopilotEnabled: true,
        mode: { in: ['AUTOPILOT', 'REVIEW'] },
        autopilotNextRunAt: { lte: now },
        OR: [
          { autopilotLeaseExpiresAt: null },
          { autopilotLeaseExpiresAt: { lte: now } },
        ],
      },
      orderBy: { autopilotNextRunAt: 'asc' },
      take: Math.min(20, Math.max(1, limit)),
      select: {
        id: true,
        workspaceId: true,
        telegramChannelId: true,
        configurationVersion: true,
        autopilotNextRunAt: true,
        autopilotRetryOfRunId: true,
      },
    });
    const totals = {
      processed: 0,
      scheduled: 0,
      generated: 0,
      failed: 0,
      notificationRetries: 0,
      notificationFailures: 0,
    };
    try {
      const notifications = await this.moduleRef.resolve(
        AiPostingAutopilotNotificationsService,
        undefined,
        { strict: false },
      );
      const retryResult = await notifications.retryDueDeliveries(50);
      totals.notificationRetries = retryResult.delivered;
      totals.notificationFailures = retryResult.failed;
    } catch {
      totals.notificationFailures++;
    }
    if (due.length) {
      const retentionCutoff = new Date(now.getTime() - 90 * 24 * 60 * 60_000);
      try {
        await this.prisma.telegramAiPostingAutopilotRun.deleteMany({
          where: { createdAt: { lt: retentionCutoff } },
        });
      } catch {
        // Retention cleanup must not block active channel runs.
      }
    }
    for (const row of due) {
      const owner = randomUUID();
      let claim: { count: number };
      try {
        claim = await this.prisma.telegramAiPostingSettings.updateMany({
          where: {
            id: row.id,
            autopilotEnabled: true,
            mode: { in: ['AUTOPILOT', 'REVIEW'] },
            autopilotNextRunAt: row.autopilotNextRunAt,
            OR: [
              { autopilotLeaseExpiresAt: null },
              { autopilotLeaseExpiresAt: { lte: now } },
            ],
          },
          data: {
            autopilotLeaseOwner: owner,
            autopilotLeaseExpiresAt: new Date(Date.now() + AUTOPILOT_LEASE_MS),
          },
        });
      } catch {
        totals.failed++;
        continue;
      }
      if (!claim.count) continue;
      totals.processed++;
      let run: { id: string } | null = null;
      try {
        run = await this.prisma.telegramAiPostingAutopilotRun.create({
          data: {
            workspaceId: row.workspaceId,
            telegramChannelId: row.telegramChannelId,
            settingsVersion: row.configurationVersion,
            retryOfRunId: row.autopilotRetryOfRunId,
            trigger: row.autopilotRetryOfRunId ? 'MANUAL_RETRY' : 'WEEKLY_DUE',
            status: 'RUNNING',
            currentStage: 'START',
          },
        });
      } catch {
        totals.failed++;
        await this.prisma.telegramAiPostingSettings
          .updateMany({
            where: {
              id: row.id,
              autopilotLeaseOwner: owner,
              autopilotEnabled: true,
              mode: { in: ['AUTOPILOT', 'REVIEW'] },
            },
            data: {
              autopilotNextRunAt: new Date(Date.now() + 60 * 60_000),
              autopilotLeaseOwner: null,
              autopilotLeaseExpiresAt: null,
              autopilotLastStatus: 'FAILED',
              autopilotLastError: 'RUN_HISTORY_WRITE_FAILED',
            },
          })
          .catch(() => undefined);
        continue;
      }
      try {
        const result = await this.processChannel(
          row.workspaceId,
          row.telegramChannelId,
          run.id,
          owner,
        );
        totals.scheduled += result.scheduled;
        totals.generated += result.generated;
        if (result.status === 'STOPPED') {
          await this.prisma.telegramAiPostingSettings.updateMany({
            where: { id: row.id, autopilotLeaseOwner: owner },
            data: { autopilotLeaseOwner: null, autopilotLeaseExpiresAt: null },
          });
          await this.prisma.telegramAiPostingAutopilotRun.update({
            where: { id: run.id },
            data: {
              status: 'STOPPED',
              currentStage: 'STOPPED',
              completedAt: new Date(),
              summary: result,
            },
          });
          continue;
        }
        const released = await this.prisma.telegramAiPostingSettings.updateMany(
          {
            where: {
              id: row.id,
              autopilotLeaseOwner: owner,
              autopilotEnabled: true,
              autopilotLeaseExpiresAt: { gt: new Date() },
            },
            data: {
              autopilotNextRunAt: new Date(Date.now() + result.nextCheckHours * 60 * 60_000),
              autopilotLeaseOwner: null,
              autopilotLeaseExpiresAt: null,
              autopilotLastRunAt: new Date(),
              autopilotLastStatus: result.status,
              autopilotLastError:
                result.errors.join('; ').slice(0, 1000) || null,
              autopilotLastSummary: result,
              autopilotRetryOfRunId: null,
            },
          },
        );
        if (!released.count) {
          const current = await this.prisma.telegramAiPostingSettings.findFirst(
            {
              where: {
                workspaceId: row.workspaceId,
                telegramChannelId: row.telegramChannelId,
              },
              select: { autopilotEnabled: true },
            },
          );
          if (current?.autopilotEnabled === false) {
            await this.prisma.telegramAiPostingSettings.updateMany({
              where: { id: row.id, autopilotLeaseOwner: owner },
              data: { autopilotLeaseOwner: null, autopilotLeaseExpiresAt: null },
            });
            await this.prisma.telegramAiPostingAutopilotRun.update({
              where: { id: run.id },
              data: {
                status: 'STOPPED',
                currentStage: 'STOPPED',
                completedAt: new Date(),
                summary: result,
              },
            });
            continue;
          }
          throw new ConflictException('AI_POSTING_AUTOPILOT_LEASE_LOST');
        }
        await this.prisma.telegramAiPostingAutopilotRun.update({
          where: { id: run.id },
          data: {
            status: result.status,
            currentStage: 'COMPLETE',
            completedAt: new Date(),
            summary: result,
          },
        });
        if (result.generated || result.scheduled || result.errors.length)
          await this.notifications.emitRunSummary(
            row.workspaceId,
            row.telegramChannelId,
            run.id,
            result,
          );
      } catch (error) {
        totals.failed++;
        const errorType = classifyAutopilotError(error);
        await Promise.allSettled([
          this.prisma.telegramAiPostingAutopilotRun.update({
            where: { id: run.id },
            data: {
              status: 'FAILED',
              currentStage: 'FAILED',
              completedAt: new Date(),
              failureType: errorType,
              failureMessage: errorType,
            },
          }),
          this.prisma.telegramAiPostingAutopilotStage.create({
            data: {
              runId: run.id,
              stage: 'RUN',
              status: 'FAILED',
              attempt: 1,
              completedAt: new Date(),
              errorType,
              errorMessage: errorType,
            },
          }),
          this.prisma.telegramAiPostingSettings.updateMany({
            where: {
              id: row.id,
              autopilotLeaseOwner: owner,
              autopilotEnabled: true,
            },
            data: {
              autopilotNextRunAt: new Date(Date.now() + 60 * 60_000),
              autopilotLeaseOwner: null,
              autopilotLeaseExpiresAt: null,
              autopilotLastRunAt: new Date(),
              autopilotLastStatus: 'FAILED',
              autopilotLastError: errorType,
              autopilotRetryOfRunId: null,
            },
          }),
        ]);
        try {
          await this.notifications.emitRunFailure(
            row.workspaceId,
            row.telegramChannelId,
            run.id,
            errorType,
          );
        } catch {
          // Notification failure is separately recorded by its adapter when possible.
        }
      }
    }
    return totals;
  }

  private async processChannel(workspaceId: string, channelId: string, runId: string, leaseOwner: string) {
    const contextId = ContextIdFactory.create();
    this.moduleRef.registerRequestByContextId({ headers: { 'x-workspace-id': workspaceId } }, contextId);
    const channel = await this.moduleRef.resolve(TelegramAiPostingAutopilotChannelService, contextId, { strict: false });
    return channel.run(workspaceId, channelId, runId, leaseOwner);
  }

  async listRuns(userId: string, channelId: string) {
    const workspaceId = await this.workspace.resolveWorkspaceIdForUser(userId);
    const channel = await this.prisma.telegramChannel.findFirst({
      where: { id: channelId, workspaceId },
      select: { id: true },
    });
    if (!channel) return [];
    return this.prisma.telegramAiPostingAutopilotRun.findMany({
      where: { workspaceId, telegramChannelId: channelId },
      orderBy: { createdAt: 'desc' },
      take: 30,
      include: { stages: { orderBy: { createdAt: 'asc' }, take: 50 } },
    });
  }

  async retryRun(userId: string, channelId: string, runId: string) {
    const workspaceId = await this.workspace.resolveWorkspaceIdForUser(userId);
    const run = await this.prisma.telegramAiPostingAutopilotRun.findFirst({
      where: { id: runId, workspaceId, telegramChannelId: channelId },
      select: { id: true, status: true },
    });
    if (!run) throw new NotFoundException('Content Autopilot run not found');
    if (!['FAILED', 'PARTIAL', 'CRITICAL_COVERAGE'].includes(run.status))
      throw new ConflictException('AI_POSTING_AUTOPILOT_RUN_NOT_RETRYABLE');
    const result = await this.prisma.telegramAiPostingSettings.updateMany({
      where: {
        workspaceId,
        telegramChannelId: channelId,
        autopilotEnabled: true,
      },
      data: { autopilotNextRunAt: new Date(), autopilotRetryOfRunId: run.id },
    });
    if (!result.count)
      throw new ConflictException('AI_POSTING_AUTOPILOT_DISABLED');
    notifyScheduledTaskDueWorkChanged('telegram.ai_posting.autopilot');
    return { queued: true, retryOfRunId: run.id };
  }

}
