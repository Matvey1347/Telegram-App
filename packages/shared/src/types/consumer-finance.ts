export type ConsumerFinanceProfile = { id: string; defaultCurrency: string; timezone: string; locale?: string | null; onboardingCompletedAt?: string | null };
export type ConsumerFinanceAccountType = 'CASH' | 'CARD' | 'SAVINGS' | 'OTHER';
export type ConsumerFinanceTransactionType = 'INCOME' | 'EXPENSE';
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
export type ConsumerFinanceCategory = { id: string; parentId?: string | null; name: string; type: ConsumerFinanceTransactionType; archivedAt?: string | null };
/** Immutable valuation captured at the transaction write time. */
export type ConsumerFinanceValuationSnapshot = {
  currency: string;
  amount: string;
  exchangeRate: string;
  rateAt?: string | null;
};
export type ConsumerFinanceTransaction = { id: string; accountId: string; categoryId?: string | null; type: ConsumerFinanceTransactionType; amount: string; currency: string; valuationSnapshot?: ConsumerFinanceValuationSnapshot | null; occurredAt: string; description?: string | null; account?: { id: string; name: string; currency: string }; category?: { id: string; name: string; type: ConsumerFinanceTransactionType } | null };
export type ConsumerFinanceHistoryQuery = { cursor?: string; limit?: number; type?: ConsumerFinanceTransactionType; accountId?: string; categoryId?: string; from?: string; to?: string };
export type ConsumerFinanceHistoryPage = { items: ConsumerFinanceTransaction[]; nextCursor: string | null };
/** Currency and conversion rate are derived by the backend from accountId. */
export type ConsumerFinanceTransactionInput = { accountId: string; categoryId?: string; type: ConsumerFinanceTransactionType; amount: string; description?: string; occurredAt: string };
export type ConsumerFinanceAccountInput = { name: string; type: ConsumerFinanceAccountType; currency: string; openingBalance?: string };
export type ConsumerFinanceAccountUpdate = Pick<ConsumerFinanceAccountInput, 'name' | 'type'>;
export type ConsumerFinanceCategoryInput = { name: string; type: ConsumerFinanceTransactionType; parentId?: string };
export type ConsumerFinanceTransferInput = { fromAccountId: string; toAccountId: string; fromAmount: string; toAmount: string; occurredAt: string; description?: string };
export type ConsumerFinanceTransfer = ConsumerFinanceTransferInput & { id: string; fromCurrency: string; toCurrency: string; exchangeRate?: string | null; deletedAt?: string | null };
export type ConsumerFinanceLimit = { id: string; categoryId: string; amount: string; currency: string; spent: string; remaining: string; percentage: number; category: { id: string; name: string } };
export type ConsumerFinanceGoal = { id: string; name: string; targetAmount: string; currentAmount: string; currency: string; targetDate?: string | null; active?: boolean };
export type ConsumerFinanceGoalInput = { name: string; targetAmount: string; currentAmount?: string; currency: string; targetDate?: string };
export type ConsumerFinanceReminder = { id: string; name: string; amount: string; currency: string; recurrence: 'MONTHLY'; dayOfMonth: number; reminderOffsetMinutes: number; nextOccurrenceAt: string; enabled: boolean };
export type ConsumerFinanceReminderInput = { name: string; amount: string; currency: string; dayOfMonth: number; reminderOffsetMinutes?: number };
export type ConsumerFinanceSettingsInput = { defaultCurrency: string; timezone: string; locale?: string };
export type ConsumerFinanceArchiveResult = { archived: true };
export type ConsumerFinanceDeleteResult = { deleted: true };
export type ConsumerFinanceUndoResult = { undone: true; duplicate: boolean; transaction?: ConsumerFinanceTransaction };
export type ConsumerFinanceDashboard = { profile: ConsumerFinanceProfile; stats: { currency: string; income: string; expense: string; net: string; categories: Array<{ categoryId?: string | null; name: string; amount: string; currency: string }>; accounts: ConsumerFinanceAccount[] }; limits: ConsumerFinanceLimit[]; goal?: ConsumerFinanceGoal | null; recent: ConsumerFinanceTransaction[] };
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
export type ConsumerFinanceAnalytics = {
  currency: string;
  period: ConsumerFinanceAnalyticsQuery & { from: string; to: string };
  summary: { income: string; expenses: string; netCashflow: string };
  expensesByCategory: Array<{
    categoryId?: string | null;
    name: string;
    amount: string;
    percentage: number;
  }>;
  timeline: Array<{ date: string; income: string; expenses: string; netCashflow: string }>;
  /** Pre-valuation rows are retained but excluded from currency totals because their historical base is unknown. */
  legacyFallback?: {
    transactionCount: number;
    /** Native transaction amounts grouped by their recorded account currency; never a cross-currency total. */
    nativeAmounts: Array<{ currency: string; amount: string }>;
    reason: 'UNKNOWN_HISTORICAL_DEFAULT_CURRENCY';
  } | null;
};
export type ConsumerBillingCatalog = { plans: Array<{ id: string; code: string; name: string; description?: string | null; prices: Array<{ id: string; currency: string; interval: 'MONTH' | 'YEAR'; amountMinor: number; version: number }> }>; subscriptions: Array<{ id: string; source: string; status: string; currency?: string | null; interval?: string | null; amountMinor?: number | null; currentPeriodEnd?: string | null; cancelAtPeriodEnd: boolean }>; providers: Array<{ provider: 'STRIPE' | 'TELEGRAM_STARS'; mode: 'TEST' | 'LIVE'; capabilities: { intervals: Array<'MONTH' | 'YEAR'> } }> };
