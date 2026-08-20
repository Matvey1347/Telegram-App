/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import { DueTaskSchedule } from './due-task-schedule';

const now = new Date('2026-08-18T08:00:00.000Z');

function setup() {
  const prisma = {
    telegramManagedPost: { findFirst: jest.fn().mockResolvedValue(null) },
    telegramAdSalePlacement: { findFirst: jest.fn().mockResolvedValue(null) },
    greeterJoinRequest: { findFirst: jest.fn().mockResolvedValue(null) },
    greeterBroadcast: { findFirst: jest.fn().mockResolvedValue(null) },
    greeterBroadcastRecipient: {
      findFirst: jest.fn().mockResolvedValue(null),
    },
    greeterSequenceStepExecution: {
      findFirst: jest.fn().mockResolvedValue(null),
    },
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
      schedule.guardNoProgress(
        'task',
        new Date(now.getTime() + 60_000),
        false,
      ),
    ).toEqual(new Date(now.getTime() + 60_000));
  });

  it('does not issue an update when the persisted due state is unchanged', async () => {
    const { schedule, prisma } = setup();
    const updatedAt = new Date(now.getTime() - 60_000);
    prisma.greeterSequenceStepExecution.findFirst.mockResolvedValue({
      dueAt: new Date(now.getTime() + 60_000),
    });
    prisma.scheduledTaskConfig.findMany.mockResolvedValue([
      {
        id: 'config',
        updatedAt,
        nextScheduledRunAt: new Date(now.getTime() + 60_000),
        scheduledClaimOwner: null,
        scheduledClaimExpiresAt: null,
      },
    ]);

    await schedule.refresh('greeter.automations.repair');

    expect(prisma.scheduledTaskConfig.updateMany).not.toHaveBeenCalled();
  });

  it('does not consider a processing broadcast with only downstream deliveries due', async () => {
    const { schedule, prisma } = setup();

    await expect(
      schedule.nextDueAt('greeter.broadcasts.dispatch'),
    ).resolves.toBeNull();

    expect(prisma.greeterBroadcast.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ OR: expect.any(Array) }),
      }),
    );
  });

  it('uses the persisted broadcast recipient retry time', async () => {
    const { schedule, prisma } = setup();
    const retryAt = new Date(now.getTime() + 5 * 60_000);
    prisma.greeterBroadcastRecipient.findFirst.mockResolvedValue({
      nextQueueAttemptAt: retryAt,
    });

    await expect(
      schedule.nextDueAt('greeter.broadcasts.dispatch'),
    ).resolves.toEqual(retryAt);
  });

  it('uses the persisted captcha lease as the bounded retry time', async () => {
    const { schedule, prisma } = setup();
    const retryAt = new Date(now.getTime() + 5 * 60_000);
    prisma.greeterJoinRequest.findFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ expiredAt: now, expiryClaimUntil: retryAt });

    await expect(schedule.nextDueAt('greeter.expire_pending')).resolves.toEqual(
      retryAt,
    );
  });

  it('keeps future automation work scheduled without making it immediately due', async () => {
    const { schedule, prisma } = setup();
    const dueAt = new Date(now.getTime() + 60_000);
    prisma.greeterSequenceStepExecution.findFirst.mockResolvedValue({ dueAt });

    await expect(
      schedule.nextDueAt('greeter.automations.repair'),
    ).resolves.toEqual(dueAt);
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
      .mockResolvedValueOnce({
        scheduledAt: new Date(now.getTime() - 60_000),
        telegramIdLastCheckedAt: now,
      });

    await expect(
      schedule.nextDueAt('telegram.managed_posts.reconcile_due'),
    ).resolves.toEqual(new Date(now.getTime() + 45_000));
  });
});
