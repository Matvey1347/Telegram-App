/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-return -- focused lifecycle persistence mocks */
import { MutualPromotionLifecycleService } from './mutual-promotion-lifecycle.service';
import * as scheduledTaskWakeNotifier from '../../../common/scheduled-task-wake-notifier';

describe('MutualPromotionLifecycleService', () => {
  afterEach(() => jest.restoreAllMocks());

  it('signals the scheduler after lifecycle work so an external caller can rearm it', async () => {
    const notify = jest.spyOn(
      scheduledTaskWakeNotifier,
      'notifyScheduledTaskDueWorkChanged',
    );
    const prisma = {
      mutualPromotionFolderPost: {
        findFirst: jest.fn().mockResolvedValue(null),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      mutualPromotionWorkItem: {
        findMany: jest.fn().mockResolvedValue([]),
        findFirst: jest.fn().mockResolvedValue(null),
      },
    };
    const service = new MutualPromotionLifecycleService(
      prisma as never,
      {} as never,
      {} as never,
      {} as never,
    );

    await expect(service.processDueActions()).resolves.toMatchObject({
      considered: 0,
      processed: 0,
      nextDueAt: null,
    });

    expect(notify).toHaveBeenCalledWith('mutual_promotion.lifecycle');
  });

  it.each(['publication', 'maintenance'] as const)(
    'filters %s work before claiming or resolving its next wake',
    async (lane) => {
      const findMany = jest.fn().mockResolvedValue([]);
      const findFirst = jest.fn().mockResolvedValue(null);
      const service = new MutualPromotionLifecycleService(
        {
          mutualPromotionWorkItem: { findMany, findFirst },
          mutualPromotionPostDelivery: {
            findMany: jest.fn().mockResolvedValue([]),
          },
          mutualPromotionFolderPost: {
            findFirst: jest.fn().mockResolvedValue(null),
          },
        } as never,
        {} as never,
        {} as never,
        {} as never,
      );
      await service.processDueActions({ lane });
      const kind =
        lane === 'publication' ? 'PUBLISH_POST' : { not: 'PUBLISH_POST' };
      expect(findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ kind }) }),
      );
      expect(findFirst).toHaveBeenCalledTimes(2);
      for (const [query] of findFirst.mock.calls)
        expect(query.where.kind).toEqual(kind);
    },
  );

  it('publishes with unavailable baseline analytics and does not wait for native delivery before other channels', async () => {
    const publication = {
      publishManagedPost: jest.fn(),
      dispatch: jest.fn().mockResolvedValue(true),
    };
    const boundaries = {
      captureStart: jest.fn(() => new Promise(() => {})),
      captureFinal: jest.fn(() => new Promise(() => {})),
    };
    const baselineCount = jest.fn(() => new Promise(() => {}));
    const prisma = {
      mutualPromotionFolderPost: {
        findFirst: jest.fn().mockResolvedValue(null),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      mutualPromotionFolder: {
        findUnique: jest.fn().mockResolvedValue({
          status: 'ACTIVE',
          endsAt: new Date('2026-12-01'),
        }),
      },
      mutualPromotionFolderParticipant: { count: baselineCount },
      mutualPromotionPostDelivery: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'native',
            managedPostId: 'native-post',
            managedPost: {
              status: 'SCHEDULED',
              scheduleMode: 'TELEGRAM_NATIVE',
            },
          },
          {
            id: 'local',
            managedPostId: 'local-post',
            workspaceId: 'workspace',
            telegramChannelId: 'channel',
            managedPost: { status: 'SCHEDULED', scheduleMode: 'LOCAL' },
          },
        ]),
        update: jest.fn().mockResolvedValue({}),
      },
    };
    const service = new MutualPromotionLifecycleService(
      prisma as never,
      boundaries as never,
      publication as never,
      {} as never,
      undefined,
      publication as never,
    );
    await expect(
      service['publishPost'](
        { folderId: 'folder', folderPostId: 'post' } as never,
        new Date('2026-11-13'),
      ),
    ).rejects.toThrow('must finish before folder cleanup');
    expect(publication.dispatch).toHaveBeenCalledWith({
      workspaceId: 'workspace',
      telegramChannelId: 'channel',
      id: 'local-post',
    });
    expect(baselineCount).not.toHaveBeenCalled();
    expect(boundaries.captureStart).not.toHaveBeenCalled();
    expect(boundaries.captureFinal).not.toHaveBeenCalled();
    expect(prisma.mutualPromotionPostDelivery.update).toHaveBeenCalledWith({
      where: { id: 'local' },
      data: {
        status: 'PUBLISHING',
        lastError: null,
      },
    });
  });

  it('does not wait for bot confirmation before publishing the next channel', async () => {
    const confirmation = {
      sendPublishedOnce: jest.fn(() => new Promise(() => {})),
    };
    const publication = {
      publishManagedPost: jest.fn(),
      dispatch: jest.fn().mockResolvedValue(true),
    };
    const prisma = {
      mutualPromotionFolderPost: {
        findFirst: jest.fn().mockResolvedValue(null),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      mutualPromotionFolder: {
        findUnique: jest.fn().mockResolvedValue({
          status: 'ACTIVE',
          endsAt: new Date('2026-12-01'),
        }),
      },
      mutualPromotionPostDelivery: {
        findMany: jest.fn().mockResolvedValue(
          Array.from({ length: 8 }, (_, index) => ({
            id: `delivery-${index}`,
            managedPostId: `post-${index}`,
            workspaceId: 'workspace',
            telegramChannelId: `channel-${index}`,
            managedPost: { status: 'SCHEDULED', scheduleMode: 'LOCAL' },
          })),
        ),
        update: jest.fn().mockResolvedValue({}),
      },
    };
    const service = new MutualPromotionLifecycleService(
      prisma as never,
      {} as never,
      publication as never,
      {} as never,
      confirmation as never,
      publication as never,
    );
    await expect(
      service['publishPost'](
        { folderId: 'folder', folderPostId: 'post' } as never,
        new Date('2026-11-13'),
      ),
    ).rejects.toThrow('must finish before folder cleanup');
    expect(publication.dispatch).toHaveBeenCalledTimes(8);
    expect(confirmation.sendPublishedOnce).not.toHaveBeenCalled();
  });

  it('keeps dispatched work retryable without spending failure attempts before Telegram confirmation', async () => {
    const now = new Date('2026-11-13T12:00:00Z');
    const prisma = {
      mutualPromotionFolder: {
        findUnique: jest
          .fn()
          .mockResolvedValue({
            status: 'ACTIVE',
            endsAt: new Date('2026-12-01'),
          }),
      },
      mutualPromotionPostDelivery: {
        findMany: jest
          .fn()
          .mockResolvedValue([
            {
              id: 'delivery',
              managedPostId: 'managed',
              workspaceId: 'workspace',
              telegramChannelId: 'channel',
              managedPost: { status: 'SCHEDULED', scheduleMode: 'LOCAL' },
            },
          ]),
        update: jest.fn().mockResolvedValue({}),
      },
      mutualPromotionWorkItem: { update: jest.fn().mockResolvedValue({}) },
    };
    const dispatcher = { dispatch: jest.fn().mockResolvedValue(true) };
    const service = new MutualPromotionLifecycleService(
      prisma as never,
      {} as never,
      {} as never,
      {} as never,
      undefined,
      dispatcher as never,
    );
    const result = { completed: 0, retried: 0, failed: 0 };
    await service['runOne'](
      {
        id: 'work',
        folderId: 'folder',
        folderPostId: 'logical-post',
        kind: 'PUBLISH_POST',
        attemptCount: 3,
        maxAttempts: 3,
      } as never,
      now,
      result,
    );
    expect(dispatcher.dispatch).toHaveBeenCalledWith({
      id: 'managed',
      workspaceId: 'workspace',
      telegramChannelId: 'channel',
    });
    expect(prisma.mutualPromotionWorkItem.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'work' },
        data: expect.objectContaining({
          status: 'RETRY',
          attemptCount: { decrement: 1 },
          claimedAt: null,
          leaseExpiresAt: null,
        }),
      }),
    );
    expect(result).toEqual({ completed: 0, retried: 1, failed: 0 });
    expect(prisma.mutualPromotionPostDelivery.update).not.toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: 'PUBLISHED' }),
      }),
    );
  });

  it('persists a maintenance wake for already verified local post confirmations', async () => {
    const updatedAt = new Date('2026-11-13T12:00:00Z');
    const prisma = {
      mutualPromotionWorkItem: { findFirst: jest.fn().mockResolvedValue(null) },
      mutualPromotionFolderPost: {
        findFirst: jest.fn().mockResolvedValue({ updatedAt }),
      },
    };
    const service = new MutualPromotionLifecycleService(
      prisma as never,
      {} as never,
      {} as never,
      {} as never,
    );
    await expect(service.nextDueAt('maintenance')).resolves.toEqual(
      new Date('2026-11-13T12:01:00Z'),
    );
    expect(prisma.mutualPromotionFolderPost.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          publishedBotConfirmationSentAt: null,
          deliveries: { some: {}, every: { status: 'PUBLISHED' } },
        },
      }),
    );
    await expect(service.nextDueAt('publication')).resolves.toBeNull();
  });

  it('confirms a native publication as soon as reconciliation observes every delivery', async () => {
    const confirmation = {
      sendPublishedOnce: jest.fn().mockResolvedValue(undefined),
    };
    const now = new Date('2026-09-07T12:00:05.000Z');
    const prisma = {
      mutualPromotionFolderPost: {
        findFirst: jest.fn().mockResolvedValue(null),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      mutualPromotionPostDelivery: {
        findMany: jest.fn().mockResolvedValue([
          { id: 'delivery-1', folderPostId: 'folder-post-1' },
          { id: 'delivery-2', folderPostId: 'folder-post-1' },
        ]),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
    };
    const service = new MutualPromotionLifecycleService(
      prisma as never,
      {} as never,
      {} as never,
      {} as never,
      confirmation as never,
    );

    await expect(service.reconcilePublishedDeliveries(now)).resolves.toEqual({
      reconciled: 2,
    });
    expect(prisma.mutualPromotionPostDelivery.updateMany).toHaveBeenCalledWith({
      where: {
        id: 'delivery-1',
        status: { in: ['PENDING', 'PUBLISHING', 'FAILED'] },
      },
      data: { status: 'PUBLISHED', publishedAt: now, lastError: null },
    });
    expect(confirmation.sendPublishedOnce).toHaveBeenCalledTimes(1);
    expect(confirmation.sendPublishedOnce).toHaveBeenCalledWith(
      'folder-post-1',
    );
  });

  it('does not send a duplicate confirmation when another worker claimed the delivery', async () => {
    const confirmation = { sendPublishedOnce: jest.fn() };
    const prisma = {
      mutualPromotionFolderPost: {
        findFirst: jest.fn().mockResolvedValue(null),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      mutualPromotionPostDelivery: {
        findMany: jest
          .fn()
          .mockResolvedValue([
            { id: 'delivery-1', folderPostId: 'folder-post-1' },
          ]),
        updateMany: jest.fn().mockResolvedValue({ count: 0 }),
      },
    };
    const service = new MutualPromotionLifecycleService(
      prisma as never,
      {} as never,
      {} as never,
      {} as never,
      confirmation as never,
    );

    await service.reconcilePublishedDeliveries();

    expect(confirmation.sendPublishedOnce).not.toHaveBeenCalled();
  });

  it('captures the final boundary before remote deletion and preserves it on retries', async () => {
    const calls: string[] = [];
    const tx = {
      mutualPromotionFolder: {
        updateMany: jest.fn().mockImplementation(() => calls.push('deleting')),
      },
      $executeRaw: jest.fn().mockImplementation((query) => {
        calls.push('boundary');
        expect(query.strings.join(' ')).toContain(
          'participant."finalCapturedAt" IS NULL',
        );
      }),
    };
    const prisma = {
      mutualPromotionFolderPost: {
        findFirst: jest.fn().mockResolvedValue(null),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      $transaction: jest.fn((callback) => callback(tx)),
      mutualPromotionWorkItem: {
        findMany: jest.fn().mockResolvedValue([]),
        updateMany: jest.fn().mockResolvedValue({ count: 0 }),
      },
      mutualPromotionPostDelivery: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'delivery-1',
            workspaceId: 'workspace-1',
            managedPostId: 'managed-1',
            managedPost: {
              telegramMessageIds: ['1'],
              telegramRemoteStatus: 'PUBLISHED',
            },
          },
        ]),
        updateMany: jest.fn(),
      },
    };
    const remoteDeletion = {
      deletePublishedManagedPosts: jest.fn().mockImplementation(() => {
        calls.push('delete');
        throw new Error('Telegram unavailable');
      }),
    };
    const service = new MutualPromotionLifecycleService(
      prisma as never,
      {
        captureFinal: jest.fn(async () => callbackBoundary(tx, calls)),
      } as never,
      {} as never,
      remoteDeletion as never,
    );

    await expect(
      service['finishFolder'](
        { id: 'work-1', folderId: 'folder-1' } as never,
        new Date('2026-09-07T12:00:00.000Z'),
      ),
    ).rejects.toThrow('Telegram unavailable');
    expect(calls).toEqual(['deleting', 'boundary', 'delete']);
  });

  it('re-enters the publisher when a failed post has only a partial delivery journal', async () => {
    const publication = {
      publishManagedPost: jest.fn(),
      dispatch: jest.fn().mockResolvedValue(true),
    };
    const prisma = {
      mutualPromotionFolderPost: {
        findFirst: jest.fn().mockResolvedValue(null),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      mutualPromotionFolder: {
        findUnique: jest.fn().mockResolvedValue({
          status: 'ACTIVE',
          endsAt: new Date('2026-09-08T12:00:00.000Z'),
        }),
      },
      mutualPromotionFolderParticipant: {
        count: jest.fn().mockResolvedValue(0),
      },
      mutualPromotionPostDelivery: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'delivery-1',
            workspaceId: 'workspace-1',
            telegramChannelId: 'channel-1',
            managedPostId: 'managed-1',
            managedPost: {
              status: 'FAILED',
              telegramMessageIds: ['already-sent-part'],
            },
          },
        ]),
        update: jest.fn().mockResolvedValue({}),
      },
    };
    const service = new MutualPromotionLifecycleService(
      prisma as never,
      {} as never,
      publication as never,
      {} as never,
      undefined,
      publication as never,
    );

    await expect(
      service['publishPost'](
        { folderId: 'folder-1', folderPostId: 'post-1' } as never,
        new Date('2026-09-07T12:00:00.000Z'),
      ),
    ).rejects.toThrow('must finish before folder cleanup');

    expect(publication.dispatch).toHaveBeenCalledWith({
      workspaceId: 'workspace-1',
      telegramChannelId: 'channel-1',
      id: 'managed-1',
    });
    expect(prisma.mutualPromotionPostDelivery.update).toHaveBeenLastCalledWith(
      expect.objectContaining({
        where: { id: 'delivery-1' },
        data: expect.objectContaining({ status: 'PUBLISHING' }),
      }),
    );
  });

  it('waits for Telegram to confirm a natively scheduled post before marking VP delivery published', async () => {
    const publication = { publishManagedPost: jest.fn() };
    const update = jest.fn().mockResolvedValue({});
    const scheduledAt = new Date('2026-09-07T12:00:00.000Z');
    const prisma = {
      mutualPromotionFolderPost: {
        findFirst: jest.fn().mockResolvedValue(null),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      mutualPromotionFolder: {
        findUnique: jest.fn().mockResolvedValue({
          status: 'ACTIVE',
          endsAt: new Date('2026-09-08T12:00:00.000Z'),
        }),
      },
      mutualPromotionFolderParticipant: {
        count: jest.fn().mockResolvedValue(0),
      },
      mutualPromotionPostDelivery: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'delivery-native',
            workspaceId: 'workspace-1',
            telegramChannelId: 'channel-1',
            managedPostId: 'managed-native',
            managedPost: {
              status: 'SCHEDULED',
              scheduleMode: 'TELEGRAM_NATIVE',
              scheduledAt,
              telegramMessageIds: [],
            },
          },
        ]),
        update,
      },
    };
    const service = new MutualPromotionLifecycleService(
      prisma as never,
      {} as never,
      publication as never,
      {} as never,
      undefined,
      publication as never,
    );

    await expect(
      service['publishPost'](
        { folderId: 'folder-1', folderPostId: 'post-1' } as never,
        scheduledAt,
      ),
    ).rejects.toThrow('must finish before folder cleanup');

    expect(publication.publishManagedPost).not.toHaveBeenCalled();
    expect(update).not.toHaveBeenCalled();
  });

  it('does not finish while publication work is pending or in flight', async () => {
    const boundaries = { captureFinal: jest.fn().mockResolvedValue(undefined) };
    const remoteDeletion = { deletePublishedManagedPosts: jest.fn() };
    const prisma = {
      mutualPromotionFolderPost: {
        findFirst: jest.fn().mockResolvedValue(null),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      mutualPromotionWorkItem: {
        updateMany: jest.fn().mockResolvedValue({ count: 0 }),
        findMany: jest
          .fn()
          .mockResolvedValue([
            { nextAttemptAt: new Date('2026-09-07T12:05:00.000Z') },
          ]),
      },
    };
    const service = new MutualPromotionLifecycleService(
      prisma as never,
      boundaries as never,
      {} as never,
      remoteDeletion as never,
    );

    await expect(
      service['finishFolder'](
        { folderId: 'folder-1' } as never,
        new Date('2026-09-07T12:00:00.000Z'),
      ),
    ).rejects.toThrow('must finish before folder cleanup');
    expect(boundaries.captureFinal).toHaveBeenCalledWith(
      'folder-1',
      new Date('2026-09-07T12:00:00.000Z'),
    );
    expect(remoteDeletion.deletePublishedManagedPosts).not.toHaveBeenCalled();
  });

  it('does not publish an overdue retry after the folder end', async () => {
    const publication = { publishManagedPost: jest.fn() };
    const prisma = {
      mutualPromotionFolderPost: {
        findFirst: jest.fn().mockResolvedValue(null),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      mutualPromotionFolder: {
        findUnique: jest.fn().mockResolvedValue({
          status: 'ACTIVE',
          endsAt: new Date('2026-09-07T11:59:00.000Z'),
        }),
      },
    };
    const service = new MutualPromotionLifecycleService(
      prisma as never,
      {} as never,
      publication as never,
      {} as never,
      undefined,
      publication as never,
    );

    await service['publishPost'](
      { folderId: 'folder-1', folderPostId: 'post-1' } as never,
      new Date('2026-09-07T12:00:00.000Z'),
    );

    expect(publication.publishManagedPost).not.toHaveBeenCalled();
  });
});

async function callbackBoundary(
  tx: {
    mutualPromotionFolder: { updateMany: jest.Mock };
    $executeRaw: jest.Mock;
  },
  calls: string[],
) {
  await tx.mutualPromotionFolder.updateMany();
  await tx.$executeRaw({
    strings: ['participant."finalCapturedAt" IS NULL'],
  });
  expect(calls.slice(0, 2)).toEqual(['deleting', 'boundary']);
}
