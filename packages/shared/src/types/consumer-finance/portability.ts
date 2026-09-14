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

export type ConsumerFinancePortabilityOperation =
  | "IMPORT"
  | "EXPORT"
  | "ROLLBACK";

export type ConsumerFinancePortabilityHistoryItem = {
  id: string;
  operation: ConsumerFinancePortabilityOperation;
  mode: "ADD" | "REPLACE" | null;
  sourceFileName: string | null;
  recordCount: number;
  counts: Partial<Record<ConsumerFinanceImportSection, number>>;
  createdAt: string;
  canRollback: boolean;
  rolledBackAt: string | null;
  rollbackOfId: string | null;
};

export type ConsumerFinancePortabilityHistory = {
  items: ConsumerFinancePortabilityHistoryItem[];
};

export type ConsumerFinanceRollbackResult = ConsumerFinanceImportResult & {
  restoredFromImportId: string;
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
  /** Default expense priority for ordinary transactions and regular payments. */
  necessity?: ConsumerFinanceExpenseNecessity;
  key?: string | null;
  archivedAt?: string | null;
};

export type ConsumerFinanceImportTransaction = RefRow & {
  accountRef: string;
  categoryRef?: string | null;
  /** Links a historical ordinary expense to an imported recurring payment. */
  recurringPaymentRef?: string | null;
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
  /** Number of recurrence units between payments. Defaults to 1. */
  intervalCount?: number;
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

/** Canonical, validator-backed example used by the import instructions. */
export const consumerFinanceImportExampleV1 = {
  format: "telegram-system.consumer-finance",
  version: 1,
  mode: "ADD",
  settings: {
    defaultCurrency: "UAH",
    timezone: "Europe/Kyiv",
    locale: "uk",
    displayName: "Alex",
  },
  data: {
    accounts: [
      {
        ref: "card-uah",
        name: "Main card",
        type: "CARD",
        currency: "UAH",
        openingBalance: "5000",
      },
      {
        ref: "savings-uah",
        name: "Savings account",
        type: "SAVINGS",
        currency: "UAH",
        openingBalance: "0",
      },
    ],
    categories: [
      { ref: "salary", name: "Salary", type: "INCOME", emoji: "💼" },
      {
        ref: "food",
        name: "Food",
        type: "EXPENSE",
        emoji: "🍽️",
        necessity: "DISCRETIONARY",
      },
      {
        ref: "coffee",
        parentRef: "food",
        name: "Coffee",
        type: "EXPENSE",
        emoji: "☕",
      },
      {
        ref: "housing",
        name: "Housing",
        type: "EXPENSE",
        emoji: "🏠",
        necessity: "REQUIRED",
      },
    ],
    transactions: [
      {
        ref: "salary-september",
        accountRef: "card-uah",
        categoryRef: "salary",
        type: "INCOME",
        amount: "30000",
        economicAmount: "30000",
        purpose: "ORDINARY",
        occurredAt: "2026-09-01T07:00:00.000Z",
        description: "September salary",
      },
      {
        ref: "coffee-1",
        accountRef: "card-uah",
        categoryRef: "coffee",
        type: "EXPENSE",
        amount: "85.50",
        economicAmount: "85.50",
        purpose: "ORDINARY",
        occurredAt: "2026-09-08T09:30:00.000Z",
        merchantDisplay: "Coffee Point",
        items: [
          {
            displayName: "Latte",
            quantity: "1",
            unitPrice: "85.50",
            totalAmount: "85.50",
            categoryRef: "coffee",
          },
        ],
      },
      {
        ref: "rent-september",
        accountRef: "card-uah",
        categoryRef: "housing",
        recurringPaymentRef: "rent-monthly",
        type: "EXPENSE",
        amount: "12000",
        economicAmount: "12000",
        purpose: "ORDINARY",
        occurredAt: "2026-09-01T09:00:00.000Z",
        description: "September rent — subscription history",
      },
      {
        ref: "debt-settlement-1",
        accountRef: "card-uah",
        type: "EXPENSE",
        amount: "2000",
        economicAmount: "0",
        purpose: "DEBT_REPAYMENT",
        occurredAt: "2026-09-05T12:00:00.000Z",
        description: "Debt repaid to Maria",
      },
    ],
    transfers: [
      {
        ref: "card-to-savings",
        fromAccountRef: "card-uah",
        toAccountRef: "savings-uah",
        fromAmount: "5000",
        toAmount: "5000",
        occurredAt: "2026-09-06T10:00:00.000Z",
        description: "Move money to savings account",
      },
    ],
    limits: [
      {
        ref: "food-monthly-limit",
        categoryRef: "food",
        amount: "8000",
        currency: "UAH",
      },
    ],
    reminders: [
      {
        ref: "tax-reminder",
        name: "Set aside tax",
        amount: "3000",
        currency: "UAH",
        dayOfMonth: 20,
        reminderOffsetMinutes: 1440,
        nextOccurrenceAt: "2026-09-20T09:00:00.000Z",
        enabled: true,
      },
    ],
    debts: [
      {
        ref: "debt-to-maria",
        accountRef: "card-uah",
        settlementTransactionRef: "debt-settlement-1",
        direction: "I_OWE",
        status: "SETTLED",
        name: "Maria",
        amount: "2000",
        dueAt: "2026-09-05T12:00:00.000Z",
        scheduleTimezone: "Europe/Kyiv",
        note: "Personal loan",
        settledAt: "2026-09-05T12:00:00.000Z",
      },
      {
        ref: "debt-from-oleh",
        accountRef: "card-uah",
        direction: "OWED_TO_ME",
        status: "OPEN",
        name: "Oleh",
        amount: "1500",
        dueAt: "2026-10-01T09:00:00.000Z",
        scheduleTimezone: "Europe/Kyiv",
        note: "Shared trip",
      },
    ],
    regularPayments: [
      {
        ref: "rent-monthly",
        accountRef: "card-uah",
        categoryRef: "housing",
        name: "Rent",
        amount: "12000",
        recurrence: "MONTHLY",
        intervalCount: 1,
        nextOccurrenceAt: "2026-10-01T09:00:00.000Z",
        scheduleTimezone: "Europe/Kyiv",
        status: "ACTIVE",
        note: "Historical payments use recurringPaymentRef on transactions",
      },
    ],
    savingsGoals: [
      {
        ref: "emergency-fund",
        name: "Emergency fund",
        targetAmount: "30000",
        initialAmount: "0",
        currency: "UAH",
        targetDate: "2027-03-01T00:00:00.000Z",
        status: "ACTIVE",
        note: "Six months reserve",
      },
      {
        ref: "vacation",
        name: "Vacation",
        targetAmount: "20000",
        currency: "UAH",
        status: "ACTIVE",
      },
    ],
    savingsMovements: [
      {
        ref: "allocate-emergency",
        accountRef: "savings-uah",
        toGoalRef: "emergency-fund",
        linkedTransferRef: "card-to-savings",
        kind: "ALLOCATE",
        amount: "5000",
        occurredAt: "2026-09-06T10:00:00.000Z",
        note: "Allocate transferred money",
      },
      {
        ref: "move-to-vacation",
        accountRef: "savings-uah",
        fromGoalRef: "emergency-fund",
        toGoalRef: "vacation",
        kind: "REALLOCATE",
        amount: "1000",
        occurredAt: "2026-09-07T10:00:00.000Z",
      },
    ],
    investments: [
      {
        ref: "mentor-channel",
        name: "Telegram channel Mentor",
        description: "Digital business asset",
        type: "BUSINESS",
        currency: "UAH",
        status: "ACTIVE",
        startedAt: "2026-01-01T00:00:00.000Z",
      },
    ],
    investmentCashFlows: [
      {
        ref: "mentor-contribution-1",
        investmentRef: "mentor-channel",
        accountRef: "card-uah",
        kind: "CONTRIBUTION",
        amount: "8000",
        occurredAt: "2026-02-01T10:00:00.000Z",
        note: "Initial capital",
      },
      {
        ref: "mentor-return-1",
        investmentRef: "mentor-channel",
        accountRef: "card-uah",
        kind: "RETURN",
        amount: "3000",
        occurredAt: "2026-08-01T10:00:00.000Z",
        note: "Capital returned",
      },
    ],
    investmentValuations: [
      {
        ref: "mentor-value-original",
        investmentRef: "mentor-channel",
        value: "11000",
        valuedAt: "2026-09-10T00:00:00.000Z",
        createdAt: "2026-09-10T08:00:00.000Z",
        note: "Original estimate",
      },
      {
        ref: "mentor-value-correction",
        investmentRef: "mentor-channel",
        value: "12000",
        valuedAt: "2026-09-10T00:00:00.000Z",
        createdAt: "2026-09-11T08:00:00.000Z",
        correctsRef: "mentor-value-original",
        note: "Corrected estimate",
      },
    ],
  },
} as const satisfies ConsumerFinanceImportDocumentV1;
