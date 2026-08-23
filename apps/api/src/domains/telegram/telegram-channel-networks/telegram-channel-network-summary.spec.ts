import {
  aggregateChannelNetworkSummary,
  type ChannelNetworkSummaryInput,
} from './telegram-channel-network-summary';

function channel(
  overrides: Partial<ChannelNetworkSummaryInput> = {},
): ChannelNetworkSummaryInput {
  return {
    currency: 'UAH',
    subscribersCount: 1000,
    pendingJoinRequestsCount: 302,
    activeSubscribersEstimate: 200,
    paidActiveSubscribersEstimate: 100,
    avgViewsAdjusted: 400,
    avgReactionsAdjusted: 10,
    totalAdSpend: 900,
    campaignsCount: 1,
    totalJoinedSubscribers: 60,
    totalPendingSubscribers: 40,
    totalAttributedSubscribers: 100,
    kpiStatus: 'good',
    assetEconomics: {
      currency: 'UAH',
      invested: 1200,
      purchasePrice: 300,
      revenue: 600,
      adSpend: 900,
      adsSold: 2,
      conversionUnavailable: false,
      formatPricing: {
        currency: 'UAH',
        cpm: 300,
        h24: {
          expectedViews: 100,
          estimatedPrice: 30,
          postsSampleCount: 3,
          dataQuality: 'READY',
        },
        h48: {
          expectedViews: 150,
          estimatedPrice: 45,
          postsSampleCount: 3,
          dataQuality: 'READY',
        },
        h72: {
          expectedViews: 180,
          estimatedPrice: 54,
          postsSampleCount: 3,
          dataQuality: 'READY',
        },
        permanent: {
          expectedViews: 200,
          estimatedPrice: 60,
          postsSampleCount: 3,
          dataQuality: 'READY',
        },
      },
    },
    ...overrides,
  };
}

describe('aggregateChannelNetworkSummary', () => {
  it('aggregates attributed CPA, investment, revenue, payback and ad prices', () => {
    const summary = aggregateChannelNetworkSummary([
      channel(),
      channel({ subscribersCount: 500 }),
    ]);

    expect(summary).toMatchObject({
      channelsCount: 2,
      totalSubscribers: 1500,
      pendingJoinRequestsCount: 604,
      activeSubscribersEstimate: 400,
      reactionRate: 2.5,
      totalAdSpend: 1800,
      totalAttributedSubscribers: 200,
      avgCpa: 9,
      activeCpa: 9,
      assetEconomics: {
        currency: 'UAH',
        invested: 2400,
        revenue: 1200,
        remainingToBreakEven: 1200,
        paybackPercent: 50,
        estimatedAdPrice: 120,
        estimatedAdsRemaining: 10,
        formatPricing: {
          permanent: { expectedViews: 400, estimatedPrice: 120 },
        },
      },
    });
  });

  it('does not add monetary values from different currencies', () => {
    const usdChannel = channel();
    if (!usdChannel.assetEconomics) throw new Error('Missing test economics');
    usdChannel.currency = 'USD';
    usdChannel.assetEconomics = {
      ...usdChannel.assetEconomics,
      currency: 'USD',
    };
    const summary = aggregateChannelNetworkSummary([channel(), usdChannel]);

    expect(summary.totalAdSpend).toBeNull();
    expect(summary.avgCpa).toBeNull();
    expect(summary.assetEconomics).toMatchObject({
      currency: null,
      invested: null,
      conversionUnavailable: true,
    });
  });

  it('ignores the currency of an empty channel when aggregating active finances', () => {
    const emptyUsd = channel({
      currency: 'USD',
      totalAdSpend: 0,
      campaignsCount: 0,
      totalJoinedSubscribers: 0,
      totalPendingSubscribers: 0,
      totalAttributedSubscribers: 0,
      assetEconomics: {
        currency: 'USD',
        invested: 0,
        purchasePrice: null,
        revenue: 0,
        adSpend: 0,
        adsSold: 0,
        conversionUnavailable: false,
        formatPricing: null,
      },
    });

    const summary = aggregateChannelNetworkSummary([channel(), emptyUsd]);

    expect(summary).toMatchObject({
      currency: 'UAH',
      totalAdSpend: 900,
      avgCpa: 9,
      assetEconomics: {
        currency: 'UAH',
        invested: 1200,
        revenue: 600,
        conversionUnavailable: false,
      },
    });
  });

  it('uses joined plus pending subscribers for CPA regression coverage', () => {
    const summary = aggregateChannelNetworkSummary([
      channel({
        totalAdSpend: 4000,
        totalJoinedSubscribers: 0,
        totalPendingSubscribers: 100,
        totalAttributedSubscribers: 100,
      }),
    ]);

    expect(summary.avgCpa).toBe(40);
  });

  it('weights the network reaction rate by adjusted views', () => {
    const summary = aggregateChannelNetworkSummary([
      channel({ avgViewsAdjusted: 900, avgReactionsAdjusted: 18 }),
      channel({ avgViewsAdjusted: 100, avgReactionsAdjusted: 10 }),
    ]);

    expect(summary.reactionRate).toBeCloseTo(2.8);
    expect(
      aggregateChannelNetworkSummary([
        channel({ avgViewsAdjusted: null, avgReactionsAdjusted: null }),
      ]).reactionRate,
    ).toBeNull();
  });
});
