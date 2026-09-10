import type {
  ConsumerFinanceAiInsight,
  ConsumerFinanceAiInsightInput,
  ConsumerFinanceAnalytics,
  ConsumerFinanceAnalyticsQuery,
  ConsumerFinanceDashboard,
} from "@telegram-system/shared";
import {
  consumerFinanceHttp,
  consumerFinanceRoot,
  consumerRequest,
} from "./consumer-finance-http";

export const consumerFinanceInsightsApi = {
  dashboard: async (botId: string) =>
    (
      await consumerFinanceHttp.get<ConsumerFinanceDashboard>(
        `${consumerFinanceRoot(botId)}/dashboard`,
        consumerRequest(),
      )
    ).data,
  analytics: async (botId: string, query: ConsumerFinanceAnalyticsQuery) =>
    (
      await consumerFinanceHttp.get<ConsumerFinanceAnalytics>(
        `${consumerFinanceRoot(botId)}/analytics`,
        consumerRequest({ params: query }),
      )
    ).data,
  askFinance: async (botId: string, payload: ConsumerFinanceAiInsightInput) =>
    (
      await consumerFinanceHttp.post<ConsumerFinanceAiInsight>(
        `${consumerFinanceRoot(botId)}/ultimate/ask`,
        payload,
        consumerRequest(),
      )
    ).data,
};
