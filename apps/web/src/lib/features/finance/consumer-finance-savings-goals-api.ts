import type {
  ConsumerFinanceSavingsAllocationInput,
  ConsumerFinanceSavingsGoal,
  ConsumerFinanceSavingsGoalInput,
  ConsumerFinanceSavingsGoalPage,
  ConsumerFinanceSavingsGoalStatus,
  ConsumerFinanceSavingsMovementPage,
  ConsumerFinanceSavingsMutation,
  ConsumerFinanceSavingsReallocationInput,
} from "@telegram-system/shared";
import {
  consumerFinanceHttp,
  consumerFinanceRoot,
  consumerRequest,
} from "./consumer-finance-http";

type PageQuery = {
  status?: ConsumerFinanceSavingsGoalStatus;
  cursor?: string;
  limit?: number;
};

export const consumerFinanceSavingsGoalsApi = {
  list: async (botId: string, query: PageQuery = {}) =>
    (
      await consumerFinanceHttp.get<ConsumerFinanceSavingsGoalPage>(
        `${consumerFinanceRoot(botId)}/savings-goals`,
        consumerRequest({ params: query }),
      )
    ).data,
  get: async (botId: string, id: string) =>
    (
      await consumerFinanceHttp.get<ConsumerFinanceSavingsGoal>(
        `${consumerFinanceRoot(botId)}/savings-goals/${id}`,
        consumerRequest(),
      )
    ).data,
  create: async (botId: string, payload: ConsumerFinanceSavingsGoalInput) =>
    (
      await consumerFinanceHttp.post<ConsumerFinanceSavingsGoal>(
        `${consumerFinanceRoot(botId)}/savings-goals`,
        payload,
        consumerRequest(),
      )
    ).data,
  update: async (
    botId: string,
    id: string,
    payload: ConsumerFinanceSavingsGoalInput,
  ) =>
    (
      await consumerFinanceHttp.patch<ConsumerFinanceSavingsGoal>(
        `${consumerFinanceRoot(botId)}/savings-goals/${id}`,
        payload,
        consumerRequest(),
      )
    ).data,
  allocate: async (
    botId: string,
    id: string,
    payload: ConsumerFinanceSavingsAllocationInput,
  ) =>
    (
      await consumerFinanceHttp.post<ConsumerFinanceSavingsMutation>(
        `${consumerFinanceRoot(botId)}/savings-goals/${id}/allocate`,
        payload,
        consumerRequest(),
      )
    ).data,
  release: async (
    botId: string,
    id: string,
    payload: ConsumerFinanceSavingsAllocationInput,
  ) =>
    (
      await consumerFinanceHttp.post<ConsumerFinanceSavingsMutation>(
        `${consumerFinanceRoot(botId)}/savings-goals/${id}/release`,
        payload,
        consumerRequest(),
      )
    ).data,
  reallocate: async (
    botId: string,
    payload: ConsumerFinanceSavingsReallocationInput,
  ) =>
    (
      await consumerFinanceHttp.post<ConsumerFinanceSavingsMutation>(
        `${consumerFinanceRoot(botId)}/savings-goals/reallocate`,
        payload,
        consumerRequest(),
      )
    ).data,
  complete: async (botId: string, id: string) =>
    (
      await consumerFinanceHttp.post<ConsumerFinanceSavingsGoal>(
        `${consumerFinanceRoot(botId)}/savings-goals/${id}/complete`,
        {},
        consumerRequest(),
      )
    ).data,
  archive: async (botId: string, id: string) =>
    (
      await consumerFinanceHttp.post<ConsumerFinanceSavingsGoal>(
        `${consumerFinanceRoot(botId)}/savings-goals/${id}/archive`,
        {},
        consumerRequest(),
      )
    ).data,
  history: async (botId: string, id: string, query: PageQuery = {}) =>
    (
      await consumerFinanceHttp.get<ConsumerFinanceSavingsMovementPage>(
        `${consumerFinanceRoot(botId)}/savings-goals/${id}/history`,
        consumerRequest({ params: query }),
      )
    ).data,
};
