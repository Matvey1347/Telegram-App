/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access -- focused Prisma test double */
import { TelegramPostBatchLifecycleService } from './telegram-post-batch-lifecycle.service';

describe('TelegramPostBatchLifecycleService', () => {
  const publishedAt = new Date('2026-09-14T10:00:00.000Z');
  const delivery = {
    id: 'delivery-1',
    batchId: 'batch-1',
    workspaceId: 'workspace-1',
    telegramChannelId: 'channel-1',
    managedPostId: 'managed-1',
    scheduledAt: publishedAt,
    deleteAfterHours: 48,
    longTextMode: 'IMAGES_THEN_TEXT',
    attemptCount: 1,
    claimOwner: 'owner-current',
    managedPost: {
      status: 'PUBLISHED',
      publishedAt,
      telegramRemoteStatus: 'PUBLISHED',
      telegramMessageIds: [],
      text: 'Text',
      buttonRows: [],
      sourceType: null,
      lastError: null,
    },
  };

  function setup() {
    const prisma = {
      telegramPostBatchDelivery: {
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        findMany: jest.fn(),
      },
      telegramManagedPost: {
        findFirst: jest.fn().mockResolvedValue({
          status: 'PUBLISHED',
          publishedAt,
        }),
      },
      $transaction: jest.fn(),
    };
    const publicationRunner = { run: jest.fn() };
    const batchStatus = {
      refresh: jest.fn(),
      refreshMany: jest.fn(),
      repairTerminalBatches: jest.fn(),
    };
    const claimLease = {
      runWithClaims: jest.fn(
        async (
          rows: unknown[],
          _status: string,
          work: (held: unknown[]) => Promise<unknown>,
        ) => ({ held: true, value: await work(rows) }),
      ),
    };
    const service = new TelegramPostBatchLifecycleService(
      prisma as never,
      { deletePublishedManagedPosts: jest.fn() } as never,
      { nextDueAt: jest.fn() } as never,
      batchStatus as never,
      claimLease as never,
      publicationRunner as never,
    );
    return {
      service,
      prisma,
      publicationRunner,
      batchStatus,
      claimLease,
    };
  }

  it('reconciles a crash after Telegram publish without sending a duplicate', async () => {
    const { service, prisma, publicationRunner } = setup();

    await (
      service as never as {
        publish(row: typeof delivery, now: Date): Promise<void>;
      }
    ).publish(delivery, new Date('2026-09-14T10:01:00.000Z'));

    expect(publicationRunner.run).not.toHaveBeenCalled();
    expect(prisma.telegramPostBatchDelivery.updateMany).toHaveBeenCalledWith({
      where: {
        id: 'delivery-1',
        status: 'PUBLISHING',
        claimOwner: 'owner-current',
      },
      data: expect.objectContaining({
        status: 'PUBLISHED',
        publishedAt,
        deleteAt: new Date('2026-09-16T10:00:00.000Z'),
      }),
    });
  });

  it('orders claimed rows by schedule, source-post position, and id', async () => {
    const { service, prisma } = setup();
    prisma.telegramPostBatchDelivery.findMany.mockResolvedValue([]);

    await (
      service as never as {
        claimedRows(ids: string[], owner: string): Promise<unknown>;
      }
    ).claimedRows(['delivery-2', 'delivery-1'], 'owner-current');

    expect(prisma.telegramPostBatchDelivery.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        orderBy: [
          { scheduledAt: 'asc' },
          { batchPost: { position: 'asc' } },
          { id: 'asc' },
        ],
      }),
    );
  });

  it('does not let an expired claim owner overwrite a takeover', async () => {
    const { service, prisma } = setup();
    prisma.telegramPostBatchDelivery.updateMany.mockResolvedValue({ count: 0 });

    await (
      service as never as {
        markPublished(
          row: typeof delivery,
          at: Date,
          hours: number,
        ): Promise<unknown>;
      }
    ).markPublished(delivery, publishedAt, 48);

    expect(prisma.telegramPostBatchDelivery.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ claimOwner: 'owner-current' }),
      }),
    );
  });

  it('durably commits a final delivery mark for aggregate repair after a crash', async () => {
    const { service, prisma, batchStatus } = setup();
    const tx = {
      telegramPostBatchDelivery: {
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
    };
    prisma.$transaction.mockImplementation(
      (work: (client: typeof tx) => Promise<unknown>) => work(tx),
    );

    await (
      service as never as {
        markPublished(
          row: typeof delivery,
          at: Date,
          hours: null,
        ): Promise<unknown>;
      }
    ).markPublished(delivery, publishedAt, null);

    expect(tx.telegramPostBatchDelivery.updateMany).toHaveBeenCalled();
    expect(batchStatus.refresh).not.toHaveBeenCalled();
  });

  it('reuses one source cache for publications within one run', async () => {
    const { service, publicationRunner } = setup();
    const first = {
      ...delivery,
      id: 'delivery-1',
      managedPostId: 'managed-1',
      managedPost: {
        ...delivery.managedPost,
        status: 'DRAFT',
      },
    };
    const second = {
      ...first,
      id: 'delivery-2',
      managedPostId: 'managed-2',
    };
    const sourceCache = new Map();
    const publish = (
      service as never as {
        publish(
          row: typeof first,
          now: Date,
          cache: Map<string, Promise<unknown>>,
        ): Promise<void>;
      }
    ).publish.bind(service);

    await publish(first, publishedAt, sourceCache);
    await publish(second, publishedAt, sourceCache);

    expect(publicationRunner.run).toHaveBeenCalledTimes(2);
    expect(publicationRunner.run.mock.calls[0][1]).toBe(
      publicationRunner.run.mock.calls[1][1],
    );
  });

  it('skips Telegram publication when the claim cannot be renewed', async () => {
    const { service, prisma, publicationRunner } = setup();
    publicationRunner.run.mockResolvedValue({
      held: false,
      value: undefined,
    });
    const pending = {
      ...delivery,
      managedPost: { ...delivery.managedPost, status: 'DRAFT' },
    };

    await (
      service as never as {
        publish(row: typeof pending, now: Date): Promise<void>;
      }
    ).publish(pending, publishedAt);

    expect(prisma.telegramPostBatchDelivery.updateMany).not.toHaveBeenCalled();
  });

  it('marks the managed post failed with a terminal delivery failure', async () => {
    const { service, prisma } = setup();
    const terminal = { ...delivery, attemptCount: 5 };
    const tx = {
      telegramPostBatchDelivery: {
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      telegramManagedPost: {
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
    };
    prisma.$transaction.mockImplementation(
      (work: (client: typeof tx) => Promise<unknown>) => work(tx),
    );

    await (
      service as never as {
        markFailure(
          row: typeof terminal,
          error: Error,
          status: 'FAILED',
        ): Promise<unknown>;
      }
    ).markFailure(terminal, new Error('No delete source'), 'FAILED');

    expect(tx.telegramManagedPost.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ scheduleMode: 'BATCH' }),
        data: { status: 'FAILED', lastError: 'No delete source' },
      }),
    );
  });
});
