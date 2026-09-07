/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-return -- focused lifecycle persistence mocks */
import { MutualPromotionLifecycleService } from './mutual-promotion-lifecycle.service';

describe('MutualPromotionLifecycleService', () => {
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
    const publication = { publishManagedPost: jest.fn().mockResolvedValue({}) };
    const prisma = {
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
    );

    await service['publishPost'](
      { folderId: 'folder-1', folderPostId: 'post-1' } as never,
      new Date('2026-09-07T12:00:00.000Z'),
    );

    expect(publication.publishManagedPost).toHaveBeenCalledWith(
      'workspace-1',
      'channel-1',
      'managed-1',
    );
    expect(prisma.mutualPromotionPostDelivery.update).toHaveBeenLastCalledWith(
      expect.objectContaining({
        where: { id: 'delivery-1' },
        data: expect.objectContaining({ status: 'PUBLISHED' }),
      }),
    );
  });

  it('does not duplicate a post already scheduled in Telegram natively', async () => {
    const publication = { publishManagedPost: jest.fn() };
    const update = jest.fn().mockResolvedValue({});
    const scheduledAt = new Date('2026-09-07T12:00:00.000Z');
    const prisma = {
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
    );

    await service['publishPost'](
      { folderId: 'folder-1', folderPostId: 'post-1' } as never,
      scheduledAt,
    );

    expect(publication.publishManagedPost).not.toHaveBeenCalled();
    expect(update).toHaveBeenCalledWith({
      where: { id: 'delivery-native' },
      data: {
        status: 'PUBLISHED',
        publishedAt: scheduledAt,
        lastError: null,
      },
    });
  });

  it('does not finish while publication work is pending or in flight', async () => {
    const boundaries = { captureFinal: jest.fn().mockResolvedValue(undefined) };
    const remoteDeletion = { deletePublishedManagedPosts: jest.fn() };
    const prisma = {
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
