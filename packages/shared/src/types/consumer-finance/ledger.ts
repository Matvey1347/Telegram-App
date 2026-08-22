import type { ResolvedEmoji } from "../resolved-emoji";

export type ConsumerFinanceAccountType = "CASH" | "CARD" | "SAVINGS" | "OTHER";
export type ConsumerFinanceTransactionType = "INCOME" | "EXPENSE";
export type ConsumerFinanceTransactionSource =
  | "CHAT"
  | "MINI_APP"
  | "AI"
  | "RECEIPT";

/** A current conversion supplied by the API for display only. */
export type ConsumerFinanceBalanceEquivalent = {
  amount: string;
  currency: string;
  rate: string;
  rateAsOf?: string | null;
};

export type ConsumerFinanceAccount = {
  id: string;
  name: string;
  iconPresentation: ResolvedEmoji;
  type: ConsumerFinanceAccountType;
  /** The account's native ISO currency and balance. */
  currency: string;
  openingBalance: string;
  balance: string;
  /** The profile currency used to present the optional current equivalent. */
  defaultCurrency: string;
  equivalentBalance?: ConsumerFinanceBalanceEquivalent | null;
  archivedAt?: string | null;
};

export type ConsumerFinanceCategory = {
  id: string;
  parentId?: string | null;
  name: string;
  iconPresentation: ResolvedEmoji;
  key?: string | null;
  type: ConsumerFinanceTransactionType;
  archivedAt?: string | null;
};

/** Immutable valuation captured at transaction write time. */
export type ConsumerFinanceValuationSnapshot = {
  currency: string;
  amount: string;
  exchangeRate: string;
  rateAt?: string | null;
};

export type ConsumerFinanceTransaction = {
  id: string;
  accountId: string;
  categoryId?: string | null;
  type: ConsumerFinanceTransactionType;
  amount: string;
  currency: string;
  valuationSnapshot?: ConsumerFinanceValuationSnapshot | null;
  occurredAt: string;
  description?: string | null;
  /** Compact purchase context allowed in history; item rows remain detail-only. */
  merchantDisplay?: string | null;
  merchantNormalized?: string | null;
  source?: ConsumerFinanceTransactionSource;
  itemCount?: number;
  account?: {
    id: string;
    name: string;
    currency: string;
    iconPresentation: ResolvedEmoji;
  };
  category?: {
    id: string;
    name: string;
    key?: string | null;
    type: ConsumerFinanceTransactionType;
    iconPresentation: ResolvedEmoji;
  } | null;
};

/** Line-item data is deliberately absent from transaction collections. */
export type ConsumerFinanceTransactionItem = {
  id: string;
  displayName: string;
  normalizedName?: string | null;
  quantity?: string | null;
  unitPrice?: string | null;
  totalAmount: string;
  currency: string;
  category?: { id: string; name: string; key?: string | null } | null;
  metadata?: Record<string, unknown> | null;
};

/** Loaded only after an explicit detail action; never per history row. */
export type ConsumerFinanceTransactionDetail = ConsumerFinanceTransaction & {
  items: ConsumerFinanceTransactionItem[];
};

export type ConsumerFinanceHistoryQuery = {
  cursor?: string;
  limit?: number;
  type?: ConsumerFinanceTransactionType;
  accountId?: string;
  categoryId?: string;
  from?: string;
  to?: string;
  search?: string;
};

export type ConsumerFinanceHistoryPage = {
  items: ConsumerFinanceTransaction[];
  nextCursor: string | null;
};

/** Currency and conversion rate are derived by the backend from accountId. */
export type ConsumerFinanceTransactionInput = {
  accountId: string;
  categoryId?: string;
  type: ConsumerFinanceTransactionType;
  amount: string;
  description?: string;
  merchantDisplay?: string;
  /** Optional product detail is retained identically for every tier. */
  items?: Array<{
    displayName: string;
    quantity?: string;
    unitPrice?: string;
    totalAmount: string;
    currency: string;
    categoryId?: string;
  }>;
  occurredAt: string;
};

export type ConsumerFinanceAccountInput = {
  name: string;
  emoji?: string | null;
  type: ConsumerFinanceAccountType;
  currency: string;
  openingBalance?: string;
};

export type ConsumerFinanceAccountUpdate = Pick<
  ConsumerFinanceAccountInput,
  "name" | "type" | "emoji"
>;

export type ConsumerFinanceCategoryInput = {
  name: string;
  emoji?: string | null;
  type: ConsumerFinanceTransactionType;
  parentId?: string;
};

export type ConsumerFinanceCategoryUpdate = {
  name: string;
  emoji?: string | null;
  type: ConsumerFinanceTransactionType;
  parentId?: string | null;
};

export type ConsumerFinanceArchiveResult = { archived: true };
export type ConsumerFinanceDeleteResult = { deleted: true };
export type ConsumerFinanceUndoResult = {
  undone: true;
  duplicate: boolean;
  transaction?: ConsumerFinanceTransaction;
};

export type ConsumerFinanceBalanceSummary = {
  amount: string;
  currency: string;
  includedAccountCount: number;
  excludedAccounts: Array<{
    accountId: string;
    name: string;
    balance: string;
    currency: string;
    reason: "RATE_UNAVAILABLE";
  }>;
};

export type ConsumerFinanceLegacyFallback = {
  transactionCount: number;
  /** Native amounts grouped by recorded currency; never a cross-currency total. */
  nativeAmounts: Array<{ currency: string; amount: string }>;
  reason: "UNKNOWN_HISTORICAL_DEFAULT_CURRENCY";
};
