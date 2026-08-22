import type {
  ConsumerFinanceBalanceSummary,
  ConsumerFinanceLegacyFallback,
} from "./ledger";

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
  categories: Array<{
    name: string;
    amount: string;
    transactionCount: number;
  }>;
  merchants: Array<{
    name: string;
    amount: string;
    transactionCount: number;
    averageTransaction: string;
  }>;
  accounts: Array<{ name: string; amount: string; transactionCount: number }>;
  trend: Array<{ date: string; amount: string; transactionCount: number }>;
  items: {
    currency: string;
    availablePurchaseCount: number;
    totalPurchaseCount: number;
    rows: Array<{ name: string; amount: string; quantity: string | null }>;
  };
  legacyFallback?: ConsumerFinanceLegacyFallback | null;
};

export type ConsumerFinanceUltimateQuestionInput = { question: string };
export type ConsumerFinanceUltimateAnswer = {
  answer: string;
  facts: Array<{ label: string; amount: string; currency: string }>;
  suggestedQuestions: string[];
};
