/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import { ConflictException, ForbiddenException } from '@nestjs/common';
import { WorkspaceRole } from '@prisma/client';
import { ScheduledTasksService } from './scheduled-tasks.service';

const now = new Date('2026-08-08T10:30:00.000Z');

describe('ScheduledTasksService', () => {
  beforeAll(() => jest.useFakeTimers());
  beforeEach(() => {
    jest.clearAllTimers();
    jest.setSystemTime(now);
  });
  afterAll(() => jest.useRealTimers());

  function setup(
    options: { enabled?: boolean; claimExpiresAt?: Date | null } = {},
  ) {
    const definition = {
      key: 'workspace.task',
      name: 'Workspace task',
      description: 'Runs in a workspace',
      scope: 'WORKSPACE_OPERATION' as const,
      defaultSchedule: {
        frequency: 'INTERVAL' as const,
        intervalMinutes: 30,
        timezone: 'Europe/Warsaw',
      },
      scheduleEditable: true,
      supportedFrequencies: ['INTERVAL' as const],
      notificationSupported: true,
      execute: jest.fn(),
    };
    const systemDefinition = {
      ...definition,
      key: 'system.task',
      scope: 'SYSTEM_MAINTENANCE' as const,
      scheduleEditable: false,
      notificationSupported: false,
    };
    const config = {
      id: 'config-1',
      taskKey: definition.key,
      workspaceId: 'workspace-1',
      scope: 'WORKSPACE_OPERATION',
      lockKey: 'workspace.task:workspace:workspace-1',
      enabled: options.enabled ?? true,
      schedule: definition.defaultSchedule,
      notifyOnSuccess: false,
      notifyOnFailure: false,
      notificationChannel: 'SYSTEM_TELEGRAM_BOT' as const,
      nextScheduledRunAt: new Date('2026-08-08T10:00:00.000Z'),
      scheduledClaimOwner: options.claimExpiresAt ? 'worker' : null,
      scheduledClaimExpiresAt: options.claimExpiresAt ?? null,
      updatedAt: new Date('2026-08-08T09:00:00.000Z'),
    };
    const prisma = {
      workspace: {
        findUnique: jest.fn().mockResolvedValue({ id: 'workspace-1', timezone: 'Europe/Warsaw' }),
        findMany: jest
          .fn()
          .mockResolvedValue([
            { id: 'workspace-1', timezone: 'Europe/Warsaw' },
          ]),
      },
      telegramChannel: { count: jest.fn().mockResolvedValue(1) },
      telegramManagedPost: { findFirst: jest.fn().mockResolvedValue(null) },
      telegramAdSalePlacement: { findFirst: jest.fn().mockResolvedValue(null) },
      greeterJoinRequest: { findFirst: jest.fn().mockResolvedValue(null) },
      greeterBroadcast: { findFirst: jest.fn().mockResolvedValue(null) },
      greeterBroadcastRecipient: { findFirst: jest.fn().mockResolvedValue(null) },
      greeterSequenceStepExecution: { findFirst: jest.fn().mockResolvedValue(null) },
      scheduledTaskConfig: {
        upsert: jest.fn().mockResolvedValue(config),
        findMany: jest.fn().mockResolvedValue(config.enabled ? [config] : []),
        findFirst: jest.fn().mockResolvedValue(null),
        update: jest
          .fn()
          .mockImplementation(({ data }) =>
            Promise.resolve({ ...config, ...data }),
          ),
        updateMany: jest.fn().mockResolvedValue({
          count: options.claimExpiresAt && options.claimExpiresAt > now ? 0 : 1,
        }),
        findUnique: jest.fn().mockResolvedValue(config),
      },
      scheduledTaskRun: {
        findFirst: jest.fn().mockResolvedValue(null),
        findMany: jest.fn().mockResolvedValue([]),
      },
    };
    const registry = {
      definitions: jest.fn().mockReturnValue([definition, systemDefinition]),
      get: jest.fn((key: string) =>
        key === definition.key
          ? definition
          : key === systemDefinition.key
            ? systemDefinition
            : null,
      ),
    };
    const runner = {
      executeScheduledOccurrence: jest.fn().mockResolvedValue(null),
      executeManual: jest.fn().mockResolvedValue({ id: 'run-1' }),
    };
    const service = new ScheduledTasksService(
      prisma as never,
      registry as never,
      runner as never,
    );
    return { service, prisma, registry, runner, definition, config };
  }

  it('delegates only persisted due candidates to the fenced runner', async () => {
    const { service, runner, definition, config, prisma } = setup();
    await service.tick();
    expect(prisma.scheduledTaskConfig.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          enabled: true,
          nextScheduledRunAt: { lte: now },
        }),
      }),
    );
    expect(runner.executeScheduledOccurrence).toHaveBeenCalledWith(
      definition,
      config,
    );
  });

  it('treats a null runner result as an attempted due-driven occurrence', async () => {
    const { service, runner, definition, config } = setup();
    definition.key = 'greeter.automations.repair';
    config.taskKey = definition.key;
    const refresh = jest.fn().mockResolvedValue(undefined);
    (
      service as unknown as { dueSchedule: { refresh: jest.Mock } }
    ).dueSchedule.refresh = refresh;

    await service.tick();

    expect(runner.executeScheduledOccurrence).toHaveBeenCalledTimes(1);
    expect(refresh).toHaveBeenCalledWith(definition.key, true);
  });

  it('rearms after a due-query failure so overdue work recovers', async () => {
    const { service, prisma } = setup();
    prisma.scheduledTaskConfig.findMany.mockRejectedValueOnce(
      new Error('temporary database failure'),
    );

    await expect(service.tick()).rejects.toThrow('temporary database failure');

    const failedQueries = prisma.scheduledTaskConfig.findMany.mock.calls.length;
    expect(jest.getTimerCount()).toBe(1);
    await jest.advanceTimersByTimeAsync(29_999);
    expect(prisma.scheduledTaskConfig.findMany).toHaveBeenCalledTimes(
      failedQueries,
    );
  });

  it('does not run a recurring database poll after bootstrap of a truly idle registry', async () => {
    const { service, prisma } = setup({ enabled: true });
    prisma.scheduledTaskConfig.findFirst.mockResolvedValue(null);
    await service.onModuleInit();

    expect(prisma.scheduledTaskConfig.findFirst).toHaveBeenCalledTimes(2);
    const configQueriesAfterBootstrap = prisma.scheduledTaskConfig.findMany.mock.calls.length;
    jest.advanceTimersByTime(24 * 60 * 60 * 1000);
    expect(prisma.scheduledTaskConfig.findMany).toHaveBeenCalledTimes(configQueriesAfterBootstrap);
    expect(prisma.scheduledTaskRun.findMany).not.toHaveBeenCalled();
  });

  it('rearms the next due timer after a configuration change', async () => {
    const { service, prisma } = setup({ enabled: false });
    await service.updateForMembership(
      { workspaceId: 'workspace-1', role: WorkspaceRole.admin },
      'workspace.task',
      { enabled: true },
    );
    expect(prisma.scheduledTaskConfig.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          enabled: true,
          nextScheduledRunAt: { not: null },
        }),
      }),
    );
  });

  it('does not write an unchanged due timestamp', async () => {
    const { service, prisma, config } = setup();
    const internals = service as unknown as {
      dueSchedule: {
        nextDueAt: jest.Mock;
        guardNoProgress: jest.Mock;
      };
      refreshDueDrivenTask(taskKey: string): Promise<void>;
    };
    internals.dueSchedule.nextDueAt = jest
      .fn()
      .mockResolvedValue(config.nextScheduledRunAt);
    internals.dueSchedule.guardNoProgress = jest
      .fn()
      .mockReturnValue(config.nextScheduledRunAt);

    await internals.refreshDueDrivenTask(config.taskKey);

    expect(prisma.scheduledTaskConfig.updateMany).not.toHaveBeenCalled();
  });

  it('keeps exactly one timer across repeated reschedules', async () => {
    const { service, prisma } = setup();
    prisma.scheduledTaskConfig.findFirst.mockResolvedValue({
      nextScheduledRunAt: new Date('2026-08-08T11:00:00.000Z'),
    });
    const internals = service as unknown as {
      scheduleNextWake(): Promise<void>;
    };

    await Promise.all([
      internals.scheduleNextWake(),
      internals.scheduleNextWake(),
      internals.scheduleNextWake(),
    ]);

    expect(jest.getTimerCount()).toBe(1);
  });

  it('manual run uses the same runner and workspace config', async () => {
    const { service, runner, definition, config } = setup();
    await service.runNowForMembership(
      { workspaceId: 'workspace-1', role: WorkspaceRole.admin },
      definition.key,
    );
    expect(runner.executeManual).toHaveBeenCalledWith(definition, config);
  });

  it('re-enables from a fresh deterministic future occurrence', async () => {
    const { service, prisma } = setup({ enabled: false });
    await service.updateForMembership(
      { workspaceId: 'workspace-1', role: WorkspaceRole.admin },
      'workspace.task',
      { enabled: true },
    );
    expect(prisma.scheduledTaskConfig.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          enabled: true,
          nextScheduledRunAt: new Date('2026-08-08T11:00:00.000Z'),
          scheduledClaimOwner: null,
        }),
      }),
    );
  });

  it('disabling clears the due occurrence', async () => {
    const { service, prisma } = setup();
    await service.updateForMembership(
      { workspaceId: 'workspace-1', role: WorkspaceRole.owner },
      'workspace.task',
      { enabled: false },
    );
    expect(prisma.scheduledTaskConfig.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          enabled: false,
          nextScheduledRunAt: null,
        }),
      }),
    );
  });

  it('rejects cadence changes while an occurrence has a live claim', async () => {
    const { service } = setup({
      claimExpiresAt: new Date('2026-08-08T10:35:00.000Z'),
    });
    await expect(
      service.updateForMembership(
        { workspaceId: 'workspace-1', role: WorkspaceRole.admin },
        'workspace.task',
        { enabled: false },
      ),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('rejects a cadence edit when a claim wins after the config read', async () => {
    const { service, prisma } = setup();
    prisma.scheduledTaskConfig.updateMany.mockResolvedValueOnce({ count: 0 });
    await expect(
      service.updateForMembership(
        { workspaceId: 'workspace-1', role: WorkspaceRole.admin },
        'workspace.task',
        { enabled: false },
      ),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(prisma.scheduledTaskConfig.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          updatedAt: new Date('2026-08-08T09:00:00.000Z'),
        }),
      }),
    );
  });

  it('allows notification-only updates without clearing an active claim', async () => {
    const { service, prisma } = setup({
      claimExpiresAt: new Date('2026-08-08T10:35:00.000Z'),
    });
    await service.updateForMembership(
      { workspaceId: 'workspace-1', role: WorkspaceRole.admin },
      'workspace.task',
      {
        notifications: {
          notifyOnSuccess: true,
          notifyOnFailure: false,
          channel: 'SYSTEM_TELEGRAM_BOT',
        },
      },
    );
    expect(prisma.scheduledTaskConfig.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.not.objectContaining({ scheduledClaimOwner: null }),
      }),
    );
  });

  it('maps the persisted occurrence timestamp in list responses', async () => {
    const { service } = setup();
    const response = await service.listForMembership({
      workspaceId: 'workspace-1',
      role: WorkspaceRole.member,
    });
    expect(response.items[0]?.nextRunAt).toBe('2026-08-08T10:00:00.000Z');
    expect(response.items[0]?.canRunNow).toBe(false);
  });

  it('rejects regular member edits and manual runs', async () => {
    const { service } = setup();
    const membership = {
      workspaceId: 'workspace-1',
      role: WorkspaceRole.member,
    };
    await expect(
      service.updateForMembership(membership, 'workspace.task', {
        enabled: false,
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    await expect(
      service.runNowForMembership(membership, 'workspace.task'),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('does not expose system maintenance tasks through workspace settings', async () => {
    const { service } = setup();
    await expect(
      service.updateForMembership(
        { workspaceId: 'workspace-1', role: WorkspaceRole.admin },
        'system.task',
        { enabled: false },
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });
});
