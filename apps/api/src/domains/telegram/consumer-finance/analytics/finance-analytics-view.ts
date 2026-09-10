import { Prisma } from '@prisma/client';
import type { ConsumerFinanceAnalyticsQuery } from '@telegram-system/shared';

export type FinanceAnalyticsMoneyRow = {
  nativeAmount: Prisma.Decimal | null;
  valuedAmount: Prisma.Decimal | null;
};
export type FinanceAnalyticsSummaryRow = FinanceAnalyticsMoneyRow & {
  segment: 'CURRENT' | 'PREVIOUS';
  type: 'INCOME' | 'EXPENSE';
  purpose: 'ORDINARY' | 'INVESTMENT_CONTRIBUTION' | 'INVESTMENT_RETURN';
};
export type FinanceAnalyticsCategoryRow = FinanceAnalyticsMoneyRow & {
  type: 'INCOME' | 'EXPENSE';
  purpose: 'ORDINARY' | 'INVESTMENT_CONTRIBUTION' | 'INVESTMENT_RETURN';
  categoryId: string | null;
  categoryName: string | null;
  categoryKey: string | null;
};
export type FinanceAnalyticsAccountRow = FinanceAnalyticsMoneyRow & {
  type: 'INCOME' | 'EXPENSE';
  purpose: 'ORDINARY' | 'INVESTMENT_CONTRIBUTION' | 'INVESTMENT_RETURN';
  accountId: string;
  accountName: string;
};
export type FinanceAnalyticsTimelineRow = FinanceAnalyticsMoneyRow & {
  type: 'INCOME' | 'EXPENSE';
  purpose: 'ORDINARY' | 'INVESTMENT_CONTRIBUTION' | 'INVESTMENT_RETURN';
  day: string;
};
export type FinanceSavingsAnalyticsRow = FinanceAnalyticsMoneyRow & {
  segment: 'CURRENT' | 'PREVIOUS';
  day: string;
};
export type FinanceAnalyticsLegacyRow = {
  segment: 'CURRENT' | 'PREVIOUS';
  currency: string;
  amount: Prisma.Decimal | null;
  transactions: bigint;
};

type Totals = {
  income: Prisma.Decimal;
  expenses: Prisma.Decimal;
  saved: Prisma.Decimal;
  invested: Prisma.Decimal;
  investmentReturns: Prisma.Decimal;
};

export function financeAnalyticsView(input: {
  summaries: FinanceAnalyticsSummaryRow[];
  categories: FinanceAnalyticsCategoryRow[];
  accounts: FinanceAnalyticsAccountRow[];
  timeline: FinanceAnalyticsTimelineRow[];
  savingsRows: FinanceSavingsAnalyticsRow[];
  legacy: FinanceAnalyticsLegacyRow[];
  rate: Prisma.Decimal;
  currency: string;
  period: ConsumerFinanceAnalyticsQuery & { from: string; to: string };
  comparisonPeriod: { from: string; to: string };
}) {
  const money = (row: FinanceAnalyticsMoneyRow) =>
    new Prisma.Decimal(row.nativeAmount || 0).plus(
      new Prisma.Decimal(row.valuedAmount || 0)
        .mul(input.rate)
        .toDecimalPlaces(2),
    );
  const current = totalsFor(input.summaries, 'CURRENT', money);
  const previous = totalsFor(input.summaries, 'PREVIOUS', money);
  for (const row of input.savingsRows) {
    const totals = row.segment === 'CURRENT' ? current : previous;
    totals.saved = totals.saved.plus(money(row));
  }
  const summary = contractTotals(current);
  const comparisonSummary = contractTotals(previous);
  const expensesByCategory = categoryBreakdown(
    input.categories,
    'EXPENSE',
    current.expenses,
    money,
  );
  const incomeByCategory = categoryBreakdown(
    input.categories,
    'INCOME',
    current.income,
    money,
  );
  const accounts = new Map<
    string,
    {
      accountId: string;
      name: string;
      income: Prisma.Decimal;
      expenses: Prisma.Decimal;
      invested: Prisma.Decimal;
      investmentReturns: Prisma.Decimal;
    }
  >();
  for (const row of input.accounts) {
    const entry = accounts.get(row.accountId) || {
      accountId: row.accountId,
      name: row.accountName,
      income: new Prisma.Decimal(0),
      expenses: new Prisma.Decimal(0),
      invested: new Prisma.Decimal(0),
      investmentReturns: new Prisma.Decimal(0),
    };
    if (row.purpose === 'INVESTMENT_CONTRIBUTION')
      entry.invested = entry.invested.plus(money(row));
    else if (row.purpose === 'INVESTMENT_RETURN')
      entry.investmentReturns = entry.investmentReturns.plus(money(row));
    else if (row.type === 'INCOME')
      entry.income = entry.income.plus(money(row));
    else entry.expenses = entry.expenses.plus(money(row));
    accounts.set(row.accountId, entry);
  }
  const days = new Map<string, Totals>();
  for (const row of input.timeline) {
    const entry = days.get(row.day) || zeroTotals();
    if (row.purpose === 'INVESTMENT_CONTRIBUTION')
      entry.invested = entry.invested.plus(money(row));
    else if (row.purpose === 'INVESTMENT_RETURN')
      entry.investmentReturns = entry.investmentReturns.plus(money(row));
    else if (row.type === 'INCOME')
      entry.income = entry.income.plus(money(row));
    else entry.expenses = entry.expenses.plus(money(row));
    days.set(row.day, entry);
  }
  for (const row of input.savingsRows.filter(
    (item) => item.segment === 'CURRENT',
  )) {
    const entry = days.get(row.day) || zeroTotals();
    entry.saved = entry.saved.plus(money(row));
    days.set(row.day, entry);
  }

  return {
    currency: input.currency,
    period: input.period,
    summary,
    comparison: {
      period: input.comparisonPeriod,
      summary: comparisonSummary,
      legacyFallback: legacyFallback(input.legacy, 'PREVIOUS'),
    },
    expensesByCategory,
    incomeByCategory,
    accounts: [...accounts.values()]
      .sort((left, right) =>
        right.income
          .plus(right.expenses)
          .comparedTo(left.income.plus(left.expenses)),
      )
      .map((row) => ({
        accountId: row.accountId,
        name: row.name,
        income: row.income.toString(),
        expenses: row.expenses.toString(),
        invested: row.invested.toString(),
        investmentReturns: row.investmentReturns.toString(),
        netCashflow: row.income
          .plus(row.investmentReturns)
          .minus(row.expenses)
          .minus(row.invested)
          .toString(),
      })),
    timeline: [...days.entries()]
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([date, row]) => ({
        date,
        income: row.income.toString(),
        expenses: row.expenses.toString(),
        saved: row.saved.toString(),
        invested: row.invested.toString(),
        investmentReturns: row.investmentReturns.toString(),
        netCashflow: row.income
          .plus(row.investmentReturns)
          .minus(row.expenses)
          .minus(row.invested)
          .toString(),
      })),
    trends: [
      trend('INCOME', current.income, previous.income),
      trend('EXPENSES', current.expenses, previous.expenses),
      trend('SAVED', current.saved, previous.saved),
      trend('INVESTED', current.invested, previous.invested),
      trend(
        'INVESTMENT_RETURNS',
        current.investmentReturns,
        previous.investmentReturns,
      ),
      trend(
        'NET_CASHFLOW',
        current.income
          .plus(current.investmentReturns)
          .minus(current.expenses)
          .minus(current.invested),
        previous.income
          .plus(previous.investmentReturns)
          .minus(previous.expenses)
          .minus(previous.invested),
      ),
    ],
    legacyFallback: legacyFallback(input.legacy, 'CURRENT'),
  };
}

function legacyFallback(
  rows: FinanceAnalyticsLegacyRow[],
  segment: FinanceAnalyticsLegacyRow['segment'],
) {
  const selected = rows.filter((row) => row.segment === segment);
  return selected.length
    ? {
        transactionCount: selected.reduce(
          (total, row) => total + Number(row.transactions),
          0,
        ),
        nativeAmounts: selected.map((row) => ({
          currency: row.currency,
          amount: new Prisma.Decimal(row.amount || 0).toString(),
        })),
        reason: 'UNKNOWN_HISTORICAL_DEFAULT_CURRENCY' as const,
      }
    : null;
}

function zeroTotals(): Totals {
  return {
    income: new Prisma.Decimal(0),
    expenses: new Prisma.Decimal(0),
    saved: new Prisma.Decimal(0),
    invested: new Prisma.Decimal(0),
    investmentReturns: new Prisma.Decimal(0),
  };
}

function totalsFor(
  rows: FinanceAnalyticsSummaryRow[],
  segment: FinanceAnalyticsSummaryRow['segment'],
  money: (row: FinanceAnalyticsMoneyRow) => Prisma.Decimal,
) {
  const totals = zeroTotals();
  for (const row of rows) {
    if (row.segment !== segment) continue;
    if (row.purpose === 'INVESTMENT_CONTRIBUTION')
      totals.invested = totals.invested.plus(money(row));
    else if (row.purpose === 'INVESTMENT_RETURN')
      totals.investmentReturns = totals.investmentReturns.plus(money(row));
    else if (row.type === 'INCOME')
      totals.income = totals.income.plus(money(row));
    else totals.expenses = totals.expenses.plus(money(row));
  }
  return totals;
}

function contractTotals(totals: Totals) {
  return {
    income: totals.income.toString(),
    expenses: totals.expenses.toString(),
    saved: totals.saved.toString(),
    invested: totals.invested.toString(),
    investmentReturns: totals.investmentReturns.toString(),
    netCashflow: totals.income
      .plus(totals.investmentReturns)
      .minus(totals.expenses)
      .minus(totals.invested)
      .toString(),
  };
}

function categoryBreakdown(
  rows: FinanceAnalyticsCategoryRow[],
  type: FinanceAnalyticsCategoryRow['type'],
  total: Prisma.Decimal,
  money: (row: FinanceAnalyticsMoneyRow) => Prisma.Decimal,
) {
  return rows
    .filter(
      (row) =>
        row.type === type &&
        row.purpose !== 'INVESTMENT_CONTRIBUTION' &&
        row.purpose !== 'INVESTMENT_RETURN',
    )
    .map((row) => {
      const amount = money(row);
      return {
        categoryId: row.categoryId,
        categoryKey: row.categoryKey,
        name: row.categoryName || 'Other',
        amount: amount.toString(),
        percentage: total.isZero()
          ? 0
          : Number(amount.div(total).mul(100).toDecimalPlaces(2)),
      };
    })
    .sort((left, right) => Number(right.amount) - Number(left.amount));
}

function trend(
  metric:
    | 'INCOME'
    | 'EXPENSES'
    | 'SAVED'
    | 'INVESTED'
    | 'INVESTMENT_RETURNS'
    | 'NET_CASHFLOW',
  current: Prisma.Decimal,
  previous: Prisma.Decimal,
) {
  const difference = current.minus(previous);
  const changePercent = previous.isZero()
    ? null
    : Number(difference.div(previous.abs()).mul(100).toDecimalPlaces(2));
  return {
    metric,
    direction: difference.abs().lt('0.01')
      ? ('STABLE' as const)
      : difference.isPositive()
        ? ('UP' as const)
        : ('DOWN' as const),
    current: current.toString(),
    previous: previous.toString(),
    changePercent,
  };
}
