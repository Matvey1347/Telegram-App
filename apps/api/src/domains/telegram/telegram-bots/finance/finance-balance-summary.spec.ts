import { financeBalanceSummary } from './finance-balance-summary';

describe('financeBalanceSummary', () => {
  it('sums only active accounts expressed in the profile currency', () => {
    expect(
      financeBalanceSummary(
        [
          {
            id: 'cash',
            name: 'Cash',
            currency: 'USD',
            balance: '100.10',
            archivedAt: null,
          },
          {
            id: 'euro-card',
            name: 'Euro card',
            currency: 'EUR',
            balance: '10',
            equivalentBalance: { amount: '11.25', currency: 'USD' },
            archivedAt: null,
          },
          {
            id: 'travel',
            name: 'Travel',
            currency: 'GBP',
            balance: '20',
            equivalentBalance: null,
            archivedAt: null,
          },
          {
            id: 'old',
            name: 'Old account',
            currency: 'USD',
            balance: '999',
            archivedAt: '2026-01-01T00:00:00.000Z',
          },
        ],
        'USD',
      ),
    ).toEqual({
      amount: '111.35',
      currency: 'USD',
      includedAccountCount: 2,
      excludedAccounts: [
        {
          accountId: 'travel',
          name: 'Travel',
          balance: '20',
          currency: 'GBP',
          reason: 'RATE_UNAVAILABLE',
        },
      ],
    });
  });

  it('returns an authoritative zero when no active account can be included', () => {
    expect(
      financeBalanceSummary(
        [
          {
            id: 'foreign',
            name: 'Foreign',
            currency: 'EUR',
            balance: '1',
            equivalentBalance: null,
          },
        ],
        'USD',
      ),
    ).toMatchObject({ amount: '0', includedAccountCount: 0 });
  });
});
