import {
  buildTelegramAiPostingLearningBlock,
  recentTelegramAiPostingHistory,
} from './telegram-ai-posting-learning';

describe('Telegram AI Posting learning prompt', () => {
  const now = new Date('2026-11-10T12:00:00Z');
  const rows = (count = 12) =>
    Array.from({ length: count }, (_, index) => ({
      origin: 'AI',
      score24h: index / 10,
      scoreFinal: index / 10,
      publishedAt: new Date(now.getTime() - (index + 1) * 86_400_000),
      text: `Post ${index}`,
      formattedText: null,
      excludedFromNorm: false,
      lengthBand: index < 8 ? 'long' : 'short',
      hasMedia: index % 2 === 0,
      endsWithQuestion: index % 3 === 0,
    }));

  it('excludes ads, promotions, excluded and empty posts from examples', () => {
    const posts = rows(12);
    posts[0].origin = 'AD';
    posts[1].origin = 'MUTUAL_PROMO';
    posts[2].excludedFromNorm = true;
    posts[3].text = '';
    const block = buildTelegramAiPostingLearningBlock(posts, { now });
    expect(block).not.toContain('Post 0');
    expect(block).not.toContain('— Post 1\n');
    expect(block).not.toContain('Post 2');
    expect(block).not.toContain('Post 3');
  });

  it('respects historyFrom when selecting learning examples', () => {
    const posts = rows(8);
    posts.forEach((post, index) => {
      post.publishedAt = new Date(now.getTime() - index * 60 * 60 * 1000);
    });
    const outside = rows(1)[0];
    outside.text = 'OUTSIDE-CUTOFF';
    outside.publishedAt = new Date('2026-10-01T00:00:00Z');
    outside.scoreFinal = 99;
    posts.push(outside);
    const block = buildTelegramAiPostingLearningBlock(posts, {
      now,
      historyMode: 'since',
      historyFrom: '2026-11-05T00:00:00Z',
    });
    expect(block).toContain('Post 7');
    expect(block).not.toContain('OUTSIDE-CUTOFF');
  });

  it('uses the 30 most recent repeat-protection examples', () => {
    expect(recentTelegramAiPostingHistory(
      Array.from({ length: 45 }, (_, index) => ({ text: String(index) })),
    )).toHaveLength(30);
    expect(recentTelegramAiPostingHistory(
      Array.from({ length: 45 }, (_, index) => ({ text: String(index) })),
    )[0].text).toBe('0');
  });
});
