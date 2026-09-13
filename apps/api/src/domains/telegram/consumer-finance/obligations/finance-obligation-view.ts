import { Prisma } from '@prisma/client';
import {
  financeAccountEmoji,
  financeCategoryEmoji,
  financeIconPresentation,
} from '../catalog/finance-entity-emoji';
import { financeRegularPaymentIsDue } from './finance-obligation-date';

const accountSelect = {
  id: true,
  name: true,
  currency: true,
  type: true,
  emoji: true,
} satisfies Prisma.FinanceAccountSelect;

const categorySelect = {
  id: true,
  name: true,
  key: true,
  type: true,
  emoji: true,
} satisfies Prisma.FinanceCategorySelect;

export const financeDebtSelect = {
  id: true,
  direction: true,
  status: true,
  name: true,
  amount: true,
  currency: true,
  accountId: true,
  account: { select: accountSelect },
  dueAt: true,
  scheduleTimezone: true,
  note: true,
  settledAt: true,
  settlementTransactionId: true,
  originTransactionId: true,
  version: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.FinanceDebtSelect;

export const financeRegularPaymentSelect = {
  id: true,
  profileId: true,
  name: true,
  amount: true,
  currency: true,
  accountId: true,
  account: { select: accountSelect },
  categoryId: true,
  category: { select: categorySelect },
  recurrence: true,
  anchorDay: true,
  anchorMonth: true,
  nextOccurrenceAt: true,
  scheduleTimezone: true,
  note: true,
  necessity: true,
  status: true,
  version: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.FinanceRecurringPaymentSelect;

export const financeRegularPaymentRevisionSelect = {
  id: true,
  version: true,
  kind: true,
  name: true,
  amount: true,
  currency: true,
  accountId: true,
  accountName: true,
  categoryId: true,
  categoryName: true,
  categoryKey: true,
  recurrence: true,
  nextOccurrenceAt: true,
  scheduleTimezone: true,
  note: true,
  necessity: true,
  status: true,
  effectiveAt: true,
} satisfies Prisma.FinanceRecurringPaymentRevisionSelect;

export const financeRegularPaymentOccurrenceSelect = {
  id: true,
  recurringPaymentId: true,
  transactionId: true,
  configVersion: true,
  scheduledFor: true,
  scheduledAmount: true,
  paidAmount: true,
  currency: true,
  confirmedAt: true,
  futureAmountAppliedAt: true,
} satisfies Prisma.FinanceRecurringPaymentOccurrenceSelect;

type DebtRow = Prisma.FinanceDebtGetPayload<{
  select: typeof financeDebtSelect;
}>;
type RegularPaymentRow = Prisma.FinanceRecurringPaymentGetPayload<{
  select: typeof financeRegularPaymentSelect;
}>;
type RevisionRow = Prisma.FinanceRecurringPaymentRevisionGetPayload<{
  select: typeof financeRegularPaymentRevisionSelect;
}>;
type OccurrenceRow = Prisma.FinanceRecurringPaymentOccurrenceGetPayload<{
  select: typeof financeRegularPaymentOccurrenceSelect;
}>;

function accountView(account: DebtRow['account']) {
  return {
    id: account.id,
    name: account.name,
    currency: account.currency,
    iconPresentation: financeIconPresentation(
      account.emoji,
      financeAccountEmoji(account.type),
    ),
  };
}

function categoryView(category: RegularPaymentRow['category']) {
  return category
    ? {
        id: category.id,
        name: category.name,
        key: category.key,
        type: category.type,
        iconPresentation: financeIconPresentation(
          category.emoji,
          financeCategoryEmoji(category.name, category.key),
        ),
      }
    : null;
}

export function financeDebtView(
  row: DebtRow,
  _timezone: string,
  now = new Date(),
) {
  return {
    id: row.id,
    direction: row.direction,
    status: row.status,
    name: row.name,
    amount: row.amount.toString(),
    currency: row.currency,
    accountId: row.accountId,
    account: accountView(row.account),
    dueAt: row.dueAt.toISOString(),
    scheduleTimezone: row.scheduleTimezone,
    note: row.note,
    isOverdue: row.status === 'OPEN' && row.dueAt < now,
    settledAt: row.settledAt?.toISOString() ?? null,
    settlementTransactionId: row.settlementTransactionId,
    originTransactionId: row.originTransactionId,
    version: row.version,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export function financeRegularPaymentView(
  row: RegularPaymentRow,
  _timezone: string,
  now = new Date(),
) {
  return {
    id: row.id,
    name: row.name,
    amount: row.amount.toString(),
    currency: row.currency,
    accountId: row.accountId,
    account: accountView(row.account),
    categoryId: row.categoryId,
    category: categoryView(row.category),
    recurrence: row.recurrence,
    nextOccurrenceAt: row.nextOccurrenceAt.toISOString(),
    scheduleTimezone: row.scheduleTimezone,
    note: row.note,
    necessity: row.necessity,
    status: row.status,
    isDue:
      row.status === 'ACTIVE' &&
      financeRegularPaymentIsDue(
        row.nextOccurrenceAt,
        row.scheduleTimezone,
        now,
      ),
    version: row.version,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export function financeRegularPaymentRevisionView(row: RevisionRow) {
  return {
    ...row,
    amount: row.amount.toString(),
    nextOccurrenceAt: row.nextOccurrenceAt.toISOString(),
    effectiveAt: row.effectiveAt.toISOString(),
  };
}

export function financeRegularPaymentOccurrenceView(row: OccurrenceRow) {
  return {
    ...row,
    scheduledFor: row.scheduledFor.toISOString(),
    scheduledAmount: row.scheduledAmount.toString(),
    paidAmount: row.paidAmount.toString(),
    confirmedAt: row.confirmedAt.toISOString(),
    futureAmountAppliedAt: row.futureAmountAppliedAt?.toISOString() ?? null,
  };
}
