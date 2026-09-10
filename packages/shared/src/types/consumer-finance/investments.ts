import type {
  ConsumerFinanceAccount,
  ConsumerFinanceAccountSummary,
  ConsumerFinanceTransaction,
} from "./ledger";

export type ConsumerFinanceInvestmentType =
  | "BUSINESS"
  | "REAL_ESTATE"
  | "SECURITIES"
  | "CRYPTO"
  | "DIGITAL_ASSET"
  | "PHYSICAL_ASSET"
  | "OTHER";

export type ConsumerFinanceInvestmentStatus = "ACTIVE" | "CLOSED" | "ARCHIVED";

export type ConsumerFinanceInvestmentCashFlowKind = "CONTRIBUTION" | "RETURN";

export type ConsumerFinanceInvestment = {
  id: string;
  name: string;
  description?: string | null;
  type: ConsumerFinanceInvestmentType;
  currency: string;
  status: ConsumerFinanceInvestmentStatus;
  startedAt: string;
  closedAt?: string | null;
  archivedAt?: string | null;
  totalInvested: string;
  totalReturned: string;
  currentValue: string;
  profitLoss: string;
  returnPercentage: number | null;
  currentValuationAt?: string | null;
  createdAt: string;
  updatedAt: string;
};

export type ConsumerFinanceInvestmentInput = {
  name: string;
  description?: string | null;
  type: ConsumerFinanceInvestmentType;
  currency: string;
  startedAt: string;
};

export type ConsumerFinanceInvestmentUpdate = Pick<
  ConsumerFinanceInvestmentInput,
  "name" | "description" | "type" | "startedAt"
>;

export type ConsumerFinanceInvestmentPage = {
  items: ConsumerFinanceInvestment[];
  nextCursor: string | null;
};

export type ConsumerFinanceInvestmentCashFlow = {
  id: string;
  investmentId: string;
  kind: ConsumerFinanceInvestmentCashFlowKind;
  accountId: string;
  account?: ConsumerFinanceAccountSummary;
  transactionId: string;
  transaction?: ConsumerFinanceTransaction;
  amount: string;
  currency: string;
  amountInInvestmentCurrency: string;
  investmentCurrency: string;
  occurredAt: string;
  note?: string | null;
  createdAt: string;
};

export type ConsumerFinanceInvestmentCashFlowInput = {
  kind: ConsumerFinanceInvestmentCashFlowKind;
  accountId: string;
  amount: string;
  occurredAt: string;
  note?: string;
  idempotencyKey: string;
};

export type ConsumerFinanceInvestmentValuation = {
  id: string;
  investmentId: string;
  value: string;
  currency: string;
  valuedAt: string;
  correctsValuationId?: string | null;
  correctedByValuationId?: string | null;
  createdAt: string;
};

export type ConsumerFinanceInvestmentValuationInput = {
  value: string;
  valuedAt: string;
  correctsValuationId?: string;
  note?: string;
  idempotencyKey: string;
};

export type ConsumerFinanceInvestmentHistoryPage<T> = {
  items: T[];
  nextCursor: string | null;
};

export type ConsumerFinanceInvestmentDetail = ConsumerFinanceInvestment & {
  cashFlows: ConsumerFinanceInvestmentHistoryPage<ConsumerFinanceInvestmentCashFlow>;
  valuations: ConsumerFinanceInvestmentHistoryPage<ConsumerFinanceInvestmentValuation>;
};

export type ConsumerFinanceInvestmentMutation = {
  investment: ConsumerFinanceInvestment;
  cashFlow?: ConsumerFinanceInvestmentCashFlow | null;
  valuation?: ConsumerFinanceInvestmentValuation | null;
  transaction?: ConsumerFinanceTransaction | null;
  account?: ConsumerFinanceAccount | null;
  duplicate: boolean;
};

export type ConsumerFinanceInvestmentCloseInput = {
  closedAt: string;
  idempotencyKey: string;
  finalReturn?: Omit<
    ConsumerFinanceInvestmentCashFlowInput,
    "kind" | "occurredAt" | "idempotencyKey"
  >;
};

export type ConsumerFinanceInvestmentSummary = {
  currency: string;
  totalInvested: string;
  totalReturned: string;
  currentValue: string;
  profitLoss: string;
  returnPercentage: number | null;
  activeInvestments: number;
  closedInvestments: number;
  excludedInvestments: Array<{
    investmentId: string;
    name: string;
    currency: string;
    invested: string;
    returned: string;
    currentValue: string;
    reason: "RATE_UNAVAILABLE" | "VALUATION_MISSING";
  }>;
};
