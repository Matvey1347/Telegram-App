import type {
  ConsumerFinanceAnalytics,
  ConsumerFinanceAnalyticsQuery,
  ConsumerFinanceDashboard,
  ConsumerFinanceUltimateAnalytics,
  ConsumerFinanceUltimateAnalyticsPeriod,
  ConsumerFinanceUltimateAnswer,
  ConsumerFinanceUltimateOverview,
  ConsumerFinanceUltimateQuestionInput,
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
  ultimateOverview: async (botId: string) =>
    (
      await consumerFinanceHttp.get<ConsumerFinanceUltimateOverview>(
        `${consumerFinanceRoot(botId)}/ultimate/overview`,
        consumerRequest(),
      )
    ).data,
  ultimateAnalytics: async (
    botId: string,
    period: ConsumerFinanceUltimateAnalyticsPeriod,
  ) =>
    (
      await consumerFinanceHttp.get<ConsumerFinanceUltimateAnalytics>(
        `${consumerFinanceRoot(botId)}/ultimate/analytics`,
        consumerRequest({ params: { period } }),
      )
    ).data,
  askFinance: async (
    botId: string,
    payload: ConsumerFinanceUltimateQuestionInput,
  ) =>
    (
      await consumerFinanceHttp.post<ConsumerFinanceUltimateAnswer>(
        `${consumerFinanceRoot(botId)}/ultimate/ask`,
        payload,
        consumerRequest(),
      )
    ).data,
};
