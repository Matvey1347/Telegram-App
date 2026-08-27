import { resolveMajorityChannelCurrency } from './telegram-channel-network-currency';

describe('resolveMajorityChannelCurrency', () => {
  it('uses the currency configured by most channels', () => {
    expect(
      resolveMajorityChannelCurrency(
        [
          { kpiCurrency: 'UAH' },
          { kpiCurrency: 'usd' },
          { kpiCurrency: 'UAH' },
        ],
        'USD',
      ),
    ).toBe('UAH');
  });

  it('uses the workspace currency when channel votes are tied', () => {
    expect(
      resolveMajorityChannelCurrency(
        [{ kpiCurrency: 'EUR' }, { kpiCurrency: 'UAH' }],
        'UAH',
      ),
    ).toBe('UAH');
  });

  it('uses the workspace currency when All has no channels', () => {
    expect(resolveMajorityChannelCurrency([], 'UAH')).toBe('UAH');
  });
});
