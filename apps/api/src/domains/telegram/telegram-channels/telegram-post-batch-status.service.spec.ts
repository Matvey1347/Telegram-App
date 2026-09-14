import { TelegramPostBatchStatusService } from './telegram-post-batch-status.service';

describe('TelegramPostBatchStatusService', () => {
  it('marks a terminal batch partial when a managed-post or channel cascade removed a delivery', async () => {
    const prisma = {
      telegramPostBatch: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'batch-1',
            channelIds: ['channel-1', 'channel-2'],
            _count: { posts: 1 },
          },
        ]),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      telegramPostBatchDelivery: {
        groupBy: jest
          .fn()
          .mockResolvedValueOnce([
            {
              batchId: 'batch-1',
              status: 'DELETED',
              deleteAfterHours: 24,
              _count: { _all: 1 },
            },
          ])
          .mockResolvedValueOnce([]),
      },
    };
    const service = new TelegramPostBatchStatusService(prisma as never);

    await service.refresh('batch-1', prisma as never);

    expect(prisma.telegramPostBatch.updateMany).toHaveBeenCalledWith({
      where: { id: { in: ['batch-1'] }, status: 'ACTIVE' },
      data: { status: 'PARTIAL_FAILURE' },
    });
    expect(prisma.telegramPostBatchDelivery.groupBy).toHaveBeenCalledTimes(2);
  });
});
