import {
  effectiveCampaignActiveSubscribers,
  effectiveCampaignAttributedSubscribers,
  effectiveCampaignJoinedSubscribers,
  effectiveCampaignPendingSubscribers,
  resolveChannelKpiLabel,
  resolveChannelKpiStatus,
  calculateChannelAssetEconomics,
} from './channel-financial-summary';

describe('channel-financial-summary', () => {
  it('uses the same joined formula for channel cards and channel detail', () => {
    expect(
      effectiveCampaignJoinedSubscribers({
        joinedCount: 23,
        newSubscribers: 23,
        inviteLinks: [{ joinedCount: 80 }, { joinedCount: 72 }],
      }),
    ).toBe(152);
  });

  it('keeps pending requests in attributed totals used for CPA and KPI', () => {
    const campaign = {
      joinedCount: 23,
      requestedCount: 5,
      inviteLinks: [
        { joinedCount: 80, requestedCount: 12 },
        { joinedCount: 72, requestedCount: 8 },
      ],
    };

    expect(effectiveCampaignJoinedSubscribers(campaign)).toBe(152);
    expect(effectiveCampaignPendingSubscribers(campaign)).toBe(20);
    expect(effectiveCampaignAttributedSubscribers(campaign)).toBe(172);
  });

  it('falls back to campaign active subscribers before channel-level estimate', () => {
    expect(
      effectiveCampaignActiveSubscribers({
        cappedActiveSubscribersFromAd: 54,
        activeSubscribersFromAd: 40,
      }),
    ).toBe(54);
  });

  it('classifies KPI status with the same thresholds', () => {
    const status = resolveChannelKpiStatus({
      avgCpa: 0.79,
      targetCpaFrom: 0.3,
      targetCpa: 0.6,
      acceptableCpaFrom: 0.6,
      acceptableCpa: 1.2,
      stopCpaFrom: 1.2,
    });

    expect(status).toBe('acceptable');
    expect(resolveChannelKpiLabel(status)).toBe('Acceptable');
  });

  it('uses inclusive Good and Stop boundaries with an implicit Normal interval', () => {
    const thresholds = { targetCpa: 30, stopCpaFrom: 50 };
    expect(resolveChannelKpiStatus({ avgCpa: 30, ...thresholds })).toBe('good');
    expect(resolveChannelKpiStatus({ avgCpa: 31, ...thresholds })).toBe('acceptable');
    expect(resolveChannelKpiStatus({ avgCpa: 50, ...thresholds })).toBe('bad');
  });

  it('calculates payback without double-counting converted transaction representations', () => {
    const economics = calculateChannelAssetEconomics({
      currency: 'UAH',
      invested: 7000,
      revenue: 0,
      adsSold: 0,
      expectedViews: 10_000,
      cpm: 50,
    });
    expect(economics.invested).toBe(7000);
    expect(economics.remainingToBreakEven).toBe(7000);
    expect(economics.estimatedAdsRemaining).toBe(14);
  });

  it('keeps mixed-currency economics unavailable when conversion is unavailable', () => {
    const economics = calculateChannelAssetEconomics({
      currency: 'UAH',
      invested: null,
      revenue: null,
      adsSold: 0,
      expectedViews: 0,
      cpm: null,
      conversionUnavailable: true,
    });
    expect(economics.remainingToBreakEven).toBeNull();
    expect(economics.paybackPercent).toBeNull();
  });
});
