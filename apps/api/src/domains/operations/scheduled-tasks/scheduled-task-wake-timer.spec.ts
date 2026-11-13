import { ScheduledTaskWakeTimer } from './scheduled-task-wake-timer';

const now = new Date('2026-08-19T08:00:00.000Z');

describe('ScheduledTaskWakeTimer', () => {
  beforeAll(() => jest.useFakeTimers());
  beforeEach(() => {
    jest.clearAllTimers();
    jest.setSystemTime(now);
  });
  afterAll(() => jest.useRealTimers());

  it('waits for a live claim to expire without querying in a zero-delay loop', async () => {
    const claimExpiresAt = new Date(now.getTime() + 60_000);
    const findFirst = jest
      .fn()
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({
        nextScheduledRunAt: new Date(now.getTime() - 60_000),
        scheduledClaimExpiresAt: claimExpiresAt,
      });
    const onWake = jest.fn().mockResolvedValue(undefined);
    const timer = new ScheduledTaskWakeTimer(
      { scheduledTaskConfig: { findFirst } } as never,
      onWake,
      jest.fn(),
    );

    await timer.scheduleNext();

    expect(jest.getTimerCount()).toBe(1);
    await jest.advanceTimersByTimeAsync(59_999);
    expect(findFirst).toHaveBeenCalledTimes(2);
    expect(onWake).not.toHaveBeenCalled();
    await jest.advanceTimersByTimeAsync(1);
    expect(onWake).toHaveBeenCalledTimes(1);
    timer.destroy();
  });
  it('excludes active executions while arming a future publication wake', async () => {
    const publicationAt = new Date(now.getTime() + 30_000);
    const findFirst = jest
      .fn()
      .mockResolvedValueOnce({ nextScheduledRunAt: publicationAt })
      .mockResolvedValueOnce(null);
    const onWake = jest.fn().mockResolvedValue(undefined);
    const timer = new ScheduledTaskWakeTimer(
      { scheduledTaskConfig: { findFirst } } as never,
      onWake,
      jest.fn(),
      () => ['hung-maintenance'],
    );
    await timer.scheduleNext();
    for (const [query] of findFirst.mock.calls)
      expect(query.where.id).toEqual({ notIn: ['hung-maintenance'] });
    await jest.advanceTimersByTimeAsync(30_000);
    expect(onWake).toHaveBeenCalledTimes(1);
    timer.destroy();
  });
});
