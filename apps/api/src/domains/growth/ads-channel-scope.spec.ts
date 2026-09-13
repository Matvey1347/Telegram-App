import { adsChannelWhere, parseAdsChannelIds } from './ads-channel-scope';

describe('Ads channel scope', () => {
  it('normalizes and deduplicates a multi-channel filter', () => {
    expect(parseAdsChannelIds(' channel-1,channel-2,channel-1, ')).toEqual([
      'channel-1',
      'channel-2',
    ]);
    expect(adsChannelWhere(undefined, 'channel-1,channel-2')).toEqual({
      in: ['channel-1', 'channel-2'],
    });
  });

  it('keeps the legacy single-channel filter and supports an empty scope', () => {
    expect(adsChannelWhere('channel-1')).toBe('channel-1');
    expect(adsChannelWhere()).toBeUndefined();
  });
});
