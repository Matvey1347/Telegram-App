import { telegramAiPostingHybridMediaMode } from './telegram-ai-posting-hybrid-media';

describe('AI Posting hybrid allocation', () => {
  it.each([0, 17, 50, 70, 100])(
    'assigns %i of 100 consecutive publications to search',
    (percent) => {
      const modes = Array.from({ length: 100 }, (_, index) =>
        telegramAiPostingHybridMediaMode(index, percent),
      );
      expect(modes.filter((mode) => mode === 'found')).toHaveLength(percent);
      expect(modes.filter((mode) => mode === 'ai')).toHaveLength(100 - percent);
    },
  );

  it('distributes a 70% share across two differently sized batches', () => {
    const countSearch = (count: number, offset: number) =>
      Array.from({ length: count }, (_, index) =>
        telegramAiPostingHybridMediaMode(offset + index),
      ).filter((mode) => mode === 'found').length;
    expect(countSearch(4, 0)).toBe(3);
    expect(countSearch(3, 4) + countSearch(3, 7)).toBe(4);
  });
});
