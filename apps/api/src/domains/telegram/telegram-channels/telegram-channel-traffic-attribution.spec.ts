import {
  buildTrafficAttributionHistoryPoints,
  summarizeTrafficAttribution,
  trafficAttributionMetrics,
} from './telegram-channel-traffic-attribution';

describe('telegram channel traffic attribution', () => {
  it('calculates churn and paid acquisition costs', () => {
    expect(
      trafficAttributionMetrics({
        acquired: 100,
        retained: 80,
        spend: 400,
        currency: 'UAH',
      }),
    ).toEqual({
      acquired: 100,
      retained: 80,
      unsubscribed: 20,
      unsubscribePercent: 20,
      spend: 400,
      averageSubscriberCost: 4,
      retainedSubscriberCost: 5,
      currency: 'UAH',
    });
  });

  it('keeps free sources out of the blended paid cost', () => {
    const summary = summarizeTrafficAttribution(
      [
        {
          id: 'ads-1',
          kind: 'AD_CAMPAIGNS',
          title: 'Ads',
          subtitle: null,
          avatarUrl: null,
          inviteLinkIds: ['link-1'],
          inviteLinks: [
            { id: 'link-1', name: 'Ads link', url: 'https://t.me/+ads' },
          ],
          startsAt: null,
          endsAt: null,
          ...trafficAttributionMetrics({
            acquired: 10,
            retained: 8,
            spend: 100,
            currency: 'UAH',
          }),
        },
        {
          id: 'bot-1',
          kind: 'BOT',
          title: 'Bot',
          subtitle: null,
          avatarUrl: null,
          inviteLinkIds: ['link-2'],
          inviteLinks: [
            { id: 'link-2', name: 'Bot link', url: 'https://t.me/+bot' },
          ],
          startsAt: null,
          endsAt: null,
          ...trafficAttributionMetrics({
            acquired: 10,
            retained: 10,
            spend: null,
            currency: 'UAH',
          }),
        },
      ],
      'UAH',
    );

    expect(summary).toEqual(
      expect.objectContaining({
        acquired: 20,
        retained: 18,
        spend: 100,
        averageSubscriberCost: 10,
        retainedSubscriberCost: 12.5,
      }),
    );
  });

  it('preserves the peak after an invite counter drops', () => {
    const points = buildTrafficAttributionHistoryPoints(
      [
        {
          inviteLinkId: 'link-1',
          syncedAt: new Date('2026-09-01T10:00:00.000Z'),
          joinedCount: 100,
          requestedCount: 10,
        },
        {
          inviteLinkId: 'link-1',
          syncedAt: new Date('2026-09-02T10:00:00.000Z'),
          joinedCount: 80,
          requestedCount: 10,
        },
      ],
      [{ id: 'link-1', joinedCount: 80, requestedCount: 10 }],
      new Map([['link-1', 'BOT']]),
      new Date('2026-09-02T12:00:00.000Z'),
    );

    expect(points.at(-1)).toEqual(
      expect.objectContaining({
        kind: 'BOT',
        acquired: 110,
        retained: 90,
        unsubscribed: 20,
      }),
    );
  });
});
