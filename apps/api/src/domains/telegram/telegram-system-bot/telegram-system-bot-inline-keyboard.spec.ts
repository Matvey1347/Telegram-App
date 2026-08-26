import { compactSystemBotInlineKeyboard } from './telegram-system-bot-inline-keyboard';

describe('compactSystemBotInlineKeyboard', () => {
  it('packs options into two columns without dropping the final item', () => {
    expect(compactSystemBotInlineKeyboard([1, 2, 3, 4, 5])).toEqual([
      [1, 2],
      [3, 4],
      [5],
    ]);
  });

  it('supports three compact columns and a bounded option count', () => {
    expect(
      compactSystemBotInlineKeyboard(['a', 'b', 'c', 'd', 'e'], {
        columns: 3,
        limit: 4,
      }),
    ).toEqual([['a', 'b', 'c'], ['d']]);
  });

  it('returns no rows for an empty list', () => {
    expect(compactSystemBotInlineKeyboard([])).toEqual([]);
  });
});
