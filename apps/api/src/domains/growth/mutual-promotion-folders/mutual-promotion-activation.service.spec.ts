/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-return -- focused Prisma transaction mock assertions */
import { MutualPromotionActivationService } from './mutual-promotion-activation.service';

describe('MutualPromotionActivationService', () => {
  const now = new Date();
  const startsAt = new Date(now.getTime() + 24 * 60 * 60 * 1000);
  const endsAt = new Date(now.getTime() + 48 * 60 * 60 * 1000);

  function setup(postCount = 5, publisherCount = 2) {
    const posts = Array.from({ length: postCount }, (_, position) => ({
      id: `post-${position}`,
      title: `Post ${position + 1}`,
      text: 'Body',
      imageUrls: [],
      buttonRows: null,
      position,
      scheduledAt: new Date(startsAt.getTime() + (position + 1) * 60_000),
    }));
    const participants = Array.from({ length: publisherCount }, (_, index) => ({
      id: `participant-${index}`,
      workspaceId: 'workspace-1',
      folderId: 'folder-1',
      telegramChannelId: `channel-${index}`,
      inviteLinkId: `invite-${index}`,
      role: 'PUBLISHER' as const,
      inviteLinkMode: 'REUSABLE' as const,
      subscribersAtStart: null,
      subscribersAtEnd: null,
      inviteJoinedAtStart: null,
      inviteJoinedAtEnd: null,
      baselineCapturedAt: null,
      finalCapturedAt: null,
      createdAt: now,
      updatedAt: now,
      telegramChannel: {
        assignedMemberId: null,
        currentSubscribersCount: 100,
      },
    }));
    const folder = {
      id: 'folder-1',
      workspaceId: 'workspace-1',
      title: 'Folder',
      status: 'DRAFT' as const,
      startsAt,
      endsAt,
      assignedMemberId: null,
      participants,
      posts,
    };
    const tx = {
      mutualPromotionFolder: {
        findFirst: jest.fn().mockResolvedValue(folder),
        update: jest.fn().mockResolvedValue(folder),
      },
      postGroup: {
        findMany: jest.fn().mockResolvedValue(
          participants.map((participant) => ({
            id: `group-${participant.id}`,
            telegramChannelId: participant.telegramChannelId,
          })),
        ),
        createMany: jest.fn(),
      },
      telegramManagedPost: {
        createMany: jest
          .fn()
          .mockResolvedValue({ count: postCount * publisherCount }),
      },
      mutualPromotionPostDelivery: {
        createMany: jest
          .fn()
          .mockResolvedValue({ count: postCount * publisherCount }),
      },
      mutualPromotionWorkItem: {
        createMany: jest.fn().mockResolvedValue({ count: postCount + 2 }),
      },
    };
    const prisma = {
      $transaction: jest.fn((callback) => callback(tx)),
      mutualPromotionFolder: {
        findFirst: jest.fn().mockResolvedValue({
          status: 'DRAFT',
          activatedAt: null,
        }),
      },
      mutualPromotionPostDelivery: {
        findMany: jest.fn(),
        update: jest.fn(),
      },
    };
    const validation = {
      requireDraft: jest.fn(),
      lockFolder: jest.fn(),
      lockInviteLinks: jest.fn(),
      validateParticipants: jest.fn(),
    };
    const read = {
      detailForWorkspace: jest.fn().mockResolvedValue({ id: 'folder-1' }),
    };
    const publication = {
      scheduleManagedPostNatively: jest.fn().mockResolvedValue({}),
    };
    const service = new MutualPromotionActivationService(
      prisma as never,
      {
        resolveWorkspaceMembershipForUser: jest
          .fn()
          .mockResolvedValue({ id: 'member-1', workspaceId: 'workspace-1' }),
      } as never,
      validation as never,
      read as never,
      publication as never,
    );
    return { service, tx, validation, publication, prisma, posts };
  }

  it('creates one aggregate work item per boundary and logical post', async () => {
    const { service, tx, validation, publication } = setup();
    const onProgress = jest.fn();

    const result = await service.activate('user-1', 'folder-1', onProgress);

    expect(result.deliveriesCreated).toBe(10);
    expect(result).toMatchObject({
      successCount: 10,
      failedCount: 0,
      telegramNativeCount: 10,
      localSchedulerCount: 0,
    });
    expect(validation.lockFolder.mock.invocationCallOrder[0]).toBeLessThan(
      tx.mutualPromotionFolder.findFirst.mock.invocationCallOrder[0],
    );
    expect(tx.telegramManagedPost.createMany).toHaveBeenCalledWith({
      data: expect.arrayContaining([
        expect.objectContaining({ scheduledAt: expect.any(Date) }),
      ]),
    });
    const workRows =
      tx.mutualPromotionWorkItem.createMany.mock.calls[0][0].data;
    expect(workRows).toHaveLength(7);
    expect(
      workRows.filter((row: { kind: string }) => row.kind === 'PUBLISH_POST'),
    ).toHaveLength(5);
    expect(tx.mutualPromotionFolder.update).toHaveBeenCalledWith({
      where: { id: 'folder-1' },
      data: expect.objectContaining({
        status: 'SCHEDULED',
      }),
    });
    expect(publication.scheduleManagedPostNatively).toHaveBeenCalledTimes(10);
    expect(onProgress).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ status: 'PREPARING', success: null }),
      0,
      10,
    );
    expect(onProgress).toHaveBeenLastCalledWith(
      expect.objectContaining({ status: 'SCHEDULED', success: true }),
      10,
      10,
    );
  });

  it('schedules posts sequentially inside each channel to avoid group-numbering deadlocks', async () => {
    const { service, publication } = setup(5, 2);
    const activeChannels = new Set<string>();
    publication.scheduleManagedPostNatively.mockImplementation(
      async (_workspaceId: string, channelId: string) => {
        if (activeChannels.has(channelId)) {
          throw new Error(`concurrent scheduling for ${channelId}`);
        }
        activeChannels.add(channelId);
        await new Promise<void>((resolve) => setImmediate(resolve));
        activeChannels.delete(channelId);
        return {};
      },
    );

    const result = await service.activate('user-1', 'folder-1');

    expect(result).toMatchObject({ successCount: 10, failedCount: 0 });
  });

  it('keeps posts with inline buttons on local due-time delivery', async () => {
    const { service, publication, posts } = setup(5, 1);
    (posts[0] as { buttonRows: unknown }).buttonRows = [
      [{ text: 'Open', url: 'https://example.com', style: 'default' }],
    ];

    await service.activate('user-1', 'folder-1');

    expect(publication.scheduleManagedPostNatively).toHaveBeenCalledTimes(4);
    expect(
      publication.scheduleManagedPostNatively.mock.calls.map(
        (call: unknown[]) => call[3],
      ),
    ).not.toContain(posts[0].scheduledAt);
  });

  it('records and reports a native Telegram scheduling failure', async () => {
    const { service, publication, prisma } = setup(5, 1);
    publication.scheduleManagedPostNatively.mockRejectedValueOnce(
      new Error('MTProto unavailable'),
    );

    await expect(service.activate('user-1', 'folder-1')).rejects.toThrow(
      'could not be added to Telegram Scheduled Messages',
    );
    expect(prisma.mutualPromotionPostDelivery.update).toHaveBeenCalledWith({
      where: { id: expect.any(String) },
      data: { status: 'FAILED', lastError: 'MTProto unavailable' },
    });
  });

  it('resumes a partially completed scheduled activation without duplicating prepared posts', async () => {
    const { service, prisma, publication, tx } = setup(5, 1);
    prisma.mutualPromotionFolder.findFirst.mockResolvedValue({
      status: 'SCHEDULED',
      activatedAt: now,
    });
    const retryDelivery = preparedDelivery(
      'delivery-retry',
      'managed-retry',
      'FAILED',
    );
    prisma.mutualPromotionPostDelivery.findMany.mockResolvedValue([
      preparedDelivery('delivery-ready', 'managed-ready', 'SCHEDULED'),
      retryDelivery,
    ]);

    const result = await service.activate('user-1', 'folder-1');

    expect(tx.telegramManagedPost.createMany).not.toHaveBeenCalled();
    expect(publication.scheduleManagedPostNatively).toHaveBeenCalledTimes(1);
    expect(publication.scheduleManagedPostNatively).toHaveBeenCalledWith(
      'workspace-1',
      'channel-1',
      'managed-retry',
      retryDelivery.folderPost.scheduledAt,
    );
    expect(result).toMatchObject({ successCount: 2, failedCount: 0 });
  });

  it('rejects activation with fewer than five posts', async () => {
    const { service, tx } = setup(4, 1);

    await expect(service.activate('user-1', 'folder-1')).rejects.toThrow(
      'At least five publications are required',
    );
    expect(tx.telegramManagedPost.createMany).not.toHaveBeenCalled();
  });
});

function preparedDelivery(
  id: string,
  managedPostId: string,
  status: 'SCHEDULED' | 'FAILED',
) {
  return {
    id,
    workspaceId: 'workspace-1',
    telegramChannelId: 'channel-1',
    telegramChannel: { title: 'Channel 1' },
    managedPostId,
    managedPost: {
      status,
      scheduleMode: status === 'SCHEDULED' ? 'TELEGRAM_NATIVE' : null,
    },
    folderPost: {
      id: `post-${id}`,
      title: `Post ${id}`,
      scheduledAt: new Date('2026-09-08T10:00:00.000Z'),
      buttonRows: [],
      position: 0,
    },
  };
}
