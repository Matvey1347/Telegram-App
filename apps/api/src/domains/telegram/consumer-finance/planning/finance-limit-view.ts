import { Prisma } from '@prisma/client';
import {
  financeCategoryEmoji,
  financeIconPresentation,
} from '../catalog/finance-entity-emoji';

type FinanceLimitRow = {
  id: string;
  categoryId: string;
  amount: Prisma.Decimal;
  currency: string;
  category: {
    id: string;
    name: string;
    key: string | null;
    type: string;
    emoji: string | null;
  };
};

export function financeLimitView(
  limit: FinanceLimitRow,
  spent: Prisma.Decimal,
) {
  const remaining = Prisma.Decimal.max(0, limit.amount.minus(spent));
  const { emoji, ...category } = limit.category;
  return {
    ...limit,
    category: {
      ...category,
      iconPresentation: financeIconPresentation(
        emoji,
        financeCategoryEmoji(category.name, category.key),
      ),
    },
    amount: limit.amount.toString(),
    spent: spent.toString(),
    remaining: remaining.toString(),
    percentage: limit.amount.isZero()
      ? 0
      : Number(spent.div(limit.amount).mul(100).toDecimalPlaces(2)),
  };
}
