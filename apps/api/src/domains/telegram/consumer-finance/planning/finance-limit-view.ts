import { Prisma } from '@prisma/client';

type FinanceLimitRow = {
  id: string;
  categoryId: string;
  amount: Prisma.Decimal;
  currency: string;
  category: { id: string; name: string; key: string | null };
};

export function financeLimitView(
  limit: FinanceLimitRow,
  spent: Prisma.Decimal,
) {
  const remaining = Prisma.Decimal.max(0, limit.amount.minus(spent));
  return {
    ...limit,
    amount: limit.amount.toString(),
    spent: spent.toString(),
    remaining: remaining.toString(),
    percentage: limit.amount.isZero()
      ? 0
      : Number(spent.div(limit.amount).mul(100).toDecimalPlaces(2)),
  };
}
