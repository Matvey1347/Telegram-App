import type {
  ConsumerFinanceAccountSummary,
  ConsumerFinanceTransaction,
} from "./ledger";

export type ConsumerFinanceDebtDirection = "I_OWE" | "OWED_TO_ME";
export type ConsumerFinanceDebtStatus = "OPEN" | "SETTLED";

export type ConsumerFinanceDebt = {
  id: string;
  direction: ConsumerFinanceDebtDirection;
  status: ConsumerFinanceDebtStatus;
  name: string;
  amount: string;
  /** Derived from the selected account and never supplied by the client. */
  currency: string;
  accountId: string;
  account: ConsumerFinanceAccountSummary;
  dueAt: string;
  /** Timezone that gives the due instant its calendar-date meaning. */
  scheduleTimezone: string;
  note?: string | null;
  isOverdue: boolean;
  settledAt?: string | null;
  settlementTransactionId?: string | null;
  version: number;
  createdAt: string;
  updatedAt: string;
};

export type ConsumerFinanceDebtInput = {
  direction: ConsumerFinanceDebtDirection;
  name: string;
  amount: string;
  accountId: string;
  /** Profile-local calendar date in YYYY-MM-DD format. */
  dueDate: string;
  note?: string | null;
};

export type ConsumerFinanceDebtQuery = {
  status?: ConsumerFinanceDebtStatus;
  cursor?: string;
  limit?: number;
};

export type ConsumerFinanceDebtPage = {
  items: ConsumerFinanceDebt[];
  nextCursor: string | null;
};

export type ConsumerFinanceDebtSettlement = {
  debt: ConsumerFinanceDebt;
  transaction: ConsumerFinanceTransaction;
  duplicate: boolean;
};
