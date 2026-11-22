/* eslint-disable @typescript-eslint/no-unsafe-assignment -- focused Prisma read double */
import { MutualPromotionReadService } from './mutual-promotion-read.service';
import { MutualPromotionStatisticsService } from './mutual-promotion-statistics.service';

describe('MutualPromotionReadService', () => {
  afterEach(() => jest.useRealTimers());

  it('includes compact channel summaries in the folder list', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-09-09T08:00:00.000Z'));
    const prisma = {
      mutualPromotionFolder: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'folder-1',
            title: 'September',
            titleTemplate: null,
            status: 'ACTIVE',
            startsAt: new Date('2026-09-08T08:00:00.000Z'),
            endsAt: new Date('2026-09-10T08:00:00.000Z'),
            notes: null,
            createdAt: new Date('2026-09-01T08:00:00.000Z'),
            updatedAt: new Date('2026-09-08T08:00:00.000Z'),
            _count: { participants: 1, posts: 5 },
            participants: [
              {
                role: 'PAID',
                subscribersAtStart: 100,
                subscribersAtEnd: null,
                inviteJoinedAtStart: 10,
                inviteJoinedAtEnd: null,
                inviteRequestedAtStart: 0,
                inviteRequestedAtEnd: null,
                baselineCapturedAt: new Date('2026-09-08T08:00:00.000Z'),
                finalCapturedAt: null,
                telegramChannel: {
                  id: 'channel-1',
                  title: 'Channel One',
                  username: 'channel_one',
                  photoUrl: 'https://example.com/channel.jpg',
                  currentSubscribersCount: 103,
                  kpiCurrency: 'UAH',
                  targetCpaFrom: null,
                  targetCpa: 9,
                  acceptableCpaFrom: null,
                  acceptableCpa: null,
                  stopCpaFrom: 12,
                  stopCpa: null,
                },
                inviteLink: { joinedCount: 15, requestedCount: 0 },
                expense: {
                  id: 'transaction-1',
                  accountId: 'account-1',
                  amount: 50,
                  currency: 'UAH',
                  amountInPrimaryCurrency: 50,
                  account: { name: 'Main' },
                },
              },
            ],
          },
        ]),
        count: jest
          .fn()
          .mockResolvedValueOnce(1)
          .mockResolvedValueOnce(2)
          .mockResolvedValueOnce(3),
      },
    };
    const service = new MutualPromotionReadService(
      prisma as never,
      {
        resolveWorkspaceIdForUser: jest.fn().mockResolvedValue('workspace-1'),
      } as never,
      new MutualPromotionStatisticsService(),
      {} as never,
    );

    const result = await service.list('user-1', { page: 1, pageSize: 10 });

    expect(result.items[0].channels).toEqual([
      {
        id: 'channel-1',
        title: 'Channel One',
        username: 'channel_one',
        photoUrl: 'https://example.com/channel.jpg',
        role: 'PAID',
        kpi: {
          currency: 'UAH',
          targetFrom: null,
          targetTo: 9,
          acceptableFrom: null,
          acceptableTo: null,
          stopFrom: 12,
          stopTo: null,
        },
        stats: expect.objectContaining({
          inviteLinkTotalCount: 15,
          joinedCount: 5,
          unsubscribedCount: null,
          audienceDelta: null,
          subscriberPrice: 10,
          currency: 'UAH',
        }),
      },
    ]);
    expect(prisma.mutualPromotionFolder.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          workspaceId: 'workspace-1',
          status: 'ACTIVE',
          startsAt: { lte: new Date('2026-09-09T08:00:00.000Z') },
          endsAt: { gt: new Date('2026-09-09T08:00:00.000Z') },
        },
        include: expect.objectContaining({
          participants: expect.objectContaining({
            select: expect.objectContaining({
              telegramChannel: expect.any(Object),
              inviteLink: expect.any(Object),
              expense: expect.any(Object),
            }),
          }),
        }),
      }),
    );
    expect(result.statusCounts).toEqual({
      ACTIVE: 1,
      SCHEDULED: 2,
      COMPLETED: 3,
    });
  });

  it('lists a folder whose period ended in Completed even if its stored status is Active', async () => {
    const endsAt = new Date('2026-11-20T12:00:00.000Z');
    jest.useFakeTimers().setSystemTime(endsAt);
    const findMany = jest.fn().mockResolvedValue([
      {
        id: 'expired-folder',
        status: 'ACTIVE',
        title: 'Folder',
        startsAt: new Date('2026-11-19T12:00:00.000Z'),
        endsAt,
        participants: [],
        _count: { posts: 0, participants: 0 },
        createdAt: endsAt,
        updatedAt: endsAt,
      },
    ]);
    const count = jest
      .fn()
      .mockResolvedValueOnce(0)
      .mockResolvedValueOnce(0)
      .mockResolvedValueOnce(1);
    const service = new MutualPromotionReadService(
      { mutualPromotionFolder: { findMany, count } } as never,
      {
        resolveWorkspaceIdForUser: jest.fn().mockResolvedValue('workspace-1'),
      } as never,
      new MutualPromotionStatisticsService(),
      {} as never,
    );

    const result = await service.list('user-1', { status: 'COMPLETED' });

    expect(result.items[0].status).toBe('COMPLETED');
    expect(result.statusCounts).toEqual({
      ACTIVE: 0,
      SCHEDULED: 0,
      COMPLETED: 1,
    });
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          workspaceId: 'workspace-1',
          OR: [
            { status: { in: ['COMPLETED', 'CANCELLED', 'DELETING'] } },
            {
              status: { in: ['ACTIVE', 'SCHEDULED'] },
              endsAt: { lte: endsAt },
            },
          ],
        },
      }),
    );
  });

  it('loads every preferred folder link and falls back to the main link', async () => {
    const prisma = {
      telegramChannel: {
        findMany: jest.fn().mockResolvedValue([
          {
            defaultInviteLinkId: 'default-1',
            folderDefaultInviteLinkIds: ['folder-1', 'folder-2'],
          },
          {
            defaultInviteLinkId: 'default-2',
            folderDefaultInviteLinkIds: [],
          },
        ]),
      },
      telegramInviteLink: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'folder-1',
            telegramChannelId: 'channel-1',
            telegramChannel: {
              defaultInviteLinkId: 'default-1',
              folderDefaultInviteLinkIds: ['folder-1', 'folder-2'],
              mutualPromotionInviteLinkIds: [],
            },
            name: 'Main link',
            url: 'https://t.me/+main',
            joinedCount: 0,
            requestedCount: 0,
            isRevoked: false,
            creatorTelegramUserId: null,
            creatorUsername: null,
            creatorFirstName: null,
            creatorPhotoUrl: null,
            creatorMember: null,
            adCampaignId: null,
            snapshots: [],
            mutualPromotionParticipants: [
              {
                inviteLinkMode: 'FOLDER_ONLY',
                folder: {
                  status: 'COMPLETED',
                  startsAt: new Date('2026-01-01T00:00:00.000Z'),
                  endsAt: new Date('2026-01-02T00:00:00.000Z'),
                },
              },
            ],
          },
        ]),
      },
      telegramUserAccountIntegration: {
        findMany: jest.fn().mockResolvedValue([]),
      },
    };
    const service = new MutualPromotionReadService(
      prisma as never,
      {
        resolveWorkspaceIdForUser: jest.fn().mockResolvedValue('workspace-1'),
      } as never,
      new MutualPromotionStatisticsService(),
      {} as never,
    );

    const result = await service.inviteLinkOptions('user-1', {
      channelIds: ['channel-1', 'channel-2'],
      initial: true,
    });

    expect(prisma.telegramInviteLink.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          workspaceId: 'workspace-1',
          telegramChannelId: { in: ['channel-1', 'channel-2'] },
          id: { in: ['folder-1', 'folder-2', 'default-2'] },
        },
      }),
    );
    expect(result).toEqual([
      expect.objectContaining({
        id: 'folder-1',
        isDefaultForFolders: true,
        available: true,
        unavailableReason: null,
      }),
    ]);
  });
});
