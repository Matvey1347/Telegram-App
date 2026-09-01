import {
  ConflictException,
  forwardRef,
  Inject,
  Injectable,
  Logger,
} from '@nestjs/common';
import type {
  ScheduledTaskRunSummary,
  ScheduledTaskSchedule,
} from '@telegram-system/shared';
import { randomUUID } from 'crypto';
import { sanitizeOperationalError } from '../../../common/security/operational-error';
import { PrismaService } from '../../../prisma/prisma.service';
import { computeNextRunAt } from './schedule-utils';
import { ScheduledTaskLockService } from './scheduled-task-lock.service';
import { ScheduledTaskNotificationsService } from './scheduled-task-notifications.service';
import type { ScheduledTaskDefinition } from './scheduled-task.types';

const CLAIM_TTL_MS = 10 * 60_000;
const RENEWAL_INTERVAL_MS = 60_000;

@Injectable()
export class ScheduledTaskRunnerService {
  private readonly logger = new Logger(ScheduledTaskRunnerService.name);
  private readonly ownerId = randomUUID();

  constructor(
    private readonly prisma: PrismaService,
    private readonly locks: ScheduledTaskLockService,
    @Inject(forwardRef(() => ScheduledTaskNotificationsService))
    private readonly notifications: ScheduledTaskNotificationsService,
  ) {}

  async executeScheduledOccurrence(
    definition: ScheduledTaskDefinition,
    config: ScheduledConfig,
  ) {
    const scheduledFor = config.nextScheduledRunAt!;
    const acquired = await this.acquireLock(definition, config);
    if (!acquired) return null;
    try {
      const claimTime = new Date();
      const claimed = await this.prisma.scheduledTaskConfig.updateMany({
        where: {
          id: config.id,
          updatedAt: config.updatedAt,
          enabled: true,
          nextScheduledRunAt: scheduledFor,
          OR: [
            { scheduledClaimExpiresAt: null },
            { scheduledClaimExpiresAt: { lt: claimTime } },
          ],
        },
        data: {
          scheduledClaimOwner: this.ownerId,
          scheduledClaimExpiresAt: new Date(claimTime.getTime() + CLAIM_TTL_MS),
        },
      });
      if (claimed.count !== 1) return null;

      const existing = await this.prisma.scheduledTaskRun.findUnique({
        where: {
          scheduledTaskConfigId_scheduledFor: {
            scheduledTaskConfigId: config.id,
            scheduledFor,
          },
        },
      });
      if (existing && existing.status !== 'RUNNING') {
        await this.advanceOccurrence(definition, config, scheduledFor);
        return toRunSummary(existing);
      }
      const run = existing
        ? await this.prisma.scheduledTaskRun.update({
            where: { id: existing.id },
            data: { startedAt: new Date(), finishedAt: null, error: null },
          })
        : await this.prisma.scheduledTaskRun.create({
            data: {
              taskKey: definition.key,
              workspaceId: config.workspaceId,
              scheduledTaskConfigId: config.id,
              scheduledFor,
              trigger: 'SCHEDULE',
              status: 'RUNNING',
            },
          });
      return await this.executeClaimed(definition, config, run, scheduledFor);
    } finally {
      await this.locks.release(config.lockKey, this.ownerId);
    }
  }

  async executeManual(
    definition: ScheduledTaskDefinition,
    config: ScheduledConfig,
  ) {
    const acquired = await this.acquireLock(definition, config);
    if (!acquired)
      throw new ConflictException('Scheduled task is already running');
    try {
      const run = await this.prisma.scheduledTaskRun.create({
        data: {
          taskKey: definition.key,
          workspaceId: config.workspaceId,
          trigger: 'MANUAL',
          status: 'RUNNING',
        },
      });
      return await this.executeClaimed(definition, config, run, null);
    } finally {
      await this.locks.release(config.lockKey, this.ownerId);
    }
  }

  private acquireLock(
    definition: ScheduledTaskDefinition,
    config: ScheduledConfig,
  ) {
    return this.locks.acquire({
      lockKey: config.lockKey,
      taskKey: definition.key,
      workspaceId: config.workspaceId,
      ownerId: this.ownerId,
    });
  }

  private async executeClaimed(
    definition: ScheduledTaskDefinition,
    config: ScheduledConfig,
    run: RunShape,
    scheduledFor: Date | null,
  ) {
    const startedAt = Date.now();
    const renewal = setInterval(() => {
      void this.renewClaim(config, scheduledFor).catch((error) =>
        this.logger.warn(
          `Scheduled task claim renewal failed: ${sanitizeOperationalError(error)}`,
        ),
      );
    }, RENEWAL_INTERVAL_MS);
    renewal.unref?.();
    let persisted: RunShape;
    let executionDetails: unknown;
    try {
      const result = await definition.execute({
        taskKey: definition.key,
        workspaceId: config.workspaceId,
        trigger: scheduledFor ? 'SCHEDULE' : 'MANUAL',
      });
      executionDetails = result?.details;
      const status = result?.skipped ? 'SKIPPED' : 'SUCCESS';
      persisted = await this.prisma.scheduledTaskRun.update({
        where: { id: run.id },
        data: {
          status,
          finishedAt: new Date(),
          durationMs: Date.now() - startedAt,
          resultSummary: result?.summary ?? null,
          error: null,
        },
      });
    } catch (error) {
      persisted = await this.prisma.scheduledTaskRun.update({
        where: { id: run.id },
        data: {
          status: 'FAILED',
          finishedAt: new Date(),
          durationMs: Date.now() - startedAt,
          error: sanitizeOperationalError(error),
        },
      });
    } finally {
      clearInterval(renewal);
    }
    let advancementError: unknown;
    if (scheduledFor) {
      try {
        await this.advanceOccurrence(definition, config, scheduledFor);
      } catch (error) {
        advancementError = error;
      }
    }
    await this.notifySafely(definition, config, persisted, executionDetails);
    if (advancementError) throw advancementError;
    return toRunSummary(persisted);
  }

  private async renewClaim(config: ScheduledConfig, scheduledFor: Date | null) {
    const lease = await this.locks.renew(config.lockKey, this.ownerId);
    if (lease.count !== 1) {
      throw new Error('Scheduled task execution lease was lost');
    }
    if (!scheduledFor) return;
    const claim = await this.prisma.scheduledTaskConfig.updateMany({
      where: {
        id: config.id,
        nextScheduledRunAt: scheduledFor,
        scheduledClaimOwner: this.ownerId,
      },
      data: {
        scheduledClaimExpiresAt: new Date(Date.now() + CLAIM_TTL_MS),
      },
    });
    if (claim.count !== 1) {
      throw new Error('Scheduled occurrence claim was lost');
    }
  }

  private async advanceOccurrence(
    definition: ScheduledTaskDefinition,
    config: ScheduledConfig,
    scheduledFor: Date,
  ) {
    const advanced = await this.prisma.scheduledTaskConfig.updateMany({
      where: {
        id: config.id,
        nextScheduledRunAt: scheduledFor,
        scheduledClaimOwner: this.ownerId,
      },
      data: {
        nextScheduledRunAt: definition.dueDriven
          ? null
          : computeNextRunAt(
              config.schedule as ScheduledTaskSchedule,
              scheduledFor,
            ),
        scheduledClaimOwner: null,
        scheduledClaimExpiresAt: null,
      },
    });
    if (advanced.count !== 1) {
      throw new Error('Scheduled occurrence claim was lost before completion');
    }
  }

  private async notifySafely(
    definition: ScheduledTaskDefinition,
    config: ScheduledConfig,
    run: RunShape,
    details: unknown,
  ) {
    const enabled =
      run.status === 'SUCCESS'
        ? config.notifyOnSuccess
        : run.status === 'FAILED'
          ? config.notifyOnFailure
          : false;
    try {
      await this.notifications.notify({
        taskKey: definition.key,
        taskName: definition.name,
        workspaceId: config.workspaceId,
        runId: run.id,
        status: run.status as 'SUCCESS' | 'FAILED' | 'SKIPPED',
        resultSummary: run.resultSummary,
        durationMs: run.durationMs,
        failureReason: run.error,
        details,
        enabled,
      });
    } catch (error) {
      this.logger.warn(
        `Scheduled task notification failed: ${sanitizeOperationalError(error)}`,
      );
    }
  }
}

export type ScheduledConfig = {
  id: string;
  taskKey: string;
  workspaceId: string | null;
  lockKey: string;
  enabled: boolean;
  schedule: unknown;
  notifyOnSuccess: boolean;
  notifyOnFailure: boolean;
  notificationChannel: 'SYSTEM_TELEGRAM_BOT';
  nextScheduledRunAt: Date | null;
  scheduledClaimOwner: string | null;
  scheduledClaimExpiresAt: Date | null;
  updatedAt: Date;
};

export type RunShape = {
  id: string;
  taskKey: string;
  workspaceId: string | null;
  scheduledFor: Date | null;
  trigger: 'SCHEDULE' | 'MANUAL';
  startedAt: Date;
  finishedAt: Date | null;
  status: 'RUNNING' | 'SUCCESS' | 'FAILED' | 'SKIPPED';
  durationMs: number | null;
  resultSummary: string | null;
  error: string | null;
  createdAt: Date;
};

export function toRunSummary(run: RunShape): ScheduledTaskRunSummary {
  return {
    id: run.id,
    taskKey: run.taskKey,
    workspaceId: run.workspaceId,
    scheduledFor: run.scheduledFor?.toISOString() ?? null,
    trigger: run.trigger,
    startedAt: run.startedAt.toISOString(),
    finishedAt: run.finishedAt?.toISOString() ?? null,
    status: run.status,
    durationMs: run.durationMs,
    resultSummary: run.resultSummary,
    error: run.error,
    createdAt: run.createdAt.toISOString(),
  };
}
