import {
  computeTelegramPostPerformance,
  isSnapshotAtPerformanceAgePoint,
  selectMetricSnapshotAtWindow,
  visibleTelegramText,
  type PerformancePostInput,
} from './telegram-post-performance-math';

const post = (
  id: string,
  postDate: Date,
  views = 100,
): PerformancePostInput => ({
  id,
  telegramChannelId: 'channel-1',
  telegramMessageId: id,
  postDate,
  viewsCount: views,
  reactionsCount: 10,
  forwardsCount: 2,
  commentsCount: 1,
  text: 'Useful post?',
  formattedText: null,
  hasMedia: false,
  mediaKind: null,
  imageUrls: [],
  excludeFromAnalytics: false,
  adSalePlacements: [],
  managedPosts: [],
  metricSnapshots: [],
});

describe('Telegram post performance calculation', () => {
  it('uses visible text for HTML and managed editor markup', () => {
    expect(visibleTelegramText('<strong>Visible title</strong>')).toBe(
      'Visible title',
    );
    expect(visibleTelegramText('**Visible title**')).toBe('Visible title');
  });

  it('does not use a snapshot outside the age-point tolerance', () => {
    const publishedAt = new Date('2026-01-01T00:00:00Z');
    const now = new Date('2026-01-02T04:00:00Z');
    expect(
      selectMetricSnapshotAtWindow(
        publishedAt,
        [
          {
            collectedAt: new Date('2026-01-02T03:00:00Z'),
            viewsCount: 100,
            reactionsCount: 5,
            forwardsCount: 1,
            commentsCount: 0,
          },
        ],
        24,
        2,
        now,
      ),
    ).toBeNull();
  });

  it('recognizes only metric snapshots inside the configured age windows', () => {
    const publishedAt = new Date('2026-01-01T00:00:00Z');
    expect(
      isSnapshotAtPerformanceAgePoint(
        publishedAt,
        new Date('2026-01-02T02:00:00Z'),
      ),
    ).toBe(true);
    expect(
      isSnapshotAtPerformanceAgePoint(
        publishedAt,
        new Date('2026-01-02T03:00:00Z'),
      ),
    ).toBe(false);
  });

  it('calculates saturated scores only after seven days', () => {
    const publishedAt = new Date('2026-01-01T00:00:00Z');
    const target = post('target', publishedAt, 400);
    const comparable = Array.from({ length: 8 }, (_, index) => {
      const item = post(
        `prior-${index}`,
        new Date(publishedAt.getTime() - (index + 1) * 60 * 60 * 1000),
        200,
      );
      item.metricSnapshots = [
        {
          collectedAt: new Date(item.postDate.getTime() + 24 * 60 * 60 * 1000),
          viewsCount: 200,
          reactionsCount: null,
          forwardsCount: null,
          commentsCount: null,
        },
        {
          collectedAt: new Date(
            publishedAt.getTime() + 8 * 24 * 60 * 60 * 1000,
          ),
          viewsCount: 200,
          reactionsCount: null,
          forwardsCount: null,
          commentsCount: null,
        },
      ];
      return item;
    });
    const early = computeTelegramPostPerformance(
      target,
      comparable,
      'UTC',
      new Date(publishedAt.getTime() + 6 * 24 * 60 * 60 * 1000),
    );
    expect(early.scoreFinal).toBeNull();

    const mature = computeTelegramPostPerformance(
      target,
      comparable,
      'UTC',
      new Date(publishedAt.getTime() + 8 * 24 * 60 * 60 * 1000),
    );
    expect(mature.normFinal).toBe(200);
    expect(mature.scoreFinal).toBe(2);
  });

  it('excludes ads, mutual promotions, and explicitly excluded posts from norms', () => {
    const publishedAt = new Date('2026-01-01T00:00:00Z');
    const target = post('target', publishedAt, 400);
    const eligible = Array.from({ length: 7 }, (_, index) => {
      const item = post(
        `ordinary-${index}`,
        new Date(publishedAt.getTime() - (index + 1) * 60 * 60 * 1000),
        100,
      );
      item.metricSnapshots = [
        {
          collectedAt: new Date(item.postDate.getTime() + 24 * 60 * 60 * 1000),
          viewsCount: 100,
          reactionsCount: null,
          forwardsCount: null,
          commentsCount: null,
        },
      ];
      return item;
    });
    const excluded = [
      post('ad', new Date(publishedAt.getTime() - 8 * 60 * 60 * 1000)),
      post('promo', new Date(publishedAt.getTime() - 9 * 60 * 60 * 1000)),
      post(
        'manual-exclusion',
        new Date(publishedAt.getTime() - 10 * 60 * 60 * 1000),
      ),
    ];
    excluded[0].adSalePlacements = [{ id: 'placement' }];
    excluded[1].crossPromotion = true;
    excluded[2].excludeFromAnalytics = true;
    for (const item of excluded) {
      item.metricSnapshots = [
        {
          collectedAt: new Date(item.postDate.getTime() + 24 * 60 * 60 * 1000),
          viewsCount: 10000,
          reactionsCount: null,
          forwardsCount: null,
          commentsCount: null,
        },
      ];
    }

    const result = computeTelegramPostPerformance(
      target,
      [...eligible, ...excluded],
      'UTC',
      new Date(publishedAt.getTime() + 2 * 24 * 60 * 60 * 1000),
    );
    expect(result.norm24h).toBeNull();
    expect(result.normSampleSize).toBe(7);
    expect(result.normReason).toBe('NOT_ENOUGH_DATA');
  });
});
