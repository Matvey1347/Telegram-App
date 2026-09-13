import {
  buildDashboardCategoryBreakdown,
  buildDashboardCashFlowBreakdown,
  isDashboardRevenueTransaction,
} from './dashboard-financial-metrics';

describe('dashboard financial metrics', () => {
  it('excludes balance corrections from revenue and separates channel cash flow', () => {
    const channelRevenue = {
      type: 'income',
      amountInPrimaryCurrency: 2_862,
      category: 'Channel Advertising Revenue',
      categoryRef: { key: 'channel_advertising_revenue' },
    };
    const balanceCorrection = {
      type: 'income',
      amountInPrimaryCurrency: 5_773,
      category: 'Fixing Balance',
      categoryRef: null,
    };
    const botRevenue = {
      type: 'income',
      amountInPrimaryCurrency: 100,
      category: 'Bot subscriptions',
      categoryRef: { key: 'bot_subscriptions' },
    };
    const channelExpense = {
      id: 'expense-1',
      type: 'expense',
      amount: 250,
      currency: 'UAH',
      amountInPrimaryCurrency: 500,
      description: 'Campaign payment',
      date: new Date('2026-09-08T12:00:00.000Z'),
      category: 'Advertising',
      categoryRef: {
        key: 'advertising',
        name: 'Advertising',
        icon: null,
      },
      account: {
        id: 'account-1',
        name: 'Ukraine Card',
        currency: 'UAH',
        icon: null,
      },
    };
    const otherExpense = {
      type: 'expense',
      amountInPrimaryCurrency: 40,
      category: 'AI Tokens',
      categoryRef: { key: null },
    };
    const expenseBalanceCorrection = {
      type: 'expense',
      amountInPrimaryCurrency: 430,
      category: 'Balance Adjustment',
      categoryRef: null,
    };

    expect(isDashboardRevenueTransaction(balanceCorrection)).toBe(false);
    const breakdown = buildDashboardCashFlowBreakdown(
      [channelRevenue, botRevenue],
      [channelExpense, otherExpense],
      [balanceCorrection, expenseBalanceCorrection],
    );
    expect(breakdown.income.channels).toBe(2_862);
    expect(breakdown.income.other).toBe(100);
    expect(breakdown.expenses).toEqual({ channels: 500, other: 40 });
    expect(breakdown.excludedBalanceAdjustments).toBe(6_203);
    expect(
      buildDashboardCategoryBreakdown([
        channelRevenue,
        botRevenue,
        channelExpense,
        otherExpense,
      ]).map(({ name, bucket }) => ({ name, bucket })),
    ).toEqual([
      { name: 'Channel Advertising Revenue', bucket: 'channels' },
      { name: 'Advertising', bucket: 'channels' },
      { name: 'Bot subscriptions', bucket: 'other' },
      { name: 'AI Tokens', bucket: 'other' },
    ]);
    const advertising = buildDashboardCategoryBreakdown([channelExpense])[0];
    expect(advertising).toMatchObject({
      name: 'Advertising',
      flow: 'expense',
      excludedFromCashFlow: false,
      transactions: [
        {
          id: 'expense-1',
          description: 'Campaign payment',
          date: '2026-09-08T12:00:00.000Z',
          amount: 250,
          currency: 'UAH',
          amountInPrimaryCurrency: 500,
          account: { id: 'account-1', name: 'Ukraine Card' },
        },
      ],
    });
  });
});
