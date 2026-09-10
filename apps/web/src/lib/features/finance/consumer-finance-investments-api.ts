import type {
  ConsumerFinanceInvestment,
  ConsumerFinanceInvestmentCashFlowInput,
  ConsumerFinanceInvestmentCloseInput,
  ConsumerFinanceInvestmentDetail,
  ConsumerFinanceInvestmentHistoryPage,
  ConsumerFinanceInvestmentInput,
  ConsumerFinanceInvestmentMutation,
  ConsumerFinanceInvestmentPage,
  ConsumerFinanceInvestmentStatus,
  ConsumerFinanceInvestmentSummary,
  ConsumerFinanceInvestmentUpdate,
  ConsumerFinanceInvestmentValuation,
  ConsumerFinanceInvestmentValuationInput,
  ConsumerFinanceInvestmentCashFlow,
} from "@telegram-system/shared";
import {
  consumerFinanceHttp,
  consumerFinanceRoot,
  consumerRequest,
} from "./consumer-finance-http";

type PageQuery = {
  status?: ConsumerFinanceInvestmentStatus;
  cursor?: string;
  limit?: number;
};

const root = (botId: string) => `${consumerFinanceRoot(botId)}/investments`;

export const consumerFinanceInvestmentsApi = {
  list: async (botId: string, query: PageQuery = {}) =>
    (
      await consumerFinanceHttp.get<ConsumerFinanceInvestmentPage>(
        root(botId),
        consumerRequest({ params: query }),
      )
    ).data,
  summary: async (botId: string) =>
    (
      await consumerFinanceHttp.get<ConsumerFinanceInvestmentSummary>(
        `${root(botId)}/summary`,
        consumerRequest(),
      )
    ).data,
  get: async (botId: string, id: string) =>
    (
      await consumerFinanceHttp.get<ConsumerFinanceInvestmentDetail>(
        `${root(botId)}/${id}`,
        consumerRequest(),
      )
    ).data,
  create: async (botId: string, payload: ConsumerFinanceInvestmentInput) =>
    (
      await consumerFinanceHttp.post<ConsumerFinanceInvestment>(
        root(botId),
        payload,
        consumerRequest(),
      )
    ).data,
  update: async (
    botId: string,
    id: string,
    payload: ConsumerFinanceInvestmentUpdate,
  ) =>
    (
      await consumerFinanceHttp.patch<ConsumerFinanceInvestment>(
        `${root(botId)}/${id}`,
        payload,
        consumerRequest(),
      )
    ).data,
  cashFlows: async (botId: string, id: string, query: PageQuery = {}) =>
    (
      await consumerFinanceHttp.get<
        ConsumerFinanceInvestmentHistoryPage<ConsumerFinanceInvestmentCashFlow>
      >(`${root(botId)}/${id}/cash-flows`, consumerRequest({ params: query }))
    ).data,
  addCashFlow: async (
    botId: string,
    id: string,
    payload: ConsumerFinanceInvestmentCashFlowInput,
  ) =>
    (
      await consumerFinanceHttp.post<ConsumerFinanceInvestmentMutation>(
        `${root(botId)}/${id}/cash-flows`,
        payload,
        consumerRequest(),
      )
    ).data,
  valuations: async (botId: string, id: string, query: PageQuery = {}) =>
    (
      await consumerFinanceHttp.get<
        ConsumerFinanceInvestmentHistoryPage<ConsumerFinanceInvestmentValuation>
      >(`${root(botId)}/${id}/valuations`, consumerRequest({ params: query }))
    ).data,
  addValuation: async (
    botId: string,
    id: string,
    payload: ConsumerFinanceInvestmentValuationInput,
  ) =>
    (
      await consumerFinanceHttp.post<ConsumerFinanceInvestmentMutation>(
        `${root(botId)}/${id}/valuations`,
        payload,
        consumerRequest(),
      )
    ).data,
  close: async (
    botId: string,
    id: string,
    payload: ConsumerFinanceInvestmentCloseInput,
  ) =>
    (
      await consumerFinanceHttp.post<ConsumerFinanceInvestmentMutation>(
        `${root(botId)}/${id}/close`,
        payload,
        consumerRequest(),
      )
    ).data,
  archive: async (botId: string, id: string) =>
    (
      await consumerFinanceHttp.post<ConsumerFinanceInvestment>(
        `${root(botId)}/${id}/archive`,
        {},
        consumerRequest(),
      )
    ).data,
};
