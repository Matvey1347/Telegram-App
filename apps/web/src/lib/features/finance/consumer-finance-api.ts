import { consumerFinanceAuthApi } from "./consumer-finance-auth-api";
import { consumerFinanceInsightsApi } from "./consumer-finance-insights-api";
import { consumerFinanceLedgerApi } from "./consumer-finance-ledger-api";
import { consumerFinancePlanningApi } from "./consumer-finance-planning-api";

/** Stable Consumer Finance facade; implementations are grouped by product capability. */
export const consumerFinanceApi = {
  ...consumerFinanceAuthApi,
  ...consumerFinanceInsightsApi,
  ...consumerFinanceLedgerApi,
  ...consumerFinancePlanningApi,
};

export type {
  ConsumerFinanceBrowserLoginChallenge,
  ConsumerFinanceBrowserLoginStatus,
} from "./consumer-finance-auth-api";
export {
  CONSUMER_FINANCE_REQUEST_TIMEOUT_MS,
  resolveConsumerFinanceApiBase,
} from "./consumer-finance-http";
