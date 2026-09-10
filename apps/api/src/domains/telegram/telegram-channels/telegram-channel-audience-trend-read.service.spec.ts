import { TelegramChannelAudienceTrendReadService } from './telegram-channel-audience-trend-read.service';

describe('TelegramChannelAudienceTrendReadService', () => {
  const currentAt = new Date('2026-09-07T12:00:00.000Z');
  const baselineAt = new Date('2026-08-31T12:00:00.000Z');

  it('returns independent seven-day audience metrics from one batched query', async () => {
    const prisma = {
      $queryRaw: jest.fn().mockResolvedValue([
        {
          telegramChannelId: 'channel-1',
          currentAt,
          currentSubscribers: 1_100,
          currentActiveSubscribers: 600,
          currentViewRate: 60,
          latestViews: 525,
          latestReactions: 21,
          currentViews: 550,
          currentReactions: 22,
          dataQuality: 'normal',
          dataQualityReason: null,
          hasExternalTrafficAnomaly: false,
          hasSubscriberBasePollution: false,
          postsWindow: 30,
          baselineAt,
          baselineSubscribers: 1_000,
          baselineViews: 500,
          baselineReactions: 20,
        },
      ]),
    };
    const service = new TelegramChannelAudienceTrendReadService(
      prisma as never,
    );

    const result = await service.summariesForChannels(
      'workspace-1',
      Array.from({ length: 100 }, (_, index) => `channel-${index + 1}`),
    );

    expect(prisma.$queryRaw).toHaveBeenCalledTimes(1);
    const rawQuery = prisma.$queryRaw as unknown as {
      mock: { calls: Array<[{ strings: string[] }]> };
    };
    const trendSql = rawQuery.mock.calls[0][0].strings.join(' ');
    expect(trendSql).toContain('"TelegramPostMetricSnapshot"');
    expect(trendSql).toContain("INTERVAL '24 hours'");
    expect(result.get('channel-1')).toEqual({
      latest: {
        subscribersCount: 1_100,
        activeSubscribersEstimate: 600,
        viewRate: 60,
        avgViewsAdjusted: 525,
        avgReactionsAdjusted: 21,
        dataQuality: 'normal',
        dataQualityReason: null,
        hasExternalTrafficAnomaly: false,
        hasSubscriberBasePollution: false,
        postsWindow: 30,
      },
      trend: {
        periodDays: 7,
        currentAt: currentAt.toISOString(),
        baselineAt: baselineAt.toISOString(),
        metrics: {
          subscribers: {
            current: 1_100,
            previous: 1_000,
            absoluteChange: 100,
            percentChange: 10,
          },
          reach: {
            current: 550,
            previous: 500,
            absoluteChange: 50,
            percentChange: 10,
          },
          reactions: {
            current: 22,
            previous: 20,
            absoluteChange: 2,
            percentChange: 10,
          },
        },
      },
    });
  });

  it('keeps the latest audience snapshot but omits a misleading trend without history', async () => {
    const prisma = {
      $queryRaw: jest.fn().mockResolvedValue([
        {
          telegramChannelId: 'channel-new',
          currentAt,
          currentSubscribers: 50,
          currentActiveSubscribers: null,
          currentViewRate: null,
          latestViews: null,
          latestReactions: null,
          currentViews: null,
          currentReactions: null,
          dataQuality: 'normal',
          dataQualityReason: null,
          hasExternalTrafficAnomaly: false,
          hasSubscriberBasePollution: false,
          postsWindow: 10,
          baselineAt: null,
          baselineSubscribers: null,
          baselineViews: null,
          baselineReactions: null,
        },
      ]),
    };
    const service = new TelegramChannelAudienceTrendReadService(
      prisma as never,
    );

    const result = await service.summariesForChannels('workspace-1', [
      'channel-new',
    ]);

    expect(result.get('channel-new')?.latest.subscribersCount).toBe(50);
    expect(result.get('channel-new')?.trend).toBeNull();
  });

  it('does not query the database for an empty page', async () => {
    const prisma = { $queryRaw: jest.fn() };
    const service = new TelegramChannelAudienceTrendReadService(
      prisma as never,
    );

    await expect(
      service.summariesForChannels('workspace-1', []),
    ).resolves.toEqual(new Map());
    expect(prisma.$queryRaw).not.toHaveBeenCalled();
  });

  it('propagates a database failure instead of returning stale dynamics', async () => {
    const prisma = {
      $queryRaw: jest.fn().mockRejectedValue(new Error('database unavailable')),
    };
    const service = new TelegramChannelAudienceTrendReadService(
      prisma as never,
    );

    await expect(
      service.summariesForChannels('workspace-1', ['channel-1']),
    ).rejects.toThrow('database unavailable');
  });
});
