import { consumerFinanceAuthApi } from "./consumer-finance-auth-api";
import { consumerFinanceInsightsApi } from "./consumer-finance-insights-api";
import { consumerFinanceLedgerApi } from "./consumer-finance-ledger-api";
import { consumerFinanceInvestmentsApi } from "./consumer-finance-investments-api";
import { consumerFinancePlanningApi } from "./consumer-finance-planning-api";
import { consumerFinanceProfileApi } from "./consumer-finance-profile-api";
import { consumerFinanceSavingsGoalsApi } from "./consumer-finance-savings-goals-api";

/** Stable Consumer Finance facade; implementations are grouped by product capability. */
export const consumerFinanceApi = {
  ...consumerFinanceAuthApi,
  ...consumerFinanceInsightsApi,
  ...consumerFinanceLedgerApi,
  ...consumerFinanceProfileApi,
  ...consumerFinancePlanningApi,
  savingsGoals: consumerFinanceSavingsGoalsApi,
  investments: consumerFinanceInvestmentsApi,
};

export type {
  ConsumerFinanceBrowserLoginChallenge,
  ConsumerFinanceBrowserLoginStatus,
} from "./consumer-finance-auth-api";
export {
  CONSUMER_FINANCE_REQUEST_TIMEOUT_MS,
  resolveConsumerFinanceApiBase,
} from "./consumer-finance-http";
