import { TelegramChannelAdPricingReadService } from './telegram-channel-ad-pricing-read.service';

describe('TelegramChannelAdPricingReadService', () => {
  const now = new Date('2026-08-22T12:00:00.000Z');

  it('builds the four pricing windows from one bounded batch', async () => {
    const posts = [0, 1, 2].map((index) => {
      const postDate = new Date(
        now.getTime() - (10 + index) * 24 * 60 * 60 * 1000,
      );
      const at = (hours: number) =>
        new Date(postDate.getTime() + hours * 60 * 60 * 1000);
      return {
        id: `post-${index}`,
        telegramChannelId: 'channel-1',
        postDate,
        viewsCount: 260 + index,
        manualOwnViews: 0,
        excludeFromAnalytics: false,
        adSalePlacements: [],
        metricSnapshots: [
          { viewsCount: 120 + index * 4, collectedAt: at(24) },
          { viewsCount: 160 + index * 8, collectedAt: at(48) },
          { viewsCount: 175 + index * 3, collectedAt: at(72) },
          { viewsCount: 240 + index * 4, collectedAt: at(168) },
        ],
      };
    });
    const prisma = {
      $queryRaw: jest
        .fn()
        .mockResolvedValue(posts.map((post) => ({ id: post.id }))),
      telegramPost: { findMany: jest.fn().mockResolvedValue(posts) },
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
    expect(prisma.telegramPost.findMany).toHaveBeenCalledTimes(1);
    expect(prisma.telegramPost.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          workspaceId: 'workspace-1',
          id: { in: posts.map((p) => p.id) },
        },
      }),
    );
  });

  it('returns an explicit insufficient-data state without a detail query', async () => {
    const prisma = {
      $queryRaw: jest.fn().mockResolvedValue([]),
      telegramPost: { findMany: jest.fn() },
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
    expect(prisma.telegramPost.findMany).not.toHaveBeenCalled();
  });

  it('propagates a failed pricing read instead of showing stale estimates', async () => {
    const prisma = {
      $queryRaw: jest.fn().mockRejectedValue(new Error('database unavailable')),
      telegramPost: { findMany: jest.fn() },
    };
    const service = new TelegramChannelAdPricingReadService(prisma as never);

    await expect(
      service.windowsForChannels('workspace-1', [{ id: 'channel-1' }], now),
    ).rejects.toThrow('database unavailable');
  });
});
