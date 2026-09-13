import type {
  ConsumerFinanceAccountSummary,
  ConsumerFinanceCategorySummary,
  ConsumerFinanceExpenseNecessity,
  ConsumerFinanceTransaction,
} from "./ledger";

export type ConsumerFinanceRegularPaymentRecurrence =
  | "WEEKLY"
  | "MONTHLY"
  | "YEARLY";
export type ConsumerFinanceRegularPaymentStatus =
  | "ACTIVE"
  | "PAUSED"
  | "CANCELED";
export type ConsumerFinanceRegularPaymentRevisionKind =
  | "CREATED"
  | "UPDATED"
  | "PAUSED"
  | "RESUMED"
  | "CANCELED"
  | "AMOUNT_APPLIED";

export type ConsumerFinanceRegularPayment = {
  id: string;
  name: string;
  amount: string;
  /** Derived from the selected account and never supplied by the client. */
  currency: string;
  accountId: string;
  account: ConsumerFinanceAccountSummary;
  categoryId?: string | null;
  category?: ConsumerFinanceCategorySummary | null;
  recurrence: ConsumerFinanceRegularPaymentRecurrence;
  nextOccurrenceAt: string;
  /** Timezone used for recurrence calendar anchors. */
  scheduleTimezone: string;
  note?: string | null;
  necessity?: ConsumerFinanceExpenseNecessity;
  status: ConsumerFinanceRegularPaymentStatus;
  isDue: boolean;
  version: number;
  createdAt: string;
  updatedAt: string;
};

export type ConsumerFinanceRegularPaymentInput = {
  name: string;
  amount: string;
  accountId: string;
  categoryId?: string | null;
  recurrence: ConsumerFinanceRegularPaymentRecurrence;
  /** Profile-local calendar date in YYYY-MM-DD format. */
  nextPaymentDate: string;
  note?: string | null;
  necessity?: ConsumerFinanceExpenseNecessity;
};

export type ConsumerFinanceRegularPaymentQuery = {
  id?: string;
  status?: ConsumerFinanceRegularPaymentStatus;
  cursor?: string;
  limit?: number;
};

export type ConsumerFinanceRegularPaymentPage = {
  items: ConsumerFinanceRegularPayment[];
  nextCursor: string | null;
};

export type ConsumerFinanceRegularPaymentRevision = {
  id: string;
  version: number;
  kind: ConsumerFinanceRegularPaymentRevisionKind;
  name: string;
  amount: string;
  currency: string;
  accountId: string;
  accountName: string;
  categoryId?: string | null;
  categoryName?: string | null;
  categoryKey?: string | null;
  recurrence: ConsumerFinanceRegularPaymentRecurrence;
  nextOccurrenceAt: string;
  scheduleTimezone: string;
  note?: string | null;
  necessity?: ConsumerFinanceExpenseNecessity;
  status: ConsumerFinanceRegularPaymentStatus;
  effectiveAt: string;
};

export type ConsumerFinanceRegularPaymentRevisionPage = {
  items: ConsumerFinanceRegularPaymentRevision[];
  nextCursor: string | null;
};

export type ConsumerFinanceRegularPaymentOccurrence = {
  id: string;
  recurringPaymentId: string;
  transactionId: string;
  configVersion: number;
  scheduledFor: string;
  scheduledAmount: string;
  paidAmount: string;
  currency: string;
  confirmedAt: string;
  futureAmountAppliedAt?: string | null;
};

export type ConsumerFinanceRegularPaymentConfirmInput = {
  /** Stable occurrence guard; repeat requests cannot pay the next period. */
  expectedOccurrenceAt: string;
  /** Configuration/state guard captured when the occurrence was presented. */
  expectedVersion: number;
  amount?: string;
};

export type ConsumerFinanceRegularPaymentConfirmation = {
  regularPayment: ConsumerFinanceRegularPayment;
  occurrence: ConsumerFinanceRegularPaymentOccurrence;
  transaction: ConsumerFinanceTransaction;
  duplicate: boolean;
  futureAmountUpdateRequired: boolean;
};

export type ConsumerFinanceApplyOccurrenceAmountInput = {
  expectedVersion: number;
};
