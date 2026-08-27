import {
  compactSystemBotInlineKeyboard,
  systemBotReviewActionRow,
} from './telegram-system-bot-inline-keyboard';

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

  it('keeps icon-only Back, Cancel and Confirm in the shared review order', () => {
    expect(systemBotReviewActionRow('flow:')).toEqual([
      { text: '←', callback_data: 'flow:back' },
      { text: '❌', callback_data: 'flow:cancel' },
      { text: '✅', callback_data: 'flow:confirm' },
    ]);
  });
});
