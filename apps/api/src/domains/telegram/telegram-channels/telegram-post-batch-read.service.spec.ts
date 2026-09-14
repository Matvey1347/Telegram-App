/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access -- focused Prisma test double */
import { TelegramPostBatchReadService } from './telegram-post-batch-read.service';
import { TelegramPostBatchSummaryService } from './telegram-post-batch-summary.service';

describe('TelegramPostBatchReadService', () => {
  it('builds list summaries from a workspace-scoped aggregate without loading deliveries', async () => {
    const createdAt = new Date('2026-09-14T10:00:00.000Z');
    const updatedAt = new Date('2026-09-14T11:00:00.000Z');
    const scheduledAt = new Date('2026-09-15T10:00:00.000Z');
    const deleteAt = new Date('2026-09-17T10:00:00.000Z');
    const prisma = {
      telegramPostBatch: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'batch-1',
            title: 'Campaign posts',
            status: 'ACTIVE',
            version: 4,
            channelIds: ['channel-1', 'channel-2'],
            createdAt,
            updatedAt,
            _count: { posts: 3 },
          },
        ]),
        count: jest.fn().mockResolvedValue(1),
      },
      telegramPostBatchDelivery: {
        groupBy: jest.fn().mockResolvedValue([
          {
            batchId: 'batch-1',
            status: 'SCHEDULED',
            _count: { _all: 4 },
            _min: { scheduledAt, deleteAt: null },
          },
          {
            batchId: 'batch-1',
            status: 'PUBLISHED',
            _count: { _all: 2 },
            _min: { scheduledAt, deleteAt },
          },
          {
            batchId: 'batch-1',
            status: 'FAILED',
            _count: { _all: 1 },
            _min: { scheduledAt, deleteAt: null },
          },
        ]),
      },
    };
    const summaries = new TelegramPostBatchSummaryService(prisma as never);
    const service = new TelegramPostBatchReadService(
      prisma as never,
      summaries,
    );

    await expect(service.list('workspace-1', 1, 20)).resolves.toEqual({
      items: [
        expect.objectContaining({
          id: 'batch-1',
          postCount: 3,
          deliveryCount: 7,
          scheduledCount: 4,
          publishedCount: 2,
          failedCount: 1,
          nextPublicationAt: scheduledAt.toISOString(),
          nextDeleteAt: deleteAt.toISOString(),
        }),
      ],
      pagination: { page: 1, pageSize: 20, totalItems: 1, totalPages: 1 },
    });
    expect(prisma.telegramPostBatch.findMany.mock.calls[0][0].select).toEqual(
      expect.not.objectContaining({ deliveries: expect.anything() }),
    );
    expect(prisma.telegramPostBatchDelivery.groupBy).toHaveBeenCalledWith(
      expect.objectContaining({
        by: ['batchId', 'status'],
        where: {
          workspaceId: 'workspace-1',
          batchId: { in: ['batch-1'] },
        },
      }),
    );
  });

  it('builds detail summary through the bounded aggregate path', async () => {
    const createdAt = new Date('2026-09-14T10:00:00.000Z');
    const updatedAt = new Date('2026-09-14T11:00:00.000Z');
    const prisma = {
      telegramPostBatch: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'batch-2',
          workspaceId: 'workspace-1',
          title: 'One batch',
          status: 'DRAFT',
          version: 1,
          channelIds: [],
          defaultDeleteAfterHours: 24,
          createdAt,
          updatedAt,
          posts: [],
          adSaleLinks: [],
          mutualPromotionLinks: [],
        }),
      },
      telegramPostBatchDelivery: {
        groupBy: jest.fn().mockResolvedValue([]),
      },
    };
    const summaries = new TelegramPostBatchSummaryService(prisma as never);
    const service = new TelegramPostBatchReadService(
      prisma as never,
      summaries,
    );

    await expect(service.get('workspace-1', 'batch-2')).resolves.toEqual(
      expect.objectContaining({
        id: 'batch-2',
        postCount: 0,
        deliveryCount: 0,
        posts: [],
      }),
    );
    expect(prisma.telegramPostBatchDelivery.groupBy).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          workspaceId: 'workspace-1',
          batchId: { in: ['batch-2'] },
        },
      }),
    );
  });
});
