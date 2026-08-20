import { Prisma } from '@prisma/client';
import { ScheduledTaskLockService } from './scheduled-task-lock.service';

const now = new Date('2026-08-19T08:00:00.000Z');

describe('ScheduledTaskLockService', () => {
  beforeAll(() => jest.useFakeTimers());
  beforeEach(() => jest.setSystemTime(now));
  afterAll(() => jest.useRealTimers());

  function setup(takeoverCount: number) {
    const prisma = {
      scheduledTaskLease: {
        create: jest.fn().mockRejectedValue(
          new Prisma.PrismaClientKnownRequestError('lease exists', {
            code: 'P2002',
            clientVersion: '7.8.0',
          }),
        ),
        updateMany: jest.fn().mockResolvedValue({ count: takeoverCount }),
      },
    };
    return {
      locks: new ScheduledTaskLockService(prisma as never),
      prisma,
    };
  }

  it('does not take over a live lease', async () => {
    const { locks, prisma } = setup(0);

    await expect(
      locks.acquire({
        lockKey: 'task:system',
        taskKey: 'task',
        workspaceId: null,
        ownerId: 'worker-2',
      }),
    ).resolves.toBe(false);
    expect(prisma.scheduledTaskLease.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          lockKey: 'task:system',
          expiresAt: { lt: now },
        },
      }),
    );
  });

  it('takes over a stale lease through one fenced update', async () => {
    const { locks, prisma } = setup(1);

    await expect(
      locks.acquire({
        lockKey: 'task:system',
        taskKey: 'task',
        workspaceId: null,
        ownerId: 'worker-2',
      }),
    ).resolves.toBe(true);
    expect(prisma.scheduledTaskLease.updateMany).toHaveBeenCalledTimes(1);
  });
});
