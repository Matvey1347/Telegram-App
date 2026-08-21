import { Prisma } from '@prisma/client';

export type FinanceAnalyticsAggregateRow = {
  type: 'INCOME' | 'EXPENSE';
  categoryId: string | null;
  categoryName: string | null;
  categoryKey: string | null;
  currency: string;
  day: string;
  valuedAmount: Prisma.Decimal | null;
  legacyNativeAmount: Prisma.Decimal | null;
  legacyTransactionCount: bigint;
};

export function financeAnalyticsView(input: {
  rows: FinanceAnalyticsAggregateRow[];
  rate: Prisma.Decimal;
  currency: string;
  period: Record<string, unknown> & { from: string; to: string };
}) {
  const convert = (value: Prisma.Decimal) =>
    value.mul(input.rate).toDecimalPlaces(2);
  let income = new Prisma.Decimal(0);
  let expenses = new Prisma.Decimal(0);
  let legacyTransactionCount = 0;
  const legacyNativeAmounts = new Map<string, Prisma.Decimal>();
  const categories = new Map<
    string,
    {
      categoryId: string | null;
      categoryKey: string | null;
      name: string;
      amount: Prisma.Decimal;
    }
  >();
  const timeline = new Map<
    string,
    { income: Prisma.Decimal; expenses: Prisma.Decimal }
  >();
  for (const row of input.rows) {
    legacyTransactionCount += Number(row.legacyTransactionCount || 0);
    if (row.legacyTransactionCount) {
      legacyNativeAmounts.set(
        row.currency,
        (legacyNativeAmounts.get(row.currency) || new Prisma.Decimal(0)).plus(
          row.legacyNativeAmount || 0,
        ),
      );
    }
    const amount = convert(new Prisma.Decimal(row.valuedAmount || 0));
    if (row.type === 'INCOME') income = income.plus(amount);
    else expenses = expenses.plus(amount);
    if (row.type === 'EXPENSE') {
      const key = row.categoryId || 'other';
      const current = categories.get(key) || {
        categoryId: row.categoryId,
        categoryKey: row.categoryKey,
        name: row.categoryName || 'Other',
        amount: new Prisma.Decimal(0),
      };
      current.amount = current.amount.plus(amount);
      categories.set(key, current);
    }
    const current = timeline.get(row.day) || {
      income: new Prisma.Decimal(0),
      expenses: new Prisma.Decimal(0),
    };
    if (row.type === 'INCOME') current.income = current.income.plus(amount);
    else current.expenses = current.expenses.plus(amount);
    timeline.set(row.day, current);
  }
  return {
    currency: input.currency,
    period: input.period,
    summary: {
      income: income.toString(),
      expenses: expenses.toString(),
      netCashflow: income.minus(expenses).toString(),
    },
    expensesByCategory: [...categories.values()].map((row) => ({
      categoryId: row.categoryId,
      categoryKey: row.categoryKey,
      name: row.name,
      amount: row.amount.toString(),
      percentage: expenses.isZero()
        ? 0
        : Number(row.amount.div(expenses).mul(100).toDecimalPlaces(2)),
    })),
    timeline: [...timeline.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, row]) => ({
        date,
        income: row.income.toString(),
        expenses: row.expenses.toString(),
        netCashflow: row.income.minus(row.expenses).toString(),
      })),
    legacyFallback:
      legacyTransactionCount > 0
        ? {
            transactionCount: legacyTransactionCount,
            nativeAmounts: [...legacyNativeAmounts.entries()]
              .sort(([left], [right]) => left.localeCompare(right))
              .map(([currency, amount]) => ({
                currency,
                amount: amount.toString(),
              })),
            reason: 'UNKNOWN_HISTORICAL_DEFAULT_CURRENCY' as const,
          }
        : null,
  };
}
