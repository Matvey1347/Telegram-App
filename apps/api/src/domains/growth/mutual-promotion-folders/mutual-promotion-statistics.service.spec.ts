import { MutualPromotionStatisticsService } from './mutual-promotion-statistics.service';

describe('MutualPromotionStatisticsService', () => {
  const service = new MutualPromotionStatisticsService();

  it('calculates folder-scoped subscriber price and estimated churn', () => {
    const stats = service.participant({
      role: 'PUBLISHER',
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
      retainedCount: 6,
      subscriberPrice: 4,
      retainedSubscriberPrice: 40 / 6,
      currency: 'USD',
      dataQuality: 'CACHED_BOUNDARIES',
    });
  });

  it('keeps price null when no subscribers joined', () => {
    const stats = service.participant({
      role: 'PUBLISHER',
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
    expect(stats.retainedCount).toBe(0);
    expect(stats.retainedSubscriberPrice).toBeNull();
    expect(stats.dataQuality).toBe('INCOMPLETE');
  });

  it('uses only invite-link arrivals for a paid channel', () => {
    const stats = service.participant({
      role: 'PAID',
      subscribersAtStart: 100,
      subscribersAtEnd: 80,
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

    expect(stats).toMatchObject({
      joinedCount: 10,
      unsubscribedCount: null,
      unsubscribedIsEstimate: false,
      audienceDelta: null,
      retainedCount: null,
      subscriberPrice: 4,
      retainedSubscriberPrice: null,
    });
  });

  it('shows the current invite-link increase while a folder is active', () => {
    const stats = service.participant(
      {
        role: 'PUBLISHER',
        subscribersAtStart: 884,
        subscribersAtEnd: null,
        inviteJoinedAtStart: 20,
        inviteJoinedAtEnd: null,
        baselineCapturedAt: new Date('2026-09-09T21:59:27.650Z'),
        finalCapturedAt: null,
        currentSubscribersCount: 890,
        currentInviteJoinedCount: 29,
        expense: null,
      },
      { useCurrentCounters: true },
    );

    expect(stats).toMatchObject({
      joinedCount: 9,
      audienceDelta: 6,
      retainedCount: 6,
      unsubscribedCount: 3,
      dataQuality: 'CURRENT_COUNTERS',
    });
  });

  it('caps retained subscribers between zero and invite-link arrivals', () => {
    const negative = service.participant({
      role: 'PUBLISHER',
      subscribersAtStart: 100,
      subscribersAtEnd: 90,
      inviteJoinedAtStart: 20,
      inviteJoinedAtEnd: 30,
      baselineCapturedAt: new Date(),
      finalCapturedAt: new Date(),
      expense: null,
    });
    const organicGrowth = service.participant({
      role: 'PUBLISHER',
      subscribersAtStart: 100,
      subscribersAtEnd: 130,
      inviteJoinedAtStart: 20,
      inviteJoinedAtEnd: 30,
      baselineCapturedAt: new Date(),
      finalCapturedAt: new Date(),
      expense: null,
    });

    expect(negative.retainedCount).toBe(0);
    expect(organicGrowth.retainedCount).toBe(10);
  });
});
