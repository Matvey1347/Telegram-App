import {
  telegramPostEngagementMetrics,
  telegramPostTitle,
  telegramPostUrl,
  type TelegramPostEngagementRow,
} from './telegram-post-engagement';

const post = (
  overrides: Partial<TelegramPostEngagementRow> = {},
): TelegramPostEngagementRow => ({
  id: 'telegram-post-1',
  telegramMessageId: '42',
  text: 'A useful post',
  formattedText: '<b>A useful post</b>',
  hasMedia: false,
  mediaKind: null,
  postDate: new Date('2026-08-20T10:00:00.000Z'),
  viewsCount: 1_000,
  forwardsCount: 25,
  reactionsCount: 100,
  commentsCount: 10,
  manualOwnViews: 50,
  manualOwnReactions: 5,
  reactions: { '👍': 80, '🔥': 20 },
  createdAt: new Date('2026-08-20T10:01:00.000Z'),
  updatedAt: new Date('2026-08-20T11:00:00.000Z'),
  ...overrides,
});

describe('telegram post engagement read model', () => {
  it('calculates adjusted engagement and subscriber/view based rates', () => {
    expect(
      telegramPostEngagementMetrics(post(), {
        currentSubscribersCount: 2_000,
        ownViewsPerPost: 50,
        ownReactionsPerPost: 5,
      }),
    ).toEqual(
      expect.objectContaining({
        adjustedViewsCount: 900,
        adjustedReactionsCount: 90,
        err: 45,
        reactionRate: 10,
        forwardRate: 2.5,
        commentRate: 1,
        reactions: [
          { reaction: '👍', count: 80 },
          { reaction: '🔥', count: 20 },
        ],
      }),
    );
  });

  it('clamps adjusted counts and returns null rates for zero denominators', () => {
    const metrics = telegramPostEngagementMetrics(
      post({
        viewsCount: 10,
        reactionsCount: 1,
        manualOwnViews: 20,
        manualOwnReactions: 2,
      }),
      { currentSubscribersCount: 0 },
    );
    expect(metrics.adjustedViewsCount).toBe(0);
    expect(metrics.adjustedReactionsCount).toBe(0);
    expect(metrics.err).toBeNull();
    expect(metrics.reactionRate).toBeNull();
  });

  it('uses the subscriber count recorded at publication when provided', () => {
    const metrics = telegramPostEngagementMetrics(
      post(),
      { currentSubscribersCount: 2_000 },
      800,
    );

    expect(metrics.subscriberCount).toBe(800);
    expect(metrics.err).toBe(118.75);
  });

  it('does not fall back to current subscribers when publication history is missing', () => {
    const metrics = telegramPostEngagementMetrics(
      post(),
      { currentSubscribersCount: 2_000 },
      null,
    );

    expect(metrics.subscriberCount).toBeNull();
    expect(metrics.err).toBeNull();
  });

  it('builds a public URL and a safe media fallback title', () => {
    expect(telegramPostUrl({ username: '@example_channel' }, '42')).toBe(
      'https://t.me/example_channel/42',
    );
    expect(
      telegramPostTitle(
        post({
          text: null,
          formattedText: null,
          hasMedia: true,
          mediaKind: 'photo',
        }),
      ),
    ).toBe('Telegram post #42 (photo)');
  });
});
