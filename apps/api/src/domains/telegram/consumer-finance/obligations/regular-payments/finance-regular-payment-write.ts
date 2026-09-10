import { Prisma } from '@prisma/client';
import type { FinanceRecurringPaymentRevisionKind } from '@prisma/client';
import type { financeRegularPaymentSelect } from '../finance-obligation-view';

export type FinanceRegularPaymentRow =
  Prisma.FinanceRecurringPaymentGetPayload<{
    select: typeof financeRegularPaymentSelect;
  }>;

export function financeRegularPaymentRevisionData(
  row: FinanceRegularPaymentRow,
  kind: FinanceRecurringPaymentRevisionKind,
) {
  return {
    recurringPaymentId: row.id,
    version: row.version,
    kind,
    name: row.name,
    amount: row.amount,
    currency: row.currency,
    accountId: row.accountId,
    accountName: row.account.name,
    categoryId: row.categoryId,
    categoryName: row.category?.name ?? null,
    categoryKey: row.category?.key ?? null,
    recurrence: row.recurrence,
    anchorDay: row.anchorDay,
    anchorMonth: row.anchorMonth,
    nextOccurrenceAt: row.nextOccurrenceAt,
    scheduleTimezone: row.scheduleTimezone,
    note: row.note,
    status: row.status,
  };
}
