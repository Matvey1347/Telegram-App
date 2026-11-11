import {
  buildTelegramAiPostingRhythm,
  type RhythmSample,
} from './telegram-ai-posting-rhythm';

describe('AI Posting rhythm recommendation', () => {
  it('uses the median daily cadence, popular hours, and excludes paid/promotional posts', () => {
    const now = new Date('2026-11-11T12:00:00Z');
    const samples: RhythmSample[] = [];
    for (let day = 1; day <= 28; day++) {
      for (let index = 0; index < 2; index++)
        samples.push({
          publishedAt: new Date(now.getTime() - day * 86_400_000 + index * 3_600_000),
          publishHour: index === 0 ? 9 : 18,
          publishWeekday: 1,
          origin: 'AI',
        });
    }
    samples.push({
      publishedAt: new Date(now.getTime() - 86_400_000),
      publishHour: 12,
      publishWeekday: 1,
      origin: 'AD',
    });
    const result = buildTelegramAiPostingRhythm(samples, now);
    expect(result.postsPerDay).toBe(2);
    expect(result.slots).toEqual(['09:00', '18:00']);
    expect(result.samplePosts).toBe(56);
    expect(result.advertisingShare).toBeCloseTo(1 / 57);
  });
});
