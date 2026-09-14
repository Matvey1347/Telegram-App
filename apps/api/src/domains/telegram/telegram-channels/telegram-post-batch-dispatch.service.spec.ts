/* eslint-disable @typescript-eslint/no-unsafe-member-access -- focused Prisma test double */
import { ConflictException } from '@nestjs/common';
import { TelegramPostBatchDispatchService } from './telegram-post-batch-dispatch.service';

describe('TelegramPostBatchDispatchService', () => {
  const post = (id: string) => ({
    id,
    title: id,
    text: 'content',
    imageUrls: [],
    mediaItems: [],
    buttonRows: [],
    action: 'PUBLISH_NOW',
    scheduledAt: null,
    deleteAfterHours: 24,
    longTextMode: 'IMAGES_THEN_TEXT',
    channelOverrides: [],
  });

  function fixture(version = 3, status = 'DRAFT') {
    const channelIds = Array.from(
      { length: 100 },
      (_, index) => `channel-${index}`,
    );
    const current = {
      id: 'batch-1',
      status,
      version,
      channelIds,
      defaultDeleteAfterHours: 24,
      _count: { deliveries: status === 'DRAFT' ? 0 : 1 },
      posts: Array.from({ length: 50 }, (_, index) => post(`post-${index}`)),
    };
    const tx = {
      telegramPostBatch: {
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        update: jest.fn(),
      },
      telegramManagedPost: {
        createMany: jest.fn(),
        groupBy: jest.fn().mockResolvedValue([]),
      },
      telegramManagedPostRevision: { createMany: jest.fn() },
      telegramPostBatchDelivery: { createMany: jest.fn() },
    };
    const prisma = {
      telegramPostBatch: { findFirst: jest.fn().mockResolvedValue(current) },
      telegramChannel: {
        findMany: jest
          .fn()
          .mockResolvedValue(
            channelIds.map((id) => ({ id, assignedMemberId: null })),
          ),
      },
      postGroup: {
        findMany: jest.fn().mockResolvedValue(
          channelIds.map((telegramChannelId) => ({
            id: `group-${telegramChannelId}`,
            telegramChannelId,
          })),
        ),
      },
      $transaction: jest.fn((work: (client: typeof tx) => unknown) => work(tx)),
    };
    const read = { get: jest.fn().mockResolvedValue({ id: 'batch-1' }) };
    const sources = {
      sourcesForChannel: jest.fn().mockResolvedValue([
        {
          sourceId: 'account-1',
          sourceType: 'MTPROTO',
          permissions: { canPostMessages: true, canDeleteMessages: true },
        },
      ]),
    };
    const service = new TelegramPostBatchDispatchService(
      prisma as never,
      read as never,
      { ensureSystemBotPostsGroup: jest.fn() } as never,
      sources as never,
    );
    return { service, prisma, tx, current, sources };
  }

  it('checks optimistic version before materializing deliveries', async () => {
    const { service, prisma } = fixture(4);
    await expect(
      service.dispatch({
        workspaceId: 'workspace-1',
        memberId: 'member-1',
        batchId: 'batch-1',
        expectedVersion: 3,
      }),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('returns an already queued result when dispatch is retried', async () => {
    const { service, prisma } = fixture(4, 'ACTIVE');
    await expect(
      service.dispatch({
        workspaceId: 'workspace-1',
        memberId: 'member-1',
        batchId: 'batch-1',
        expectedVersion: 3,
      }),
    ).resolves.toEqual({
      batch: { id: 'batch-1' },
      queuedDeliveries: 1,
      alreadyQueued: true,
    });
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('chunks the supported 5000-delivery boundary and performs no Telegram calls', async () => {
    const { service, tx } = fixture();
    tx.telegramManagedPost.groupBy.mockResolvedValue([
      { groupId: 'group-channel-0', _max: { groupPosition: 7 } },
    ]);
    await service.dispatch({
      workspaceId: 'workspace-1',
      memberId: 'member-1',
      batchId: 'batch-1',
      expectedVersion: 3,
    });

    expect(tx.telegramManagedPost.createMany).toHaveBeenCalledTimes(20);
    expect(tx.telegramManagedPostRevision.createMany).toHaveBeenCalledTimes(20);
    expect(tx.telegramPostBatchDelivery.createMany).toHaveBeenCalledTimes(20);
    expect(
      tx.telegramManagedPost.createMany.mock.calls[0][0].data,
    ).toHaveLength(250);
    expect(
      tx.telegramManagedPost.createMany.mock.calls[19][0].data,
    ).toHaveLength(250);
    expect(tx.telegramManagedPost.createMany.mock.calls[0][0].data[0]).toEqual(
      expect.objectContaining({
        scheduleMode: 'BATCH',
        groupId: 'group-channel-0',
        groupPosition: 8,
      }),
    );
  });

  it('rejects a finite 24-hour lifetime without a delete-capable source', async () => {
    const { service, prisma, sources } = fixture();
    sources.sourcesForChannel.mockResolvedValue([
      {
        sourceId: 'account-1',
        sourceType: 'MTPROTO',
        permissions: { canPostMessages: true, canDeleteMessages: false },
      },
    ]);

    await expect(
      service.dispatch({
        workspaceId: 'workspace-1',
        memberId: 'member-1',
        batchId: 'batch-1',
        expectedVersion: 3,
      }),
    ).rejects.toThrow('no source with permission to delete');
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('rejects inline buttons when a channel only has MTProto posting access', async () => {
    const { service, prisma, current } = fixture();
    (current.posts[0] as { buttonRows: unknown[] }).buttonRows = [
      [{ text: 'Open', url: 'https://example.com', style: 'default' }],
    ];

    await expect(
      service.dispatch({
        workspaceId: 'workspace-1',
        memberId: 'member-1',
        batchId: 'batch-1',
        expectedVersion: 3,
      }),
    ).rejects.toThrow('require an active workspace bot');
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('rejects legacy oversized persisted content before delivery amplification', async () => {
    const { service, prisma, current } = fixture();
    (current.posts[0] as { imageUrls: string[] }).imageUrls = Array.from(
      { length: 11 },
      (_, index) => `https://example.com/${index}.jpg`,
    );

    await expect(
      service.dispatch({
        workspaceId: 'workspace-1',
        memberId: 'member-1',
        batchId: 'batch-1',
        expectedVersion: 3,
      }),
    ).rejects.toThrow('at most 10 media items');
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
});
