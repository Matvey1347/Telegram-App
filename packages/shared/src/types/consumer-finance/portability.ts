import type {
  ConsumerFinanceExpenseNecessity,
  ConsumerFinanceAccountType,
  ConsumerFinanceTransactionPurpose,
  ConsumerFinanceTransactionType,
} from "./ledger";
import type {
  ConsumerFinanceDebtDirection,
  ConsumerFinanceDebtStatus,
} from "./debts";
import type {
  ConsumerFinanceInvestmentCashFlowKind,
  ConsumerFinanceInvestmentStatus,
  ConsumerFinanceInvestmentType,
} from "./investments";
import type {
  ConsumerFinanceRegularPaymentRecurrence,
  ConsumerFinanceRegularPaymentStatus,
} from "./regular-payments";
import type {
  ConsumerFinanceSavingsGoalStatus,
  ConsumerFinanceSavingsMovementKind,
} from "./savings-goals";
import type { FinanceLocale } from "./identity";

export type ConsumerFinanceImportPhase =
  | "VALIDATING"
  | "PREPARING"
  | "IMPORTING"
  | "FINALIZING";

export type ConsumerFinanceImportSection =
  | "document"
  | "accounts"
  | "categories"
  | "transactions"
  | "transfers"
  | "limits"
  | "reminders"
  | "debts"
  | "regularPayments"
  | "savingsGoals"
  | "savingsMovements"
  | "investments"
  | "investmentCashFlows"
  | "investmentValuations";

export type ConsumerFinanceImportProgress = {
  phase: ConsumerFinanceImportPhase;
  section: ConsumerFinanceImportSection;
  processed: number;
  total: number;
};

export type ConsumerFinanceImportResult = {
  importId: string;
  duplicate: boolean;
  imported: number;
  counts: Partial<Record<ConsumerFinanceImportSection, number>>;
  warnings: string[];
};

type RefRow = { ref: string };

export type ConsumerFinanceImportAccount = RefRow & {
  name: string;
  emoji?: string | null;
  type: ConsumerFinanceAccountType;
  currency: string;
  openingBalance?: string;
  archivedAt?: string | null;
};

export type ConsumerFinanceImportCategory = RefRow & {
  parentRef?: string | null;
  name: string;
  emoji?: string | null;
  type: ConsumerFinanceTransactionType;
  key?: string | null;
  archivedAt?: string | null;
};

export type ConsumerFinanceImportTransaction = RefRow & {
  accountRef: string;
  categoryRef?: string | null;
  type: ConsumerFinanceTransactionType;
  amount: string;
  economicAmount?: string;
  purpose?: Exclude<
    ConsumerFinanceTransactionPurpose,
    "INVESTMENT_CONTRIBUTION" | "INVESTMENT_RETURN"
  >;
  necessity?: ConsumerFinanceExpenseNecessity;
  occurredAt: string;
  description?: string | null;
  merchantDisplay?: string | null;
  items?: Array<{
    displayName: string;
    quantity?: string | null;
    unitPrice?: string | null;
    totalAmount: string;
    categoryRef?: string | null;
    metadata?: Record<string, unknown> | null;
  }>;
};

export type ConsumerFinanceImportTransfer = RefRow & {
  fromAccountRef: string;
  toAccountRef: string;
  fromAmount: string;
  toAmount: string;
  occurredAt: string;
  description?: string | null;
};

export type ConsumerFinanceImportLimit = RefRow & {
  categoryRef: string;
  amount: string;
  currency: string;
};

export type ConsumerFinanceImportReminder = RefRow & {
  name: string;
  amount: string;
  currency: string;
  dayOfMonth: number;
  reminderOffsetMinutes?: number;
  nextOccurrenceAt: string;
  enabled?: boolean;
};

export type ConsumerFinanceImportDebt = RefRow & {
  accountRef: string;
  settlementTransactionRef?: string | null;
  direction: ConsumerFinanceDebtDirection;
  status?: ConsumerFinanceDebtStatus;
  name: string;
  amount: string;
  dueAt: string;
  scheduleTimezone: string;
  note?: string | null;
  settledAt?: string | null;
};

export type ConsumerFinanceImportRegularPayment = RefRow & {
  accountRef: string;
  categoryRef?: string | null;
  name: string;
  amount: string;
  recurrence: ConsumerFinanceRegularPaymentRecurrence;
  nextOccurrenceAt: string;
  scheduleTimezone: string;
  note?: string | null;
  status?: ConsumerFinanceRegularPaymentStatus;
  necessity?: ConsumerFinanceExpenseNecessity;
};

export type ConsumerFinanceImportSavingsGoal = RefRow & {
  name: string;
  targetAmount: string;
  initialAmount?: string;
  currency: string;
  targetDate?: string | null;
  note?: string | null;
  status?: ConsumerFinanceSavingsGoalStatus;
};

export type ConsumerFinanceImportSavingsMovement = RefRow & {
  accountRef: string;
  fromGoalRef?: string | null;
  toGoalRef?: string | null;
  linkedTransferRef?: string | null;
  kind: ConsumerFinanceSavingsMovementKind;
  amount: string;
  occurredAt: string;
  note?: string | null;
};

export type ConsumerFinanceImportInvestment = RefRow & {
  name: string;
  description?: string | null;
  type: ConsumerFinanceInvestmentType;
  currency: string;
  status?: ConsumerFinanceInvestmentStatus;
  startedAt: string;
  closedAt?: string | null;
};

export type ConsumerFinanceImportInvestmentCashFlow = RefRow & {
  investmentRef: string;
  accountRef: string;
  kind: ConsumerFinanceInvestmentCashFlowKind;
  amount: string;
  occurredAt: string;
  note?: string | null;
};

export type ConsumerFinanceImportInvestmentValuation = RefRow & {
  investmentRef: string;
  value: string;
  valuedAt: string;
  createdAt?: string;
  correctsRef?: string | null;
  note?: string | null;
};

export type ConsumerFinanceImportDocumentV1 = {
  format: "telegram-system.consumer-finance";
  version: 1;
  mode: "ADD" | "REPLACE";
  settings?: {
    defaultCurrency?: string;
    timezone?: string;
    locale?: FinanceLocale;
    displayName?: string;
  };
  data: {
    accounts?: ConsumerFinanceImportAccount[];
    categories?: ConsumerFinanceImportCategory[];
    transactions?: ConsumerFinanceImportTransaction[];
    transfers?: ConsumerFinanceImportTransfer[];
    limits?: ConsumerFinanceImportLimit[];
    reminders?: ConsumerFinanceImportReminder[];
    debts?: ConsumerFinanceImportDebt[];
    regularPayments?: ConsumerFinanceImportRegularPayment[];
    savingsGoals?: ConsumerFinanceImportSavingsGoal[];
    savingsMovements?: ConsumerFinanceImportSavingsMovement[];
    investments?: ConsumerFinanceImportInvestment[];
    investmentCashFlows?: ConsumerFinanceImportInvestmentCashFlow[];
    investmentValuations?: ConsumerFinanceImportInvestmentValuation[];
  };
};
