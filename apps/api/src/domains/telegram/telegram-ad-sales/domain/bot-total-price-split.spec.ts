import { splitTelegramAdSalesBotTotalPrice } from './bot-total-price-split';

describe('splitTelegramAdSalesBotTotalPrice', () => {
  it('splits cents deterministically by sorted channel id', () => {
    expect(
      splitTelegramAdSalesBotTotalPrice(10, [
        'channel-c',
        'channel-a',
        'channel-b',
      ]),
    ).toEqual([
      { channelId: 'channel-a', amount: 3.34 },
      { channelId: 'channel-b', amount: 3.33 },
      { channelId: 'channel-c', amount: 3.33 },
    ]);
  });

  it('preserves the exact total in integer cents', () => {
    const result = splitTelegramAdSalesBotTotalPrice(1250.5, [
      'channel-1',
      'channel-2',
      'channel-3',
      'channel-4',
    ]);
    expect(
      result.reduce((sum, item) => sum + Math.round(item.amount * 100), 0),
    ).toBe(125_050);
  });

  it('allocates proportionally by channel audience and keeps the exact total', () => {
    const result = splitTelegramAdSalesBotTotalPrice(
      735,
      ['small', 'large', 'medium'],
      { small: 10_000, medium: 20_000, large: 70_000 },
    );

    expect(result).toEqual([
      { channelId: 'large', amount: 514.5 },
      { channelId: 'medium', amount: 147 },
      { channelId: 'small', amount: 73.5 },
    ]);
    expect(result.reduce((sum, item) => sum + item.amount, 0)).toBe(735);
  });

  it.each([
    [0, ['channel-1'], 'positive'],
    [10.001, ['channel-1'], 'two decimal'],
    [0.01, ['channel-1', 'channel-2'], 'at least 0.01'],
  ] as const)('rejects invalid total %s', (total, channelIds, message) => {
    expect(() =>
      splitTelegramAdSalesBotTotalPrice(total, [...channelIds]),
    ).toThrow(message);
  });

  it('rejects duplicate channel ids', () => {
    expect(() =>
      splitTelegramAdSalesBotTotalPrice(10, ['channel-1', 'channel-1']),
    ).toThrow('unique');
  });
});
