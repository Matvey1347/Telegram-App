import { Prisma } from '@prisma/client';
import { FinanceAnalyticsService } from './finance-analytics.service';

const decimal = (value: Prisma.Decimal.Value) => new Prisma.Decimal(value);

describe('FinanceAnalyticsService', () => {
  const profile = {
    id: 'profile-1',
    workspaceId: 'workspace-1',
    defaultCurrency: 'USD',
    timezone: 'UTC',
  };

  it('returns complete deterministic analytics and keeps pre-valuation rows out of comparable totals', async () => {
    const queryRaw = jest
      .fn()
      .mockResolvedValueOnce([
        {
          segment: 'CURRENT',
          type: 'INCOME',
          nativeAmount: decimal(100),
          valuedAmount: null,
        },
        {
          segment: 'CURRENT',
          type: 'EXPENSE',
          nativeAmount: decimal(40),
          valuedAmount: null,
        },
        {
          segment: 'PREVIOUS',
          type: 'INCOME',
          nativeAmount: decimal(80),
          valuedAmount: null,
        },
        {
          segment: 'CURRENT',
          type: 'EXPENSE',
          purpose: 'INVESTMENT_CONTRIBUTION',
          nativeAmount: decimal(10),
          valuedAmount: null,
        },
        {
          segment: 'CURRENT',
          type: 'INCOME',
          purpose: 'INVESTMENT_RETURN',
          nativeAmount: decimal(5),
          valuedAmount: null,
        },
        {
          segment: 'PREVIOUS',
          type: 'EXPENSE',
          nativeAmount: decimal(50),
          valuedAmount: null,
        },
      ])
      .mockResolvedValueOnce([
        {
          type: 'EXPENSE',
          categoryId: 'food',
          categoryName: 'Food',
          categoryKey: 'food',
          nativeAmount: decimal(40),
          valuedAmount: null,
        },
        {
          type: 'INCOME',
          categoryId: 'salary',
          categoryName: 'Salary',
          categoryKey: 'salary',
          nativeAmount: decimal(100),
          valuedAmount: null,
        },
      ])
      .mockResolvedValueOnce([
        {
          type: 'INCOME',
          accountId: 'cash',
          accountName: 'Cash',
          nativeAmount: decimal(100),
          valuedAmount: null,
        },
        {
          type: 'EXPENSE',
          accountId: 'cash',
          accountName: 'Cash',
          nativeAmount: decimal(40),
          valuedAmount: null,
        },
      ])
      .mockResolvedValueOnce([
        {
          type: 'INCOME',
          day: '2026-08-02',
          nativeAmount: decimal(100),
          valuedAmount: null,
        },
        {
          type: 'EXPENSE',
          day: '2026-08-03',
          nativeAmount: decimal(40),
          valuedAmount: null,
        },
      ])
      .mockResolvedValueOnce([
        {
          segment: 'CURRENT',
          currency: 'UAH',
          amount: decimal(1000),
          transactions: 2n,
        },
        {
          segment: 'PREVIOUS',
          currency: 'EUR',
          amount: decimal(20),
          transactions: 1n,
        },
      ])
      .mockResolvedValueOnce([
        {
          segment: 'CURRENT',
          day: '2026-08-04',
          nativeAmount: decimal(15),
          valuedAmount: null,
        },
      ])
      .mockResolvedValueOnce([
        {
          segment: 'CURRENT',
          necessity: 'REQUIRED',
          nativeAmount: decimal(30),
          valuedAmount: null,
        },
        {
          segment: 'CURRENT',
          necessity: 'DISCRETIONARY',
          nativeAmount: decimal(10),
          valuedAmount: null,
        },
      ]);
    const service = new FinanceAnalyticsService({
      $queryRaw: queryRaw,
    } as never);

    const result = await service.analytics(profile, {
      period: 'CUSTOM',
      from: '2026-08-01',
      to: '2026-09-01',
    });

    expect(result.summary).toEqual({
      income: '100',
      expenses: '40',
      saved: '15',
      invested: '10',
      investmentReturns: '5',
      requiredExpenses: '30',
      discretionaryExpenses: '10',
      unspecifiedExpenses: '0',
      netCashflow: '55',
    });
    expect(result.comparison.summary).toEqual({
      income: '80',
      expenses: '50',
      saved: '0',
      invested: '0',
      investmentReturns: '0',
      requiredExpenses: '0',
      discretionaryExpenses: '0',
      unspecifiedExpenses: '0',
      netCashflow: '30',
    });
    expect(result.expensesByCategory[0]).toEqual(
      expect.objectContaining({ name: 'Food', amount: '40', percentage: 100 }),
    );
    expect(result.incomeByCategory[0]).toEqual(
      expect.objectContaining({
        name: 'Salary',
        amount: '100',
        percentage: 100,
      }),
    );
    expect(result.accounts).toEqual([
      {
        accountId: 'cash',
        name: 'Cash',
        income: '100',
        expenses: '40',
        invested: '0',
        investmentReturns: '0',
        netCashflow: '60',
      },
    ]);
    expect(result.timeline).toHaveLength(3);
    expect(result.trends).toContainEqual(
      expect.objectContaining({
        metric: 'INCOME',
        direction: 'UP',
        changePercent: 25,
      }),
    );
    expect(result.legacyFallback).toEqual(
      expect.objectContaining({ transactionCount: 2 }),
    );
    expect(result.comparison.legacyFallback).toEqual(
      expect.objectContaining({ transactionCount: 1 }),
    );
    expect(queryRaw).toHaveBeenCalledTimes(7);
  });

  it('keeps query count constant for a 100-account profile and caps breakdown result sets', async () => {
    const accounts = Array.from({ length: 100 }, (_, index) => ({
      type: 'EXPENSE' as const,
      accountId: `account-${index}`,
      accountName: `Account ${index}`,
      nativeAmount: decimal(index + 1),
      valuedAmount: null,
    }));
    const queryRaw = jest
      .fn()
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce(accounts)
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);
    const service = new FinanceAnalyticsService({
      $queryRaw: queryRaw,
    } as never);

    const result = await service.analytics(profile, {
      period: 'CUSTOM',
      from: '2026-08-01',
      to: '2026-09-01',
    });

    expect(result.accounts).toHaveLength(100);
    expect(queryRaw).toHaveBeenCalledTimes(7);
    const calls = queryRaw.mock.calls as unknown as Array<
      [{ strings: string[] }]
    >;
    const sql = calls
      .map((call) => {
        const statement = call[0];
        return statement.strings.join(' ');
      })
      .join('\n');
    expect(sql.match(/LIMIT/g)).toHaveLength(3);
  });

  it('uses a constant pair of aggregate queries for the dashboard read model', async () => {
    const queryRaw = jest.fn().mockResolvedValue([]);
    const service = new FinanceAnalyticsService({
      $queryRaw: queryRaw,
    } as never);

    await expect(
      service.dashboard(
        profile,
        new Date('2026-08-01T00:00:00.000Z'),
        new Date('2026-09-01T00:00:00.000Z'),
      ),
    ).resolves.toEqual({
      summary: {
        income: '0',
        expenses: '0',
        saved: '0',
        invested: '0',
        investmentReturns: '0',
        requiredExpenses: '0',
        discretionaryExpenses: '0',
        unspecifiedExpenses: '0',
        netCashflow: '0',
      },
      expensesByCategory: [],
    });
    expect(queryRaw).toHaveBeenCalledTimes(2);
  });
});
