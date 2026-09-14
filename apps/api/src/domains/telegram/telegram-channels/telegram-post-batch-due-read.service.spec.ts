/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access -- focused Prisma test double */
import { TelegramPostBatchDueReadService } from './telegram-post-batch-due-read.service';

describe('TelegramPostBatchDueReadService', () => {
  it('uses the earliest branch-specific due time, including future lease expiry', async () => {
    const times = [
      new Date('2026-09-14T12:10:00.000Z'),
      new Date('2026-09-14T12:09:00.000Z'),
      new Date('2026-09-14T12:03:00.000Z'),
      new Date('2026-09-14T12:08:00.000Z'),
      new Date('2026-09-14T12:07:00.000Z'),
      new Date('2026-09-14T12:06:00.000Z'),
    ];
    const findFirst = jest
      .fn()
      .mockResolvedValueOnce({ nextAttemptAt: times[0] })
      .mockResolvedValueOnce({ nextAttemptAt: times[1] })
      .mockResolvedValueOnce({ claimExpiresAt: times[2] })
      .mockResolvedValueOnce({ deleteAt: times[3] })
      .mockResolvedValueOnce({ nextAttemptAt: times[4] })
      .mockResolvedValueOnce({ claimExpiresAt: times[5] });
    const batchFindFirst = jest.fn().mockResolvedValue(null);
    const service = new TelegramPostBatchDueReadService({
      telegramPostBatchDelivery: { findFirst },
      telegramPostBatch: { findFirst: batchFindFirst },
    } as never);

    await expect(service.nextDueAt()).resolves.toEqual(times[2]);
    expect(findFirst).toHaveBeenCalledTimes(6);
    expect(findFirst.mock.calls[2][0]).toEqual(
      expect.objectContaining({
        where: expect.objectContaining({
          status: 'PUBLISHING',
          claimExpiresAt: { not: null },
        }),
        orderBy: [{ claimExpiresAt: 'asc' }, { id: 'asc' }],
      }),
    );
  });

  it('wakes immediately to repair an orphan active batch with no due rows', async () => {
    const orphanedAt = new Date('2026-09-14T11:59:00.000Z');
    const service = new TelegramPostBatchDueReadService({
      telegramPostBatchDelivery: {
        findFirst: jest.fn().mockResolvedValue(null),
      },
      telegramPostBatch: {
        findFirst: jest.fn().mockResolvedValue({ updatedAt: orphanedAt }),
      },
    } as never);

    await expect(service.nextDueAt()).resolves.toEqual(orphanedAt);
  });
});
