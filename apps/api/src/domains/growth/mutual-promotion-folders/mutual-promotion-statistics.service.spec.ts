import { MutualPromotionStatisticsService } from './mutual-promotion-statistics.service';

describe('MutualPromotionStatisticsService', () => {
  const service = new MutualPromotionStatisticsService();

  it('calculates folder-scoped subscriber price and estimated churn', () => {
    const stats = service.participant({
      subscribersAtStart: 100,
      subscribersAtEnd: 106,
      inviteJoinedAtStart: 20,
      inviteJoinedAtEnd: 30,
      baselineCapturedAt: new Date(),
      finalCapturedAt: new Date(),
      expense: {
        id: 'transaction-1',
        accountId: 'account-1',
        amount: 40,
        currency: 'USD',
        amountInPrimaryCurrency: 40,
        account: { name: 'Main' },
      },
    });

    expect(stats).toEqual({
      joinedCount: 10,
      unsubscribedCount: 4,
      unsubscribedIsEstimate: true,
      audienceDelta: 6,
      subscriberPrice: 4,
      currency: 'USD',
      dataQuality: 'CACHED_BOUNDARIES',
    });
  });

  it('keeps price null when no subscribers joined', () => {
    const stats = service.participant({
      subscribersAtStart: 100,
      subscribersAtEnd: 98,
      inviteJoinedAtStart: 20,
      inviteJoinedAtEnd: 20,
      baselineCapturedAt: new Date(),
      finalCapturedAt: null,
      expense: {
        id: 'transaction-1',
        accountId: 'account-1',
        amount: 40,
        currency: 'USD',
        amountInPrimaryCurrency: 40,
        account: { name: 'Main' },
      },
    });

    expect(stats.subscriberPrice).toBeNull();
    expect(stats.dataQuality).toBe('INCOMPLETE');
  });
});
