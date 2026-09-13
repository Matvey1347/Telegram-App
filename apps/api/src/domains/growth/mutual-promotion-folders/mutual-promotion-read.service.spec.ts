/* eslint-disable @typescript-eslint/no-unsafe-assignment -- focused Prisma read double */
import { MutualPromotionReadService } from './mutual-promotion-read.service';
import { MutualPromotionStatisticsService } from './mutual-promotion-statistics.service';

describe('MutualPromotionReadService', () => {
  it('includes compact channel summaries in the folder list', async () => {
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
                inviteLink: { joinedCount: 15 },
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
        count: jest.fn().mockResolvedValue(1),
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
  });
});
