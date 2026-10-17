/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import { DueTaskSchedule } from './due-task-schedule';

const now = new Date('2026-08-18T08:00:00.000Z');

function setup() {
  const prisma = {
    telegramManagedPost: { findFirst: jest.fn().mockResolvedValue(null) },
    telegramAdSalePlacement: { findFirst: jest.fn().mockResolvedValue(null) },
    scheduledTaskConfig: {
      findMany: jest.fn().mockResolvedValue([]),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
  };
  return { schedule: new DueTaskSchedule(prisma as never), prisma };
}

describe('DueTaskSchedule', () => {
  beforeAll(() => jest.useFakeTimers());
  beforeEach(() => jest.setSystemTime(now));
  afterAll(() => jest.useRealTimers());

  it('backs off repeated no-progress work instead of returning zero delay', () => {
    const { schedule } = setup();
    const staleDue = new Date(now.getTime() - 60_000);

    expect(schedule.guardNoProgress('task', staleDue, false)).toEqual(staleDue);
    expect(schedule.guardNoProgress('task', staleDue, true)).toEqual(
      new Date(now.getTime() + 5_000),
    );
    expect(schedule.guardNoProgress('task', staleDue, true)).toEqual(
      new Date(now.getTime() + 10_000),
    );
  });

  it('delegates mutual-promotion due time to the domain lifecycle resolver', async () => {
    const { prisma } = setup();
    const dueAt = new Date(now.getTime() + 60_000);
    const resolver = { nextDueAt: jest.fn().mockResolvedValue(dueAt) };
    const schedule = new DueTaskSchedule(prisma as never, resolver);

    await expect(
      schedule.nextDueAt('mutual_promotion.lifecycle'),
    ).resolves.toEqual(dueAt);
    expect(resolver.nextDueAt).toHaveBeenCalledWith(
      'mutual_promotion.lifecycle',
    );
    expect(prisma.telegramManagedPost.findFirst).not.toHaveBeenCalled();
  });

  it('uses a short fixed continuation while a same-time folder batch drains', () => {
    const { schedule } = setup();
    const staleDue = new Date(now.getTime() - 60_000);

    expect(
      schedule.guardNoProgress('mutual_promotion.lifecycle', staleDue, true),
    ).toEqual(new Date(now.getTime() + 5_000));
    expect(
      schedule.guardNoProgress('mutual_promotion.lifecycle', staleDue, true),
    ).toEqual(new Date(now.getTime() + 5_000));
  });

  it('does not resolve or restore stale due work while its occurrence is claimed', async () => {
    const { prisma } = setup();
    const staleDue = new Date(now.getTime() - 60_000);
    const resolver = { nextDueAt: jest.fn().mockResolvedValue(staleDue) };
    const schedule = new DueTaskSchedule(prisma as never, resolver);
    prisma.scheduledTaskConfig.findMany.mockResolvedValue([
      {
        id: 'config',
        updatedAt: new Date(now.getTime() - 60_000),
        nextScheduledRunAt: staleDue,
        scheduledClaimOwner: 'running-worker',
        scheduledClaimExpiresAt: new Date(now.getTime() + 10 * 60_000),
      },
    ]);

    await schedule.refresh('mutual_promotion.lifecycle');

    expect(resolver.nextDueAt).not.toHaveBeenCalled();
    expect(prisma.scheduledTaskConfig.updateMany).not.toHaveBeenCalled();
  });

  it('persists the newly resolved nearest due time after an occurrence advances', async () => {
    const { prisma } = setup();
    const nextDueAt = new Date(now.getTime() + 60_000);
    const resolver = { nextDueAt: jest.fn().mockResolvedValue(nextDueAt) };
    const schedule = new DueTaskSchedule(prisma as never, resolver);
    prisma.scheduledTaskConfig.findMany.mockResolvedValue([
      {
        id: 'config',
        updatedAt: new Date(now.getTime() - 60_000),
        nextScheduledRunAt: null,
        scheduledClaimOwner: null,
        scheduledClaimExpiresAt: null,
      },
    ]);

    await schedule.refresh('mutual_promotion.lifecycle', true);

    expect(prisma.scheduledTaskConfig.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ nextScheduledRunAt: nextDueAt }),
      }),
    );
  });

  it('backs off the first attempted stale occurrence immediately', () => {
    const { schedule } = setup();
    const staleDue = new Date(now.getTime() - 60_000);

    expect(schedule.guardNoProgress('task', staleDue, true)).toEqual(
      new Date(now.getTime() + 5_000),
    );
    expect(schedule.guardNoProgress('task', staleDue, true)).toEqual(
      new Date(now.getTime() + 10_000),
    );
  });

  it('clears no-progress protection after the due row makes progress', () => {
    const { schedule } = setup();
    const staleDue = new Date(now.getTime() - 60_000);

    expect(schedule.guardNoProgress('task', staleDue, true)).toEqual(
      new Date(now.getTime() + 5_000),
    );
    expect(schedule.guardNoProgress('task', null, true)).toBeNull();
    expect(
      schedule.guardNoProgress('task', new Date(now.getTime() + 60_000), false),
    ).toEqual(new Date(now.getTime() + 60_000));
  });

  it('changes managed-post due time after the eligible row makes progress', async () => {
    const { schedule, prisma } = setup();
    const rawDue = new Date(now.getTime() - 60_000);
    prisma.telegramManagedPost.findFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({
        scheduledAt: rawDue,
        telegramIdLastCheckedAt: null,
        updatedAt: rawDue,
      })
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null);

    await expect(
      schedule.nextDueAt('telegram.managed_posts.reconcile_due'),
    ).resolves.toEqual(rawDue);

    await expect(
      schedule.nextDueAt('telegram.managed_posts.reconcile_due'),
    ).resolves.toBeNull();
  });

  it('uses the managed-post identity retry timestamp after a failed check', async () => {
    const { schedule, prisma } = setup();
    prisma.telegramManagedPost.findFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({
        scheduledAt: new Date(now.getTime() - 60_000),
        telegramIdLastCheckedAt: now,
        telegramIdVerificationStatus: 'UNVERIFIED',
      });

    await expect(
      schedule.nextDueAt('telegram.managed_posts.reconcile_due'),
    ).resolves.toEqual(new Date(now.getTime() + 45_000));
  });

  it('uses the slower retry timestamp for failed dependent repair after identity confirmation', async () => {
    const { schedule, prisma } = setup();
    prisma.telegramManagedPost.findFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({
        scheduledAt: null,
        telegramIdLastCheckedAt: now,
        telegramIdVerificationStatus: 'UNVERIFIED',
        lastTelegramSyncNote:
          'Published Telegram identity verified; dependent scheduled-link repair pending.',
      })
      .mockResolvedValueOnce(null);

    await expect(
      schedule.nextDueAt('telegram.managed_posts.reconcile_due'),
    ).resolves.toEqual(new Date(now.getTime() + 5 * 60_000));
  });

  it('uses a slower retry timestamp for a recently missing scheduled post', async () => {
    const { schedule, prisma } = setup();
    prisma.telegramManagedPost.findFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({
        scheduledAt: new Date(now.getTime() - 60_000),
        telegramIdLastCheckedAt: now,
        telegramIdVerificationStatus: 'MISSING',
      });

    await expect(
      schedule.nextDueAt('telegram.managed_posts.reconcile_due'),
    ).resolves.toEqual(new Date(now.getTime() + 30 * 60_000));
  });

  it('does not let an older missing check delay a faster unverified retry', async () => {
    const { schedule, prisma } = setup();
    prisma.telegramManagedPost.findFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({
        scheduledAt: new Date(now.getTime() - 60_000),
        telegramIdLastCheckedAt: now,
        telegramIdVerificationStatus: 'UNVERIFIED',
      })
      .mockResolvedValueOnce({
        scheduledAt: new Date(now.getTime() - 60_000),
        telegramIdLastCheckedAt: new Date(now.getTime() - 5 * 60_000),
        telegramIdVerificationStatus: 'MISSING',
      });

    await expect(
      schedule.nextDueAt('telegram.managed_posts.reconcile_due'),
    ).resolves.toEqual(new Date(now.getTime() + 45_000));
  });

  it('reclaims a local post if publishing was abandoned', async () => {
    const { schedule, prisma } = setup();
    const claimedAt = new Date(now.getTime() - 4 * 60_000);
    prisma.telegramManagedPost.findFirst
      .mockResolvedValueOnce({
        status: 'PUBLISHING',
        scheduledAt: new Date(now.getTime() - 5 * 60_000),
        updatedAt: claimedAt,
      })
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null);

    await expect(
      schedule.nextDueAt('telegram.managed_posts.reconcile_due'),
    ).resolves.toEqual(new Date(claimedAt.getTime() + 10 * 60_000));
  });
});
