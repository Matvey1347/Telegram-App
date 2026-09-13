import {
  allocateProfitByCapital,
  reinvestableProfit,
  salesCommission,
} from './member-finance-calculations';

describe('member finance calculations', () => {
  it('accrues sales commission from the received amount', () => {
    expect(salesCommission(1_000, 12.5)).toBe(125);
    expect(salesCommission(19.99, 7)).toBe(1.4);
  });

  it('calculates reinvestable profit after accrued salary without double-counting its payout', () => {
    const profit = reinvestableProfit({
      operatingTransactions: [
        {
          id: 'revenue',
          type: 'income',
          amountInPrimaryCurrency: 1_000,
          categoryKey: 'channel_advertising_revenue',
        },
        {
          id: 'salary-payout',
          type: 'expense',
          amountInPrimaryCurrency: 100,
          categoryKey: 'salary',
        },
        {
          id: 'hosting',
          type: 'expense',
          amountInPrimaryCurrency: 50,
          categoryKey: 'hosting',
        },
        {
          id: 'capital',
          type: 'income',
          amountInPrimaryCurrency: 5_000,
          categoryKey: 'investment',
        },
      ],
      commissionPayoutTransactionIds: new Set(['salary-payout']),
      accruedSalesCommission: 100,
    });

    expect(profit).toBe(850);
  });

  it('allocates every cent by capital share with deterministic rounding', () => {
    const allocations = allocateProfitByCapital(1_000.01, [
      { memberId: 'investor-30', amount: 300 },
      { memberId: 'investor-70', amount: 700 },
    ]);

    expect(allocations).toEqual([
      { memberId: 'investor-30', amount: 300 },
      { memberId: 'investor-70', amount: 700.01 },
    ]);
    expect(allocations.reduce((sum, row) => sum + row.amount, 0)).toBe(
      1_000.01,
    );
  });

  it('does not allocate profit without positive investor capital', () => {
    expect(
      allocateProfitByCapital(100, [
        { memberId: 'withdrawn', amount: 0 },
        { memberId: 'negative', amount: -10 },
      ]),
    ).toEqual([]);
  });
});
