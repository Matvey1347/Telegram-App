import {
  priceChannelAdFormatWindows,
  resolveChannelCardExpectedViews,
  TelegramChannelAdPricingReadService,
} from './telegram-channel-ad-pricing-read.service';

describe('TelegramChannelAdPricingReadService', () => {
  const now = new Date('2026-08-22T12:00:00.000Z');

  it('builds the four pricing windows from one bounded batch', async () => {
    const posts = [0, 1, 2].map((index) => {
      const postDate = new Date(
        now.getTime() - (10 + index) * 24 * 60 * 60 * 1000,
      );
      return {
        id: `post-${index}`,
        telegramChannelId: 'channel-1',
        postDate,
        manualOwnViews: 0,
        excludeFromAnalytics: false,
        adPlacementLinked: false,
        h24Views: 120 + index * 4,
        h48Views: 160 + index * 8,
        h72Views: 175 + index * 3,
        permanentViews: 240 + index * 4,
      };
    });
    const prisma = {
      $queryRaw: jest.fn().mockResolvedValue(posts),
    };
    const service = new TelegramChannelAdPricingReadService(prisma as never);

    const result = await service.windowsForChannels(
      'workspace-1',
      [{ id: 'channel-1', currentSubscribersCount: 1_000 }],
      now,
    );

    expect(result.get('channel-1')).toMatchObject({
      h24: { expectedViews: 124, postsSampleCount: 3, dataQuality: 'READY' },
      h48: { expectedViews: 168, postsSampleCount: 3, dataQuality: 'READY' },
      h72: { expectedViews: 178, postsSampleCount: 3, dataQuality: 'READY' },
      permanent: {
        expectedViews: 244,
        postsSampleCount: 3,
        dataQuality: 'READY',
      },
    });
    expect(prisma.$queryRaw).toHaveBeenCalledTimes(1);
  });

  it('returns an explicit insufficient-data state without a detail query', async () => {
    const prisma = {
      $queryRaw: jest.fn().mockResolvedValue([]),
    };
    const service = new TelegramChannelAdPricingReadService(prisma as never);

    const result = await service.windowsForChannels(
      'workspace-1',
      [{ id: 'channel-1' }],
      now,
    );

    expect(result.get('channel-1')?.permanent).toEqual({
      expectedViews: null,
      postsSampleCount: 0,
      dataQuality: 'NOT_ENOUGH_DATA',
    });
    expect(prisma.$queryRaw).toHaveBeenCalledTimes(1);
  });

  it('calculates a provisional price window from fewer than three mature posts', async () => {
    const posts = [100, 200].map((h24Views, index) => ({
      id: `post-${index}`,
      telegramChannelId: 'channel-1',
      postDate: new Date(now.getTime() - (index + 2) * 24 * 60 * 60 * 1000),
      manualOwnViews: 0,
      excludeFromAnalytics: false,
      adPlacementLinked: false,
      h24Views,
      h48Views: null,
      h72Views: null,
      permanentViews: null,
    }));
    const prisma = {
      $queryRaw: jest.fn().mockResolvedValue(posts),
    };
    const service = new TelegramChannelAdPricingReadService(prisma as never);

    const result = await service.windowsForChannels(
      'workspace-1',
      [{ id: 'channel-1' }],
      now,
    );

    expect(result.get('channel-1')?.h24).toEqual({
      expectedViews: 150,
      postsSampleCount: 2,
      dataQuality: 'READY',
    });
    expect(result.get('channel-1')?.h48).toEqual({
      expectedViews: null,
      postsSampleCount: 0,
      dataQuality: 'NOT_ENOUGH_DATA',
    });
    expect(
      priceChannelAdFormatWindows(result.get('channel-1'), 300, 'UAH')?.h24
        .estimatedPrice,
    ).toBe(45);
  });

  it('propagates a failed pricing read instead of showing stale estimates', async () => {
    const prisma = {
      $queryRaw: jest.fn().mockRejectedValue(new Error('database unavailable')),
    };
    const service = new TelegramChannelAdPricingReadService(prisma as never);

    await expect(
      service.windowsForChannels('workspace-1', [{ id: 'channel-1' }], now),
    ).rejects.toThrow('database unavailable');
  });

  it('uses the 1/24 reach when estimating ads left to break even', () => {
    expect(
      resolveChannelCardExpectedViews(
        {
          h24: {
            expectedViews: 878,
            postsSampleCount: 3,
            dataQuality: 'READY',
          },
          h48: {
            expectedViews: 1_031,
            postsSampleCount: 3,
            dataQuality: 'READY',
          },
          h72: {
            expectedViews: 1_200,
            postsSampleCount: 3,
            dataQuality: 'READY',
          },
          permanent: {
            expectedViews: 1_706,
            postsSampleCount: 3,
            dataQuality: 'READY',
          },
        },
        { ownViewsPerPost: 2_000, currentSubscribersCount: 12_255 },
      ),
    ).toBe(878);
  });
});
