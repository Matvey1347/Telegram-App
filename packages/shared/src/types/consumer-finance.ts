import type { ResolvedEmoji } from "./resolved-emoji";

export type FinanceLocale = "uk" | "ru" | "en";
export type ConsumerFinanceProfile = {
  id: string;
  defaultCurrency: string;
  timezone: string;
  /** Effective locale after applying the Telegram fallback. */ locale: FinanceLocale;
  /** Explicit user preference; null means follow Telegram. */ localeOverride?: FinanceLocale | null;
  onboardingCompletedAt?: string | null;
};
export type ConsumerFinanceSessionState =
  | { authenticated: true; profile: ConsumerFinanceProfile }
  | { authenticated: false };
export type ConsumerFinanceAccountType = "CASH" | "CARD" | "SAVINGS" | "OTHER";
export type ConsumerFinanceTransactionType = "INCOME" | "EXPENSE";
export type ConsumerFinanceTransactionSource =
  | "CHAT"
  | "MINI_APP"
  | "AI"
  | "RECEIPT";
/** Canonical product tier. Storage fidelity must never depend on this value. */
export type ConsumerFinanceTier = "FREE" | "PRO" | "ULTIMATE";
/**
 * Feature gates are intentionally capability-based so consumers never infer
 * access from a billing plan name.
 */
export type ConsumerFinanceCapability =
  | "AI_INPUT"
  | "VOICE_INPUT"
  | "INTELLIGENT_CATEGORIZATION"
  | "RECEIPT_SCAN"
  | "SMART_LIMITS"
  | "FINANCE_HISTORY_QA"
  | "DEEP_ANALYTICS"
  | "ITEM_ANALYTICS"
  | "MERCHANT_PATTERNS"
  | "AUTOMATIC_INSIGHTS"
  | "ANOMALY_DETECTION"
  | "FINANCIAL_FORECAST";
export type ConsumerFinanceUsageFeature = "AI_INPUT" | "RECEIPT_SCAN";
export type ConsumerFinanceUsage = {
  feature: ConsumerFinanceUsageFeature;
  /** Successful operations only. */
  used: number;
  /** null denotes no quota. */
  limit: number | null;
  remaining: number | null;
  /** Present for period-based quotas and absent for lifetime/unlimited use. */
  resetAt: string | null;
};
export type ConsumerFinanceEntitlements = {
  tier: ConsumerFinanceTier;
  capabilities: ConsumerFinanceCapability[];
  usage: ConsumerFinanceUsage[];
  activeUntil: string | null;
  cancelAtPeriodEnd: boolean;
};
/** A current conversion supplied by the API for display only; the client never calculates it. */
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
/** Immutable valuation captured at the transaction write time. */
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
/** Loaded only after an explicit transaction-detail action; never per history row. */
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
export type ConsumerFinanceTransferInput = {
  fromAccountId: string;
  toAccountId: string;
  amount: string;
  occurredAt: string;
  description?: string;
};
export type ConsumerFinanceTransfer = {
  id: string;
  fromAccountId: string;
  toAccountId: string;
  fromAmount: string;
  toAmount: string;
  fromCurrency: string;
  toCurrency: string;
  exchangeRate: string;
  occurredAt: string;
  description?: string | null;
  deletedAt?: string | null;
  fromAccount: { id: string; name: string; currency: string };
  toAccount: { id: string; name: string; currency: string };
};
export type ConsumerFinanceTransferQuery = {
  cursor?: string;
  limit?: number;
  accountId?: string;
  from?: string;
  to?: string;
  search?: string;
};
export type ConsumerFinanceTransferPage = {
  items: ConsumerFinanceTransfer[];
  nextCursor: string | null;
};
export type ConsumerFinanceLimit = {
  id: string;
  categoryId: string;
  amount: string;
  currency: string;
  spent: string;
  remaining: string;
  percentage: number;
  category: { id: string; name: string; key?: string | null };
  /** Pre-valuation expenses are excluded because their historical USD value is unknowable. */
  legacyFallback?: ConsumerFinanceLegacyFallback | null;
};
export type ConsumerFinanceGoal = {
  id: string;
  name: string;
  targetAmount: string;
  currentAmount: string;
  currency: string;
  targetDate?: string | null;
  active?: boolean;
};
export type ConsumerFinanceGoalInput = {
  name: string;
  targetAmount: string;
  currentAmount?: string;
  currency: string;
  targetDate?: string;
};
export type ConsumerFinanceReminder = {
  id: string;
  name: string;
  amount: string;
  currency: string;
  recurrence: "MONTHLY";
  dayOfMonth: number;
  reminderOffsetMinutes: number;
  nextOccurrenceAt: string;
  enabled: boolean;
};
export type ConsumerFinanceReminderInput = {
  name: string;
  amount: string;
  currency: string;
  dayOfMonth: number;
  reminderOffsetMinutes?: number;
};
export type ConsumerFinanceSettingsInput = {
  defaultCurrency: string;
  timezone: string;
  locale?: FinanceLocale | null;
};
export type ConsumerFinanceArchiveResult = { archived: true };
export type ConsumerFinanceDeleteResult = { deleted: true };
export type ConsumerFinanceUndoResult = {
  undone: true;
  duplicate: boolean;
  transaction?: ConsumerFinanceTransaction;
};
export type ConsumerFinanceBalanceSummary = {
  /** Sum of active accounts that can be expressed in the profile default currency. */
  amount: string;
  currency: string;
  includedAccountCount: number;
  /** Accounts remain visible but are never silently mixed into the total. */
  excludedAccounts: Array<{
    accountId: string;
    name: string;
    balance: string;
    currency: string;
    reason: "RATE_UNAVAILABLE";
  }>;
};
export type ConsumerFinanceDashboard = {
  profile: ConsumerFinanceProfile;
  stats: {
    currency: string;
    income: string;
    expense: string;
    net: string;
    totalBalance: ConsumerFinanceBalanceSummary;
    categories: Array<{
      categoryId?: string | null;
      categoryKey?: string | null;
      name: string;
      amount: string;
      currency: string;
    }>;
    accounts: ConsumerFinanceAccount[];
  };
  limits: ConsumerFinanceLimit[];
  goal?: ConsumerFinanceGoal | null;
  recent: ConsumerFinanceTransaction[];
};
export type ConsumerFinanceAnalyticsPeriod =
  | "CURRENT_MONTH"
  | "PREVIOUS_MONTH"
  | "LAST_3_MONTHS"
  | "CUSTOM";
export type ConsumerFinanceAnalyticsQuery = {
  period: ConsumerFinanceAnalyticsPeriod;
  /** Required only when period is CUSTOM; ISO-8601 calendar dates. */
  from?: string;
  to?: string;
};
export type ConsumerFinanceLegacyFallback = {
  transactionCount: number;
  /** Native transaction amounts grouped by their recorded account currency; never a cross-currency total. */
  nativeAmounts: Array<{ currency: string; amount: string }>;
  reason: "UNKNOWN_HISTORICAL_DEFAULT_CURRENCY";
};
export type ConsumerFinanceAnalytics = {
  currency: string;
  period: ConsumerFinanceAnalyticsQuery & { from: string; to: string };
  summary: { income: string; expenses: string; netCashflow: string };
  expensesByCategory: Array<{
    categoryId?: string | null;
    categoryKey?: string | null;
    name: string;
    amount: string;
    percentage: number;
  }>;
  timeline: Array<{
    date: string;
    income: string;
    expenses: string;
    netCashflow: string;
  }>;
  /** Pre-valuation rows are retained but excluded from currency totals because their historical base is unknown. */
  legacyFallback?: ConsumerFinanceLegacyFallback | null;
};
/** Ultimate data is generated only when requested; it is never a persisted snapshot. */
export type ConsumerFinanceUltimateInsight = {
  kind: "CATEGORY_CHANGE" | "MERCHANT_CHANGE" | "HIGH_SPEND";
  title: string;
  detail: string;
  amount?: string;
  changePercent?: number;
};
export type ConsumerFinanceUltimateAnomaly = {
  merchant: string;
  amount: string;
  usualAmount: string;
  multiple: number;
  occurredAt: string;
};
export type ConsumerFinanceUltimateOverview = {
  currency: string;
  balance: string;
  balanceSummary: ConsumerFinanceBalanceSummary;
  forecast: {
    expectedIncome: string;
    expectedExpenses: string;
    projectedBalance: string;
    through: string;
  };
  insights: ConsumerFinanceUltimateInsight[];
  anomalies: ConsumerFinanceUltimateAnomaly[];
};
export type ConsumerFinanceUltimateAnalyticsPeriod =
  | "LAST_3_MONTHS"
  | "LAST_6_MONTHS"
  | "LAST_12_MONTHS";
export type ConsumerFinanceUltimateAnalytics = {
  currency: string;
  period: { from: string; to: string };
  categories: Array<{ name: string; amount: string; transactionCount: number }>;
  merchants: Array<{
    name: string;
    amount: string;
    transactionCount: number;
    averageTransaction: string;
  }>;
  accounts: Array<{ name: string; amount: string; transactionCount: number }>;
  trend: Array<{ date: string; amount: string; transactionCount: number }>;
  items: {
    /** Item totals use native transaction values and are limited to this currency. */
    currency: string;
    availablePurchaseCount: number;
    totalPurchaseCount: number;
    rows: Array<{ name: string; amount: string; quantity: string | null }>;
  };
  /** Pre-valuation rows excluded from the USD-denominated Ultimate aggregates. */
  legacyFallback?: ConsumerFinanceLegacyFallback | null;
};
export type ConsumerFinanceUltimateQuestionInput = { question: string };
export type ConsumerFinanceUltimateAnswer = {
  answer: string;
  facts: Array<{ label: string; amount: string; currency: string }>;
  suggestedQuestions: string[];
};
export type ConsumerBillingCatalog = {
  plans: Array<{
    id: string;
    code: string;
    name: string;
    description?: string | null;
    prices: Array<{
      id: string;
      currency: string;
      interval: "MONTH" | "YEAR";
      amountMinor: number;
      version: number;
    }>;
  }>;
  subscriptions: Array<{
    id: string;
    source: string;
    status: string;
    currency?: string | null;
    interval?: string | null;
    amountMinor?: number | null;
    currentPeriodEnd?: string | null;
    cancelAtPeriodEnd: boolean;
  }>;
  providers: Array<{
    provider: "STRIPE" | "TELEGRAM_STARS";
    mode: "TEST" | "LIVE";
    capabilities: { intervals: Array<"MONTH" | "YEAR"> };
  }>;
};
