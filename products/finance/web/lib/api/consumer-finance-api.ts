import { consumerFinanceAuthApi } from "@consumer-finance/web/lib/api/consumer-finance-auth-api";
import { consumerFinanceInsightsApi } from "@consumer-finance/web/lib/api/consumer-finance-insights-api";
import { consumerFinanceLedgerApi } from "@consumer-finance/web/lib/api/consumer-finance-ledger-api";
import { consumerFinanceInvestmentsApi } from "@consumer-finance/web/lib/api/consumer-finance-investments-api";
import { consumerFinancePlanningApi } from "@consumer-finance/web/lib/api/consumer-finance-planning-api";
import { consumerFinancePortabilityApi } from "@consumer-finance/web/lib/api/consumer-finance-portability-api";
import { consumerFinanceProfileApi } from "@consumer-finance/web/lib/api/consumer-finance-profile-api";
import { consumerFinanceSavingsGoalsApi } from "@consumer-finance/web/lib/api/consumer-finance-savings-goals-api";

/** Stable Consumer Finance facade; implementations are grouped by product capability. */
export const consumerFinanceApi = {
  ...consumerFinanceAuthApi,
  ...consumerFinanceInsightsApi,
  ...consumerFinanceLedgerApi,
  ...consumerFinanceProfileApi,
  ...consumerFinancePlanningApi,
  ...consumerFinancePortabilityApi,
  savingsGoals: consumerFinanceSavingsGoalsApi,
  investments: consumerFinanceInvestmentsApi,
};

export type {
  ConsumerFinanceBrowserLoginChallenge,
  ConsumerFinanceBrowserLoginStatus,
} from "@consumer-finance/web/lib/api/consumer-finance-auth-api";
export {
  CONSUMER_FINANCE_REQUEST_TIMEOUT_MS,
  resolveConsumerFinanceApiBase,
} from "@consumer-finance/web/lib/api/consumer-finance-http";
