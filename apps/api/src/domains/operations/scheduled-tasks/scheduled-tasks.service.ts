import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  OnApplicationShutdown,
  NotFoundException,
  OnModuleInit,
} from '@nestjs/common';
import { WorkspaceRole } from '@prisma/client';
import type {
  ScheduledTaskListResponse,
  ScheduledTaskSchedule,
  ScheduledTaskView,
  UpdateScheduledTaskPayload,
} from '@telegram-system/shared';
import { sanitizeOperationalError } from '../../../common/security/operational-error';
import { PrismaService } from '../../../prisma/prisma.service';
import { computeNextRunAt, normalizeSchedule } from './schedule-utils';
import { ScheduledTaskRegistryService } from './scheduled-task-registry.service';
import {
  ScheduledTaskRunnerService,
  type RunShape,
  type ScheduledConfig,
  toRunSummary,
} from './scheduled-task-runner.service';
import type { ScheduledTaskDefinition } from './scheduled-task.types';
import { DueTaskSchedule } from './due-task-schedule';
import { ScheduledTaskAutomaticEligibility } from './scheduled-task-automatic-eligibility';
import { scheduledTaskWakeNotifier } from './scheduled-task-wake-notifier';
import { ScheduledTaskWakeTimer } from './scheduled-task-wake-timer';

const SCHEDULER_RECOVERY_BACKOFF_MS = 30_000;

@Injectable()
export class ScheduledTasksService
  implements OnModuleInit, OnApplicationShutdown
{
  private readonly logger = new Logger(ScheduledTasksService.name);
  private readonly automaticEligibility: ScheduledTaskAutomaticEligibility;
  private readonly dueSchedule: DueTaskSchedule;
  private readonly wakeTimer: ScheduledTaskWakeTimer;

  constructor(
    private readonly prisma: PrismaService,
    private readonly registry: ScheduledTaskRegistryService,
    private readonly runner: ScheduledTaskRunnerService,
  ) {
    this.automaticEligibility = new ScheduledTaskAutomaticEligibility(prisma);
    this.dueSchedule = new DueTaskSchedule(prisma);
    this.wakeTimer = new ScheduledTaskWakeTimer(
      prisma,
      () => this.tick(),
      (error) =>
        this.logger.warn(
          `Scheduled task wake failed: ${sanitizeOperationalError(error)}`,
        ),
    );
  }

  async onModuleInit() {
    await this.materializeSystemDefaults();
    await this.refreshDueDrivenTasks();
    await this.automaticEligibility.recover();
    await this.scheduleNextWake();
    scheduledTaskWakeNotifier.on('changed', this.onDueWorkChanged);
  }

  onApplicationShutdown() {
    this.wakeTimer.destroy();
    scheduledTaskWakeNotifier.off('changed', this.onDueWorkChanged);
  }

  /**
   * Runs only after the timer has reached a persisted due occurrence. It is
   * deliberately not a cron: an empty system must not wake Postgres merely to
   * discover that nothing has changed.
   */
  async tick() {
    const attemptedDueDriven = new Set<string>();
    let tickFailed = false;
    try {
      const now = new Date();
      const configs = await this.prisma.scheduledTaskConfig.findMany({
        where: {
          enabled: true,
          nextScheduledRunAt: { lte: now },
          OR: [
            { scheduledClaimExpiresAt: null },
            { scheduledClaimExpiresAt: { lt: now } },
          ],
        },
        orderBy: [{ nextScheduledRunAt: 'asc' }, { taskKey: 'asc' }],
      });
      for (const config of configs) {
        const definition = this.registry.get(config.taskKey);
        if (!definition || !config.nextScheduledRunAt) continue;
        if (definition.dueDriven) {
          attemptedDueDriven.add(config.taskKey);
        }
        try {
          await this.runner.executeScheduledOccurrence(definition, config);
        } catch (error) {
          this.logger.warn(
            `Scheduled task ${config.taskKey} failed without crashing scheduler loop: ${sanitizeOperationalError(error)}`,
          );
        }
      }
    } catch (error) {
      tickFailed = true;
      throw error;
    } finally {
      if (tickFailed) {
        this.armRecoveryWake();
      } else {
        try {
          await this.refreshDueDrivenTasks(attemptedDueDriven);
          await this.scheduleNextWake();
        } catch (error) {
          this.logger.warn(
            `Could not rearm scheduled tasks: ${sanitizeOperationalError(error)}`,
          );
          this.armRecoveryWake();
        }
      }
    }
  }

  async listForMembership(
    membership: Membership,
  ): Promise<ScheduledTaskListResponse> {
    await this.materializeWorkspaceDefaults(membership.workspaceId);
    const configs = await this.prisma.scheduledTaskConfig.findMany({
      where: { workspaceId: membership.workspaceId },
      orderBy: [{ scope: 'asc' }, { taskKey: 'asc' }],
    });
    const items = await Promise.all(
      configs.map(async (config) => {
        const definition = this.registry.get(config.taskKey);
        if (!definition) return null;
        const lastRun = await this.lastRun(config.taskKey, config.workspaceId);
        return this.toView(definition, config, lastRun, membership.role);
      }),
    );
    return {
      items: items.filter((item): item is ScheduledTaskView => Boolean(item)),
    };
  }

  async updateForMembership(
    membership: Membership,
    taskKey: string,
    payload: UpdateScheduledTaskPayload,
  ) {
    if (!this.isWorkspaceAdmin(membership.role)) {
      throw new ForbiddenException('Insufficient workspace role');
    }
    await this.materializeWorkspaceDefaults(membership.workspaceId);
    const definition = this.requireDefinition(taskKey);
    if (definition.scope !== 'WORKSPACE_OPERATION') {
      throw new ForbiddenException(
        'System maintenance tasks cannot be modified from workspace settings',
      );
    }
    if (!definition.scheduleEditable && payload.schedule) {
      throw new ForbiddenException('This task schedule is read-only');
    }
    const config = await this.configFor(definition, membership.workspaceId);
    const changesCadence =
      payload.schedule !== undefined ||
      (payload.enabled !== undefined && payload.enabled !== config.enabled);
    let schedule = config.schedule as ScheduledTaskSchedule;
    if (payload.schedule) {
      try {
        schedule = this.validateScheduleForDefinition(
          definition,
          payload.schedule,
        );
      } catch (error) {
        throw new BadRequestException(
          error instanceof Error ? error.message : 'Invalid schedule',
        );
      }
    }
    const enabled = payload.enabled ?? config.enabled;
    const data: Record<string, unknown> = {};
    if (payload.enabled !== undefined) data.enabled = enabled;
    if (payload.enabled !== undefined) data.autoDisarmed = false;
    if (payload.schedule) data.schedule = schedule;
    if (changesCadence) {
      data.nextScheduledRunAt = enabled
        ? computeNextRunAt(schedule, new Date())
        : null;
      data.scheduledClaimOwner = null;
      data.scheduledClaimExpiresAt = null;
    }
    if (payload.notifications) {
      if (!definition.notificationSupported) {
        throw new ForbiddenException(
          'This task does not support notifications',
        );
      }
      data.notifyOnSuccess = payload.notifications.notifyOnSuccess;
      data.notifyOnFailure = payload.notifications.notifyOnFailure;
      data.notificationChannel = payload.notifications.channel;
    }
    let updated: ScheduledConfig;
    if (changesCadence) {
      const now = new Date();
      const changed = await this.prisma.scheduledTaskConfig.updateMany({
        where: {
          id: config.id,
          updatedAt: config.updatedAt,
          OR: [
            { scheduledClaimExpiresAt: null },
            { scheduledClaimExpiresAt: { lt: now } },
          ],
        },
        data,
      });
      if (changed.count !== 1) {
        throw new ConflictException(
          'Scheduled task changed or started running; reload and try again',
        );
      }
      updated = await this.configFor(definition, membership.workspaceId);
    } else {
      updated = await this.prisma.scheduledTaskConfig.update({
        where: { id: config.id },
        data,
      });
    }
    const lastRun = await this.lastRun(taskKey, membership.workspaceId);
    await this.scheduleNextWake();
    return this.toView(definition, updated, lastRun, membership.role);
  }

  async runNowForMembership(membership: Membership, taskKey: string) {
    if (!this.isWorkspaceAdmin(membership.role)) {
      throw new ForbiddenException('Insufficient workspace role');
    }
    await this.materializeWorkspaceDefaults(membership.workspaceId);
    const definition = this.requireDefinition(taskKey);
    if (definition.scope !== 'WORKSPACE_OPERATION') {
      throw new ForbiddenException(
        'System maintenance tasks cannot be run from workspace settings',
      );
    }
    const config = await this.configFor(definition, membership.workspaceId);
    return this.runner.executeManual(definition, config);
  }

  async runsForMembership(membership: Membership, taskKey: string, limit = 20) {
    const safeLimit = Math.max(1, Math.min(100, limit));
    return (
      await this.prisma.scheduledTaskRun.findMany({
        where: { taskKey, workspaceId: membership.workspaceId },
        orderBy: { startedAt: 'desc' },
        take: safeLimit,
      })
    ).map(toRunSummary);
  }

  private readonly onDueWorkChanged = (taskKey: string) => {
    if (taskKey.startsWith('workspace-auto-sync:')) {
      const workspaceId = taskKey.slice('workspace-auto-sync:'.length);
      void this.automaticEligibility
        .refreshWorkspace(workspaceId)
        .then(() => this.scheduleNextWake())
        .catch((error) => {
          this.logger.warn(
            `Could not refresh Auto Sync: ${sanitizeOperationalError(error)}`,
          );
          this.armRecoveryWake();
        });
      return;
    }
    if (!this.registry.get(taskKey)?.dueDriven) return;
    void this.refreshDueDrivenTask(taskKey)
      .then(() => this.scheduleNextWake())
      .catch((error) => {
        this.logger.warn(
          `Could not rearm ${taskKey}: ${sanitizeOperationalError(error)}`,
        );
        this.armRecoveryWake();
      });
  };

  private async materializeSystemDefaults() {
    const definitions = this.registry.definitions();
    for (const definition of definitions) {
      if (definition.scope === 'SYSTEM_MAINTENANCE') {
        await this.upsertDefault(definition, null, 'Europe/Warsaw');
      }
    }
  }

  private async materializeWorkspaceDefaults(workspaceId: string) {
    const workspace = await this.prisma.workspace.findUnique({
      where: { id: workspaceId },
      select: { id: true, timezone: true },
    });
    if (!workspace) return;
    for (const definition of this.registry.definitions()) {
      if (definition.scope === 'WORKSPACE_OPERATION') {
        await this.upsertDefault(definition, workspace.id, workspace.timezone);
      }
    }
    await this.automaticEligibility.refreshWorkspace(workspace.id);
  }

  private async refreshDueDrivenTasks(attempted?: Set<string>) {
    const keys = attempted
      ? [...attempted]
      : this.registry
          .definitions()
          .filter((definition) => definition.dueDriven)
          .map((definition) => definition.key);
    await Promise.all(
      keys.map((key) => this.refreshDueDrivenTask(key, attempted?.has(key))),
    );
  }

  private async refreshDueDrivenTask(taskKey: string, attempted = false) {
    await this.dueSchedule.refresh(taskKey, attempted);
  }
  private async scheduleNextWake() {
    await this.wakeTimer.scheduleNext();
  }
  private armRecoveryWake() {
    this.wakeTimer.armRecovery(SCHEDULER_RECOVERY_BACKOFF_MS);
  }

  private async upsertDefault(
    definition: ScheduledTaskDefinition,
    workspaceId: string | null,
    timezone: string,
  ) {
    const lockKey = lockKeyFor(definition.key, workspaceId);
    const schedule = scheduleWithTimezone(definition.defaultSchedule, timezone);
    const now = new Date();
    await this.prisma.scheduledTaskConfig.upsert({
      where: { lockKey },
      create: {
        workspaceId,
        taskKey: definition.key,
        scope: definition.scope,
        lockKey,
        enabled: true,
        schedule,
        notificationChannel: 'SYSTEM_TELEGRAM_BOT',
        notifyOnSuccess: false,
        notifyOnFailure: false,
        nextScheduledRunAt: definition.dueDriven
          ? null
          : computeNextRunAt(schedule, now),
      },
      update: {},
    });
  }

  private requireDefinition(taskKey: string) {
    const definition = this.registry.get(taskKey);
    if (!definition) throw new NotFoundException('Scheduled task not found');
    return definition;
  }

  private async configFor(
    definition: ScheduledTaskDefinition,
    workspaceId: string | null,
  ) {
    const config = await this.prisma.scheduledTaskConfig.findUnique({
      where: { lockKey: lockKeyFor(definition.key, workspaceId) },
    });
    if (!config) throw new NotFoundException('Scheduled task config not found');
    return config;
  }

  private validateScheduleForDefinition(
    definition: ScheduledTaskDefinition,
    schedule: ScheduledTaskSchedule,
  ) {
    const normalized = normalizeSchedule(schedule);
    if (!definition.supportedFrequencies.includes(normalized.frequency)) {
      throw new BadRequestException('Unsupported frequency for this task');
    }
    return normalized;
  }

  private async lastRun(taskKey: string, workspaceId: string | null) {
    return this.prisma.scheduledTaskRun.findFirst({
      where: { taskKey, workspaceId },
      orderBy: { startedAt: 'desc' },
    });
  }

  private toView(
    definition: ScheduledTaskDefinition,
    config: ScheduledConfig,
    lastRun: RunShape | null,
    role: WorkspaceRole,
  ): ScheduledTaskView {
    const canEdit =
      definition.scope === 'WORKSPACE_OPERATION' &&
      definition.scheduleEditable &&
      this.isWorkspaceAdmin(role);
    return {
      key: definition.key,
      name: definition.name,
      description: definition.description,
      scope: definition.scope,
      scheduleEditable: definition.scheduleEditable,
      supportedFrequencies: definition.supportedFrequencies,
      notificationSupported: definition.notificationSupported,
      defaultSchedule: definition.defaultSchedule,
      group: definition.group ?? null,
      workspaceId: config.workspaceId,
      enabled: config.enabled,
      schedule: config.schedule as ScheduledTaskSchedule,
      notifications: {
        notifyOnSuccess: config.notifyOnSuccess,
        notifyOnFailure: config.notifyOnFailure,
        channel: config.notificationChannel,
      },
      notificationState: !definition.notificationSupported
        ? 'NOT_SUPPORTED'
        : config.notifyOnSuccess || config.notifyOnFailure
          ? 'ENABLED'
          : 'DISABLED',
      lastRun: lastRun ? toRunSummary(lastRun) : null,
      nextRunAt:
        config.enabled && config.nextScheduledRunAt
          ? config.nextScheduledRunAt.toISOString()
          : null,
      canRunNow:
        definition.scope === 'WORKSPACE_OPERATION' &&
        this.isWorkspaceAdmin(role),
      canEdit,
    };
  }

  private isWorkspaceAdmin(role: WorkspaceRole) {
    return role === WorkspaceRole.owner || role === WorkspaceRole.admin;
  }
}

type Membership = { workspaceId: string; role: WorkspaceRole };

function lockKeyFor(taskKey: string, workspaceId: string | null) {
  return workspaceId
    ? `${taskKey}:workspace:${workspaceId}`
    : `${taskKey}:system`;
}

function scheduleWithTimezone(
  schedule: ScheduledTaskSchedule,
  timezone: string,
): ScheduledTaskSchedule {
  return { ...schedule, timezone };
}
