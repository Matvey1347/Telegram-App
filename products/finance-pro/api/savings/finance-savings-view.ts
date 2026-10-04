import { Prisma } from '@prisma/client';
import {
  financeAccountEmoji,
  financeIconPresentation,
} from '../catalog/finance-entity-emoji';

export const financeSavingsGoalSelect = {
  id: true,
  name: true,
  targetAmount: true,
  currency: true,
  targetDate: true,
  note: true,
  status: true,
  currentAllocated: true,
  linkedAllocated: true,
  legacyUnlinkedAmount: true,
  completedAt: true,
  archivedAt: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.FinanceSavingsGoalSelect;

export const financeSavingsMovementSelect = {
  id: true,
  kind: true,
  fromGoalId: true,
  toGoalId: true,
  accountId: true,
  amount: true,
  currency: true,
  occurredAt: true,
  note: true,
  linkedTransferId: true,
  createdAt: true,
  account: {
    select: { id: true, name: true, currency: true, type: true, emoji: true },
  },
} satisfies Prisma.FinanceSavingsMovementSelect;

type GoalRow = Prisma.FinanceSavingsGoalGetPayload<{
  select: typeof financeSavingsGoalSelect;
}>;
type MovementRow = Prisma.FinanceSavingsMovementGetPayload<{
  select: typeof financeSavingsMovementSelect;
}>;

export function financeSavingsGoalView(
  row: GoalRow,
  backed = row.linkedAllocated,
) {
  const target = new Prisma.Decimal(row.targetAmount);
  const allocated = new Prisma.Decimal(row.currentAllocated);
  const linked = new Prisma.Decimal(row.linkedAllocated);
  const backedAmount = Prisma.Decimal.min(new Prisma.Decimal(backed), linked);
  const legacy = new Prisma.Decimal(row.legacyUnlinkedAmount);
  return {
    ...row,
    targetAmount: target.toString(),
    currentAllocated: allocated.toString(),
    linkedAllocated: linked.toString(),
    legacyUnlinkedAmount: legacy.toString(),
    backedAmount: backedAmount.toDecimalPlaces(2).toString(),
    remainingAmount: Prisma.Decimal.max(target.minus(allocated), 0).toString(),
    progressPercentage: target.isZero()
      ? 0
      : Number(allocated.div(target).mul(100).toDecimalPlaces(2)),
    fundingStatus: !legacy.isZero()
      ? ('UNLINKED_LEGACY' as const)
      : backedAmount.lt(linked)
        ? ('UNDERFUNDED' as const)
        : ('BACKED' as const),
  };
}

export function financeSavingsMovementView(row: MovementRow) {
  return {
    id: row.id,
    kind: row.kind,
    fromGoalId: row.fromGoalId,
    toGoalId: row.toGoalId,
    accountId: row.accountId,
    account: {
      id: row.account.id,
      name: row.account.name,
      currency: row.account.currency,
      iconPresentation: financeIconPresentation(
        row.account.emoji,
        financeAccountEmoji(row.account.type),
      ),
    },
    amount: row.amount.toString(),
    currency: row.currency,
    occurredAt: row.occurredAt,
    note: row.note,
    linkedTransferId: row.linkedTransferId,
    createdAt: row.createdAt,
  };
}
