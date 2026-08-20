/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import { ScheduledTaskRunnerService } from './scheduled-task-runner.service';

const scheduledFor = new Date('2026-08-08T10:00:00.000Z');
const claimTime = new Date('2026-08-08T10:30:00.000Z');

describe('ScheduledTaskRunnerService', () => {
  function setup(
    options: {
      claimCount?: number;
      existingRun?: Record<string, unknown> | null;
      execute?: jest.Mock;
      notify?: jest.Mock;
    } = {},
  ) {
    const definition = {
      key: 'workspace.task',
      name: 'Workspace task',
      description: 'Runs safely',
      scope: 'WORKSPACE_OPERATION' as const,
      defaultSchedule: {
        frequency: 'INTERVAL' as const,
        intervalMinutes: 30,
        timezone: 'Europe/Warsaw',
      },
      scheduleEditable: true,
      supportedFrequencies: ['INTERVAL' as const],
      notificationSupported: true,
      execute:
        options.execute ?? jest.fn().mockResolvedValue({ summary: 'ok' }),
    };
    const config = {
      id: 'config-1',
      taskKey: definition.key,
      workspaceId: 'workspace-1',
      lockKey: 'workspace.task:workspace:workspace-1',
      enabled: true,
      schedule: definition.defaultSchedule,
      notifyOnSuccess: true,
      notifyOnFailure: true,
      notificationChannel: 'SYSTEM_TELEGRAM_BOT' as const,
      nextScheduledRunAt: scheduledFor,
      scheduledClaimOwner: null,
      scheduledClaimExpiresAt: null,
      updatedAt: new Date('2026-08-08T09:00:00.000Z'),
    };
    const running = {
      id: 'run-1',
      taskKey: definition.key,
      workspaceId: config.workspaceId,
      scheduledFor,
      trigger: 'SCHEDULE',
      startedAt: claimTime,
      finishedAt: null,
      status: 'RUNNING',
      durationMs: null,
      resultSummary: null,
      error: null,
      createdAt: claimTime,
    };
    const events: string[] = [];
    let updateManyCalls = 0;
    const prisma = {
      scheduledTaskConfig: {
        updateMany: jest.fn().mockImplementation(() => {
          updateManyCalls += 1;
          return Promise.resolve({
            count: updateManyCalls === 1 ? (options.claimCount ?? 1) : 1,
          });
        }),
      },
      scheduledTaskRun: {
        findUnique: jest.fn().mockResolvedValue(options.existingRun ?? null),
        create: jest.fn().mockResolvedValue(running),
        update: jest.fn().mockImplementation(({ data }) => {
          if (data.status) events.push(`persist:${data.status}`);
          return Promise.resolve({ ...running, ...data });
        }),
      },
    };
    const locks = {
      acquire: jest.fn().mockResolvedValue(true),
      renew: jest.fn().mockResolvedValue({ count: 1 }),
      release: jest.fn().mockResolvedValue(undefined),
    };
    const notify =
      options.notify ??
      jest.fn().mockImplementation(() => {
        events.push('notify');
        return Promise.resolve({ status: 'DELIVERED' });
      });
    const runner = new ScheduledTaskRunnerService(
      prisma as never,
      locks as never,
      { notify } as never,
    );
    return {
      runner,
      prisma,
      locks,
      notify,
      definition,
      config,
      running,
      events,
    };
  }

  it('allows only the CAS winner to execute an occurrence', async () => {
    const { runner, definition, config, prisma } = setup({ claimCount: 0 });
    await expect(
      runner.executeScheduledOccurrence(definition, config),
    ).resolves.toBeNull();
    expect(definition.execute).not.toHaveBeenCalled();
    expect(prisma.scheduledTaskRun.create).not.toHaveBeenCalled();
  });

  it('returns no progress while another worker holds the live lease', async () => {
    const fixture = setup();
    fixture.locks.acquire.mockResolvedValue(false);

    await expect(
      fixture.runner.executeScheduledOccurrence(
        fixture.definition,
        fixture.config,
      ),
    ).resolves.toBeNull();
    expect(
      fixture.prisma.scheduledTaskConfig.updateMany,
    ).not.toHaveBeenCalled();
    expect(fixture.definition.execute).not.toHaveBeenCalled();
  });

  it('creates the claim lease from a fresh post-lock timestamp', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-08-08T10:30:00.000Z'));
    try {
      const fixture = setup();
      fixture.locks.acquire.mockImplementation(async () => {
        jest.setSystemTime(new Date('2026-08-08T10:45:00.000Z'));
        return true;
      });
      await fixture.runner.executeScheduledOccurrence(
        fixture.definition,
        fixture.config,
      );
      expect(
        fixture.prisma.scheduledTaskConfig.updateMany.mock.calls[0][0],
      ).toEqual(
        expect.objectContaining({
          where: expect.objectContaining({
            updatedAt: fixture.config.updatedAt,
          }),
          data: expect.objectContaining({
            scheduledClaimExpiresAt: new Date('2026-08-08T10:55:00.000Z'),
          }),
        }),
      );
    } finally {
      jest.useRealTimers();
    }
  });

  it('treats missing lease renewal as lost fencing ownership', async () => {
    const fixture = setup();
    fixture.locks.renew.mockResolvedValueOnce({ count: 0 });
    await expect(
      (
        fixture.runner as unknown as {
          renewClaim: (
            config: typeof fixture.config,
            scheduledFor: Date,
          ) => Promise<void>;
        }
      ).renewClaim(fixture.config, scheduledFor),
    ).rejects.toThrow('execution lease was lost');
  });

  it('treats missing occurrence renewal as lost fencing ownership', async () => {
    const fixture = setup();
    fixture.prisma.scheduledTaskConfig.updateMany.mockResolvedValueOnce({
      count: 0,
    });
    await expect(
      (
        fixture.runner as unknown as {
          renewClaim: (
            config: typeof fixture.config,
            scheduledFor: Date,
          ) => Promise<void>;
        }
      ).renewClaim(fixture.config, scheduledFor),
    ).rejects.toThrow('occurrence claim was lost');
  });

  it('executes once when two instances race for the same occurrence', async () => {
    const fixture = setup();
    let claimed = false;
    fixture.prisma.scheduledTaskConfig.updateMany.mockImplementation(
      ({ data }: { data: { scheduledClaimOwner?: string | null } }) => {
        if (data.scheduledClaimOwner) {
          if (claimed) return Promise.resolve({ count: 0 });
          claimed = true;
        }
        return Promise.resolve({ count: 1 });
      },
    );
    const second = new ScheduledTaskRunnerService(
      fixture.prisma as never,
      fixture.locks as never,
      { notify: fixture.notify } as never,
    );
    await Promise.all([
      fixture.runner.executeScheduledOccurrence(
        fixture.definition,
        fixture.config,
      ),
      second.executeScheduledOccurrence(fixture.definition, fixture.config),
    ]);
    expect(fixture.definition.execute).toHaveBeenCalledTimes(1);
    expect(fixture.prisma.scheduledTaskRun.create).toHaveBeenCalledTimes(1);
  });

  it('persists terminal success before awaited notification and advances from scheduledFor', async () => {
    const { runner, definition, config, prisma, events, notify } = setup();
    const result = await runner.executeScheduledOccurrence(definition, config);
    expect(events).toEqual(['persist:SUCCESS', 'notify']);
    expect(prisma.scheduledTaskConfig.updateMany).toHaveBeenLastCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          nextScheduledRunAt: new Date('2026-08-08T10:30:00.000Z'),
        }),
      }),
    );
    expect(notify).toHaveBeenCalledWith(
      expect.objectContaining({ runId: 'run-1', resultSummary: 'ok' }),
    );
    expect(result?.scheduledFor).toBe('2026-08-08T10:00:00.000Z');
  });

  it('recovers an expired RUNNING occurrence without creating a duplicate run', async () => {
    const { running, ...fixture } = setup();
    fixture.prisma.scheduledTaskRun.findUnique.mockResolvedValue(running);
    await fixture.runner.executeScheduledOccurrence(
      fixture.definition,
      fixture.config,
    );
    expect(fixture.prisma.scheduledTaskRun.create).not.toHaveBeenCalled();
    expect(fixture.definition.execute).toHaveBeenCalledTimes(1);
  });

  it('advances a terminal occurrence found after a crash without re-executing it', async () => {
    const terminal = {
      ...setup().running,
      status: 'SUCCESS',
      finishedAt: claimTime,
      durationMs: 10,
      resultSummary: 'already done',
    };
    const fixture = setup({ existingRun: terminal });
    await fixture.runner.executeScheduledOccurrence(
      fixture.definition,
      fixture.config,
    );
    expect(fixture.definition.execute).not.toHaveBeenCalled();
    expect(fixture.prisma.scheduledTaskRun.create).not.toHaveBeenCalled();
  });

  it('isolates notification rejection from a successful persisted run', async () => {
    const fixture = setup({
      notify: jest.fn().mockRejectedValue(new Error('token=secret failed')),
    });
    const result = await fixture.runner.executeScheduledOccurrence(
      fixture.definition,
      fixture.config,
    );
    expect(result?.status).toBe('SUCCESS');
    expect(fixture.prisma.scheduledTaskRun.update).toHaveBeenCalledTimes(1);
  });

  it('records sanitized execution failure and sends failure context', async () => {
    const fixture = setup({
      execute: jest
        .fn()
        .mockRejectedValue(new Error('password=secret exploded')),
    });
    const result = await fixture.runner.executeScheduledOccurrence(
      fixture.definition,
      fixture.config,
    );
    expect(result?.status).toBe('FAILED');
    expect(result?.error).toContain('password=[REDACTED]');
    expect(fixture.notify).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'FAILED',
        failureReason: expect.stringContaining('[REDACTED]'),
      }),
    );
  });
});
