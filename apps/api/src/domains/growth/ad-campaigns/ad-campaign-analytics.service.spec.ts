import { AdCampaignAnalyticsService } from './ad-campaign-analytics.service';

describe('AdCampaignAnalyticsService', () => {
  it('classifies CPA in the channel KPI currency instead of workspace primary currency', async () => {
    const campaign = {
      id: 'campaign-1',
      workspaceId: 'workspace-1',
      currency: 'UAH',
      price: 11_400,
      priceInPrimaryCurrency: 255.29,
      subscribersBefore: 1_000,
      subscribersAfter24h: 1_281,
      subscribersAfter48h: 1_281,
      subscribersAfter72h: 1_281,
      subscribersAfter7d: 1_281,
      subscribersAfter30d: 1_281,
      avgViewsBefore: 100,
      avgViewsAfter: 100,
      cpaStatus: 'good',
      activeCpaStatus: 'unknown',
      retentionStatus: 'good',
      overallStatus: 'good',
      telegramChannel: {
        kpiCurrency: 'UAH',
        targetCpa: 9,
        stopCpaFrom: 12,
        seedSubscribersCount: 0,
        knownFakeSubscribersCount: 0,
        subscriberBaseQuality: 'normal',
      },
    };
    const prisma = {
      adCampaign: {
        findFirst: jest.fn().mockResolvedValue(campaign),
        update: jest.fn().mockImplementation(({ data }) =>
          Promise.resolve({ ...campaign, ...data }),
        ),
      },
    };
    const conversion = { convertCurrency: jest.fn() };
    const service = new AdCampaignAnalyticsService(
      prisma as never,
      conversion as never,
    );

    await service.recalculateCampaignAnalytics('workspace-1', 'campaign-1');

    expect(conversion.convertCurrency).not.toHaveBeenCalled();
    expect(prisma.adCampaign.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          cpa: 255.29 / 281,
          cpaStatus: 'bad',
          overallStatus: 'bad',
        }),
      }),
    );
  });
});
