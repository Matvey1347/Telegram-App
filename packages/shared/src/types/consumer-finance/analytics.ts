import type { ConsumerFinanceProfile } from "./identity";
import type {
  ConsumerFinanceAccount,
  ConsumerFinanceBalanceSummary,
  ConsumerFinanceLegacyFallback,
  ConsumerFinanceTransaction,
} from "./ledger";
import type { ConsumerFinanceGoal, ConsumerFinanceLimit } from "./planning";

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
  from?: string;
  to?: string;
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
  legacyFallback?: ConsumerFinanceLegacyFallback | null;
};
