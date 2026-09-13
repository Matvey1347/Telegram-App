import type { ConsumerFinanceProfile } from "./identity";
import type {
  ConsumerFinanceAccount,
  ConsumerFinanceBalanceSummary,
  ConsumerFinanceLegacyFallback,
  ConsumerFinanceTransaction,
} from "./ledger";
import type { ConsumerFinanceInvestmentSummary } from "./investments";
import type { ConsumerFinanceLimit } from "./planning";
import type { ConsumerFinanceSavingsSummary } from "./savings-goals";

export type ConsumerFinanceNetWorthSummary = {
  amount: string;
  currency: string;
  cashAmount: string;
  investmentValue: string;
  complete: boolean;
  excludedAccountCount: number;
  excludedInvestmentCount: number;
};

export type ConsumerFinanceDashboard = {
  profile: ConsumerFinanceProfile;
  stats: {
    currency: string;
    income: string;
    expense: string;
    saved: string;
    invested: string;
    investmentReturns: string;
    net: string;
    totalBalance: ConsumerFinanceBalanceSummary;
    netWorth: ConsumerFinanceNetWorthSummary;
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
  savings: ConsumerFinanceSavingsSummary;
  investments: ConsumerFinanceInvestmentSummary;
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
  summary: {
    income: string;
    expenses: string;
    saved: string;
    invested: string;
    investmentReturns: string;
    netCashflow: string;
    requiredExpenses?: string;
    discretionaryExpenses?: string;
    unspecifiedExpenses?: string;
  };
  comparison: {
    period: { from: string; to: string };
    summary: {
      income: string;
      expenses: string;
      saved: string;
      invested: string;
      investmentReturns: string;
      netCashflow: string;
      requiredExpenses?: string;
      discretionaryExpenses?: string;
      unspecifiedExpenses?: string;
    };
    legacyFallback?: ConsumerFinanceLegacyFallback | null;
  };
  expensesByCategory: Array<{
    categoryId?: string | null;
    categoryKey?: string | null;
    name: string;
    amount: string;
    percentage: number;
  }>;
  incomeByCategory: Array<{
    categoryId?: string | null;
    categoryKey?: string | null;
    name: string;
    amount: string;
    percentage: number;
  }>;
  accounts: Array<{
    accountId: string;
    name: string;
    income: string;
    expenses: string;
    invested: string;
    investmentReturns: string;
    netCashflow: string;
  }>;
  timeline: Array<{
    date: string;
    income: string;
    expenses: string;
    saved: string;
    invested: string;
    investmentReturns: string;
    netCashflow: string;
  }>;
  trends: Array<{
    metric:
      | "INCOME"
      | "EXPENSES"
      | "SAVED"
      | "INVESTED"
      | "INVESTMENT_RETURNS"
      | "NET_CASHFLOW";
    direction: "UP" | "DOWN" | "STABLE";
    current: string;
    previous: string;
    changePercent: number | null;
  }>;
  legacyFallback?: ConsumerFinanceLegacyFallback | null;
  savings: ConsumerFinanceSavingsSummary;
  investments: ConsumerFinanceInvestmentSummary;
  netWorth: ConsumerFinanceNetWorthSummary;
};

export type ConsumerFinanceAiInsightInput = ConsumerFinanceAnalyticsQuery & {
  question: string;
};

export type ConsumerFinanceAiInsight = {
  answer: string;
  facts: Array<{ label: string; amount: string; currency: string }>;
  suggestedQuestions: string[];
};
