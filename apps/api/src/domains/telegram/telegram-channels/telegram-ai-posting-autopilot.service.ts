import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import type { PostPlannerApplyDto } from './dto';
import { PrismaService } from '../../../prisma/prisma.service';
import { TelegramAiPostingGeneratorService } from './telegram-ai-posting-generator.service';
import { TelegramAiPostingTestRunService } from './telegram-ai-posting-test-run.service';
import { TelegramPostCalendarPlannerService } from './telegram-post-calendar-planner.service';
import { ModuleRef } from '@nestjs/core';
import { AiPostingAutopilotNotificationsService } from '../../operations/notifications/ai-posting-autopilot-notifications.service';
import { TelegramAiPostingAutopilotNotificationService } from './telegram-ai-posting-autopilot-notification.service';
import { classifyAutopilotError } from './telegram-ai-posting-autopilot-error';
import { WorkspaceService } from '../../../common/workspace.service';
import { notifyScheduledTaskDueWorkChanged } from '../../../common/scheduled-task-wake-notifier';
import { markTelegramAiPostingRunForReview } from './telegram-ai-posting-review-queue';

const LEASE_MS = 60 * 60_000;
const WEEK_MS = 7 * 24 * 60 * 60_000;

@Injectable()
export class TelegramAiPostingAutopilotService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly generator: TelegramAiPostingGeneratorService,
    private readonly testRuns: TelegramAiPostingTestRunService,
    private readonly planner: TelegramPostCalendarPlannerService,
    private readonly moduleRef: ModuleRef,
    private readonly workspace: WorkspaceService,
    private readonly notifications: TelegramAiPostingAutopilotNotificationService,
  ) {}

  async nextDueAt() {
    const [next, deliveryAt] = await Promise.all([
      this.prisma.telegramAiPostingSettings.findFirst({
        where: {
          autopilotEnabled: true,
          mode: { in: ['AUTOPILOT', 'REVIEW'] },
          autopilotNextRunAt: { not: null },
        },
        orderBy: { autopilotNextRunAt: 'asc' },
        select: { autopilotNextRunAt: true },
      }),
      this.moduleRef
        .resolve(AiPostingAutopilotNotificationsService, undefined, {
          strict: false,
        })
        .then((service) => service.nextDueDeliveryAt()),
    ]);
    const values = [next?.autopilotNextRunAt, deliveryAt]
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
            autopilotLeaseExpiresAt: new Date(Date.now() + LEASE_MS),
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
              autopilotNextRunAt: new Date(Date.now() + WEEK_MS),
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
        if (result.status !== 'STOPPED')
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

  private async processChannel(
    workspaceId: string,
    channelId: string,
    runId: string,
    leaseOwner: string,
  ) {
    const settings = await this.prisma.telegramAiPostingSettings.findFirst({
      where: {
        workspaceId,
        telegramChannelId: channelId,
        autopilotEnabled: true,
        autopilotLeaseOwner: leaseOwner,
        autopilotLeaseExpiresAt: { gt: new Date() },
      },
      select: {
        postsPerDay: true,
        mode: true,
        targetReadyDrafts: true,
        maxReadyDrafts: true,
        targetCoverageDays: true,
        criticalCoverageDays: true,
        configuration: true,
      },
    });
    if (!settings)
      return {
        scheduled: 0,
        generated: 0,
        readyDrafts: 0,
        scheduledInWindow: 0,
        coverageDays: 0,
        targetCoverageDays: 0,
        criticalDraftThreshold: 0,
        scheduleMode: 'NO_SCHEDULE',
        errors: [],
        status: 'STOPPED',
      };
    const actor = await this.prisma.workspaceMember.findFirst({
      where: { workspaceId },
      orderBy: { id: 'asc' },
      select: { userId: true },
    });
    if (!actor) throw new Error('AI_POSTING_WORKSPACE_MEMBER_REQUIRED');
    await this.recordStage(runId, 'LOAD_EDITORIAL_PROFILE', 'SUCCEEDED', {
      configurationVersion: true,
    });
    const now = new Date();
    const to = new Date(
      now.getTime() + settings.targetCoverageDays * 86_400_000,
    );
    const configuration = settings.configuration;
    const root =
      configuration &&
      typeof configuration === 'object' &&
      !Array.isArray(configuration)
        ? (configuration as Record<string, unknown>)
        : {};
    const planning =
      root.planning &&
      typeof root.planning === 'object' &&
      !Array.isArray(root.planning)
        ? (root.planning as Record<string, unknown>)
        : {};
    const base: Omit<PostPlannerApplyDto, 'limit'> = {
      from: now.toISOString(),
      to: to.toISOString(),
      postGroupIds: Array.isArray(planning.postGroupIds)
        ? planning.postGroupIds.filter(
            (id): id is string => typeof id === 'string',
          )
        : [],
      formatIds: Array.isArray(planning.formatIds)
        ? planning.formatIds.filter(
            (id): id is string => typeof id === 'string',
          )
        : [],
      formatWeights:
        planning.formatWeights &&
        typeof planning.formatWeights === 'object' &&
        !Array.isArray(planning.formatWeights)
          ? (planning.formatWeights as Record<string, number>)
          : {},
    };
    const targetScheduled = settings.postsPerDay * settings.targetCoverageDays;
    const errors: string[] = [];
    let scheduled = 0;
    let generated = 0;
    for (let pass = 0; pass < 3; pass++) {
      const inWindow = await this.prisma.telegramManagedPost.count({
        where: {
          workspaceId,
          telegramChannelId: channelId,
          status: 'SCHEDULED',
          scheduledAt: { gte: now, lte: to },
          adSalePlacements: { none: {} },
        },
      });
      if (inWindow >= targetScheduled) break;
      try {
        await this.setRunStage(runId, 'SCHEDULE_EXISTING_DRAFTS');
        const plannerInput = {
          ...base,
          limit: Math.min(50, targetScheduled - inWindow),
        };
        const preview = await this.planner.preview(
          actor.userId,
          channelId,
          plannerInput,
        );
        if (!preview.assignments.length) break;
        const applied = await this.planner.apply(
          actor.userId,
          channelId,
          plannerInput,
        );
        scheduled += applied.schedule.successCount;
        if (applied.schedule.failedCount) {
          errors.push(
            `${applied.schedule.failedCount} slot assignments conflicted`,
          );
          break;
        }
      } catch (error) {
        const errorType = classifyAutopilotError(error);
        errors.push(errorType);
        await this.recordStage(
          runId,
          'SCHEDULE_EXISTING_DRAFTS',
          'FAILED',
          {},
          errorType,
        );
        break;
      }
    }
    await this.recordStage(
      runId,
      'SCHEDULE_EXISTING_DRAFTS',
      errors.length ? 'PARTIAL' : 'SUCCEEDED',
      { scheduled },
      errors[0],
    );
    // Stock is counted after scheduling so already available drafts are always consumed first.
    let drafts = await this.prisma.telegramManagedPost.count({
      where: {
        workspaceId,
        telegramChannelId: channelId,
        status: 'DRAFT',
        origin: 'SYSTEM',
        text: { not: null },
        adSalePlacements: { none: {} },
      },
    });
    for (
      let pass = 0;
      drafts < settings.targetReadyDrafts &&
      drafts < settings.maxReadyDrafts &&
      pass < 20;
      pass++
    ) {
      const active = await this.prisma.telegramAiPostingSettings.findFirst({
        where: {
          workspaceId,
          telegramChannelId: channelId,
          autopilotEnabled: true,
        },
        select: { id: true },
      });
      if (!active) break;
      const amount = Math.min(
        5,
        settings.targetReadyDrafts - drafts,
        settings.maxReadyDrafts - drafts,
      );
      await this.setRunStage(runId, 'GENERATE_DRAFTS');
      let generationRun: Awaited<
        ReturnType<TelegramAiPostingGeneratorService['generate']>
      >;
      try {
        generationRun = await this.generator.generate(
          actor.userId,
          channelId,
          amount,
          'AUTOMATIC',
          runId,
        );
      } catch (error) {
        const errorType = classifyAutopilotError(error);
        await this.recordStage(
          runId,
          'GENERATE_DRAFTS',
          'FAILED',
          { requested: amount },
          errorType,
        );
        throw error;
      }
      for (let i = 0; i < generationRun.generated.length; i++) {
        if (settings.mode === 'REVIEW') continue;
        const approvalVersion = generationRun.version + i * 3;
        await this.testRuns.reviewPublication(
          actor.userId,
          channelId,
          generationRun.runId,
          i,
          approvalVersion,
          'approve',
        );
        const saved = (await this.testRuns.reviewPublication(
          actor.userId,
          channelId,
          generationRun.runId,
          i,
          approvalVersion + 1,
          'save',
        )) as { publications?: Array<{ savedPostId?: string | null }> };
        const postId = saved.publications?.[i]?.savedPostId;
        if (postId) {
          generated++;
          await this.recordStage(
            runId,
            'SAVE_GENERATED_DRAFT',
            'SUCCEEDED',
            { sourceRunId: generationRun.runId, publicationIndex: i },
            undefined,
            postId,
            i + 1,
          );
          for (const operation of generationRun.generated[i].operations ?? []) {
            const stageName =
              operation.stage === 'image'
                ? 'IMAGE_SELECTION_OR_GENERATION'
                : operation.stage === 'review'
                  ? 'CONTENT_CHECK'
                  : operation.stage === 'planning'
                    ? 'TOPIC_PLANNING'
                    : 'TEXT_GENERATION';
            await this.recordStage(
              runId,
              stageName,
              operation.status === 'SUCCEEDED' ? 'SUCCEEDED' : 'FAILED',
              {
                category: operation.category,
                model: operation.model,
                operationId: operation.operationId,
                actualCost: operation.actualCost,
              },
              operation.status === 'SUCCEEDED'
                ? undefined
                : classifyAutopilotError(new Error(operation.status)),
              postId,
              operation.attempt,
            );
          }
        }
      }
      if (settings.mode === 'REVIEW') {
        await markTelegramAiPostingRunForReview(
          this.prisma,
          workspaceId,
          generationRun.runId,
        );
      }
      const generationErrors = (generationRun.failures ?? []).map(
        (failure) => failure.code,
      );
      if (generationErrors.length)
        errors.push(
          ...generationErrors.map((code) =>
            classifyAutopilotError(new Error(code)),
          ),
        );
      await this.recordStage(
        runId,
        'GENERATE_DRAFTS',
        generationErrors.length ? 'PARTIAL' : 'SUCCEEDED',
        {
          generated: generationRun.generated.length,
          failures: generationErrors.length,
        },
        generationErrors.length
          ? classifyAutopilotError(new Error(generationErrors[0]))
          : undefined,
        undefined,
        pass + 1,
      );
      if (settings.mode === 'REVIEW') break;
      drafts = await this.prisma.telegramManagedPost.count({
        where: {
          workspaceId,
          telegramChannelId: channelId,
          status: 'DRAFT',
          origin: 'SYSTEM',
          text: { not: null },
          adSalePlacements: { none: {} },
        },
      });
      try {
        const scheduledInWindow = await this.prisma.telegramManagedPost.count({
          where: {
            workspaceId,
            telegramChannelId: channelId,
            status: 'SCHEDULED',
            scheduledAt: { gte: now, lte: to },
            adSalePlacements: { none: {} },
          },
        });
        const plannerInput = {
          ...base,
          limit: Math.max(0, Math.min(50, targetScheduled - scheduledInWindow)),
        };
        if (plannerInput.limit === 0) continue;
        const preview = await this.planner.preview(
          actor.userId,
          channelId,
          plannerInput,
        );
        if (preview.assignments.length) {
          await this.setRunStage(runId, 'SCHEDULE_GENERATED_DRAFTS');
          const applied = await this.planner.apply(
            actor.userId,
            channelId,
            plannerInput,
          );
          scheduled += applied.schedule.successCount;
          if (applied.schedule.failedCount) errors.push('SLOT_CONFLICT');
        }
        await this.recordStage(
          runId,
          'SCHEDULE_GENERATED_DRAFTS',
          errors.length ? 'PARTIAL' : 'SUCCEEDED',
          { scheduled },
        );
      } catch (error) {
        const errorType = classifyAutopilotError(error);
        errors.push(errorType);
        await this.recordStage(
          runId,
          'SCHEDULE_GENERATED_DRAFTS',
          'FAILED',
          {},
          errorType,
        );
      }
    }
    const scheduledCount = await this.prisma.telegramManagedPost.count({
      where: {
        workspaceId,
        telegramChannelId: channelId,
        status: 'SCHEDULED',
        scheduledAt: { gte: now, lte: to },
        adSalePlacements: { none: {} },
      },
    });
    const coverageDays = Math.floor(scheduledCount / settings.postsPerDay);
    const [nativeCount, localCount] = await Promise.all([
      this.prisma.telegramManagedPost.count({
        where: {
          workspaceId,
          telegramChannelId: channelId,
          status: 'SCHEDULED',
          scheduledAt: { gte: now, lte: to },
          scheduleMode: 'TELEGRAM_NATIVE',
        },
      }),
      this.prisma.telegramManagedPost.count({
        where: {
          workspaceId,
          telegramChannelId: channelId,
          status: 'SCHEDULED',
          scheduledAt: { gte: now, lte: to },
          scheduleMode: 'LOCAL',
        },
      }),
    ]);
    const scheduleMode =
      nativeCount && localCount
        ? 'MIXED'
        : nativeCount
          ? 'TELEGRAM_NATIVE'
          : localCount
            ? 'LOCAL'
            : 'NO_SCHEDULE';
    const summary = {
      scheduled,
      generated,
      readyDrafts: drafts,
      scheduledInWindow: scheduledCount,
      coverageDays,
      targetCoverageDays: settings.targetCoverageDays,
      criticalDraftThreshold:
        settings.postsPerDay * settings.criticalCoverageDays,
      scheduleMode,
      status: errors.length
        ? 'PARTIAL'
        : coverageDays < settings.criticalCoverageDays
          ? 'CRITICAL_COVERAGE'
          : 'COMPLETED',
      errors,
    };
    await this.recordStage(
      runId,
      'FINAL_CHECKS',
      summary.status === 'PARTIAL' ? 'PARTIAL' : 'SUCCEEDED',
      {
        readyDrafts: drafts,
        scheduledInWindow: scheduledCount,
        coverageDays,
        scheduleMode,
      },
    );
    return summary;
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

  private async setRunStage(runId: string, stage: string) {
    await this.prisma.telegramAiPostingAutopilotRun.update({
      where: { id: runId },
      data: { currentStage: stage },
    });
  }

  private async recordStage(
    runId: string,
    stage: string,
    status: string,
    metadata: Record<string, unknown>,
    errorType?: string,
    postId?: string,
    attempt = 1,
  ) {
    await this.prisma.telegramAiPostingAutopilotStage.create({
      data: {
        runId,
        stage,
        status,
        attempt,
        postId: postId ?? null,
        completedAt: new Date(),
        errorType: errorType ?? null,
        errorMessage: errorType ?? null,
        metadata: metadata as Prisma.InputJsonValue,
      },
    });
  }
}
