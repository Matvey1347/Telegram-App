import {
  dashboardSpendingMix,
  summarizeDashboardTraffic,
} from './dashboard-insights';
import {
  dashboardReadAccess,
  filterDashboardSurface,
} from './dashboard-surface';

describe('dashboard insights', () => {
  it('groups paid channel costs without counting the same expense twice', () => {
    const expense = (category: string, amountInPrimaryCurrency: number) => ({
      type: 'expense',
      category,
      amountInPrimaryCurrency,
    });
    expect(
      dashboardSpendingMix([
        { ...expense('Buy channels', 100), adCampaignId: 'campaign' },
        { ...expense('Advertising', 60), telegramChannelId: 'channel' },
        { ...expense('Custom ads', 15), adCampaignId: 'campaign' },
        {
          ...expense('Placement', 25),
          mutualPromotionParticipantId: 'participant',
        },
        expense('Office', 20),
      ]),
    ).toEqual({
      advertising: 75,
      channelPurchases: 100,
      otherChannelExpenses: 25,
    });
  });

  it('calculates weighted unit costs and period churn from comparable counters', () => {
    const sources = summarizeDashboardTraffic(
      [
        {
          kind: 'AD_CAMPAIGNS',
          activity: {
            inviteLinkId: 'a',
            arrivals: 10,
            requests: 10,
            audienceAtStart: 7,
            joined: 8,
            departures: 3,
          },
        },
        {
          kind: 'AD_CAMPAIGNS',
          activity: {
            inviteLinkId: 'b',
            arrivals: 4,
            requests: 0,
            audienceAtStart: 1,
            joined: 4,
            departures: 1,
          },
        },
        { kind: 'AD_CAMPAIGNS' },
        { kind: 'BOT' },
      ],
      { AD_CAMPAIGNS: 60 },
    );
    expect(sources.find(({ kind }) => kind === 'AD_CAMPAIGNS')).toMatchObject({
      trackedLinks: 3,
      measuredLinks: 2,
      arrivals: 14,
      requests: 10,
      joined: 12,
      departures: 4,
      departurePercent: 20,
      costPerRequest: 6,
      costPerSubscriber: 5,
    });
    expect(sources.find(({ kind }) => kind === 'BOT')).toMatchObject({
      measuredLinks: 0,
      requests: null,
      joined: null,
      departurePercent: null,
      costPerRequest: null,
    });
  });

  it('does not fabricate a cost for zero or unknown results', () => {
    const [source] = summarizeDashboardTraffic(
      [
        {
          kind: 'MUTUAL_PROMOTION',
          activity: {
            inviteLinkId: 'a',
            arrivals: 0,
            requests: 0,
            audienceAtStart: 0,
            joined: 0,
            departures: 0,
          },
        },
        {
          kind: 'MUTUAL_PROMOTION',
          activity: {
            inviteLinkId: 'b',
            arrivals: 1,
            requests: null,
            audienceAtStart: 0,
            joined: 0,
            departures: 0,
          },
        },
      ],
      { MUTUAL_PROMOTION: 20 },
    );
    expect(source).toMatchObject({
      requests: null,
      joined: 0,
      departurePercent: null,
      costPerRequest: null,
      costPerSubscriber: null,
    });
  });

  it('withholds workspace-wide aggregates for limited roles', () => {
    const features = ['dashboard', 'channels', 'advertising', 'adSales.sales'];
    const access = dashboardReadAccess(features, [
      'channels.view',
      'advertising.editOwn',
      'adSales.sales.view',
      'adSales.sales.editOwn',
    ]);
    const summary = filterDashboardSurface(
      {
        salesMix: {},
        trafficSources: [],
        spendingMix: {},
        investmentBreakdownForPeriod: [],
      },
      access,
      features,
    );
    for (const field of [
      'salesMix',
      'trafficSources',
      'spendingMix',
      'investmentBreakdownForPeriod',
    ]) {
      expect(summary).not.toHaveProperty(field);
    }
  });
});
