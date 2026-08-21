import { Prisma } from '@prisma/client';

export const financeTransactionSelect = {
  id: true,
  accountId: true,
  categoryId: true,
  type: true,
  amount: true,
  currency: true,
  valuationCurrency: true,
  amountInValuationCurrency: true,
  exchangeRateToValuation: true,
  valuationRateAt: true,
  occurredAt: true,
  description: true,
  merchantDisplay: true,
  merchantNormalized: true,
  source: true,
  deletedAt: true,
  account: { select: { id: true, name: true, currency: true } },
  category: { select: { id: true, name: true, key: true, type: true } },
  _count: { select: { items: true } },
} satisfies Prisma.FinanceTransactionSelect;

type FinanceTransactionViewRow = Prisma.FinanceTransactionGetPayload<{
  select: typeof financeTransactionSelect;
}>;

export function financeTransactionView(row: FinanceTransactionViewRow) {
  return {
    id: row.id,
    accountId: row.accountId,
    categoryId: row.categoryId,
    type: row.type,
    amount: row.amount.toString(),
    currency: row.currency,
    occurredAt: row.occurredAt,
    description: row.description,
    merchantDisplay: row.merchantDisplay,
    merchantNormalized: row.merchantNormalized,
    source: row.source,
    itemCount: row._count?.items ?? 0,
    account: row.account,
    category: row.category,
    valuationSnapshot:
      row.valuationCurrency &&
      row.amountInValuationCurrency &&
      row.exchangeRateToValuation
        ? {
            currency: row.valuationCurrency,
            amount: row.amountInValuationCurrency.toString(),
            exchangeRate: row.exchangeRateToValuation.toString(),
            rateAt: row.valuationRateAt?.toISOString() || null,
          }
        : null,
  };
}

export function financeTransactionSearchFilter(
  search?: string,
): Prisma.FinanceTransactionWhereInput {
  const value = search?.trim();
  return value
    ? {
        OR: [
          { description: { contains: value, mode: 'insensitive' } },
          { merchantDisplay: { contains: value, mode: 'insensitive' } },
          { merchantNormalized: { contains: value, mode: 'insensitive' } },
          { category: { name: { contains: value, mode: 'insensitive' } } },
        ],
      }
    : {};
}
