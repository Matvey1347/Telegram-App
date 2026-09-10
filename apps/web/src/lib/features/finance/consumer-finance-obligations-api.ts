import type {
  ConsumerFinanceApplyOccurrenceAmountInput,
  ConsumerFinanceDebt,
  ConsumerFinanceDebtInput,
  ConsumerFinanceDebtPage,
  ConsumerFinanceDebtQuery,
  ConsumerFinanceDebtSettlement,
  ConsumerFinanceRegularPayment,
  ConsumerFinanceRegularPaymentConfirmation,
  ConsumerFinanceRegularPaymentConfirmInput,
  ConsumerFinanceRegularPaymentInput,
  ConsumerFinanceRegularPaymentPage,
  ConsumerFinanceRegularPaymentQuery,
  ConsumerFinanceRegularPaymentRevisionPage,
} from "@telegram-system/shared";
import {
  consumerFinanceHttp,
  consumerFinanceRoot,
  consumerRequest,
} from "./consumer-finance-http";

export const consumerFinanceObligationsApi = {
  debts: async (botId: string, query: ConsumerFinanceDebtQuery) =>
    (
      await consumerFinanceHttp.get<ConsumerFinanceDebtPage>(
        `${consumerFinanceRoot(botId)}/debts`,
        consumerRequest({ params: query }),
      )
    ).data,
  createDebt: async (botId: string, input: ConsumerFinanceDebtInput) =>
    (
      await consumerFinanceHttp.post<ConsumerFinanceDebt>(
        `${consumerFinanceRoot(botId)}/debts`,
        input,
        consumerRequest(),
      )
    ).data,
  updateDebt: async (
    botId: string,
    id: string,
    input: ConsumerFinanceDebtInput,
  ) =>
    (
      await consumerFinanceHttp.patch<ConsumerFinanceDebt>(
        `${consumerFinanceRoot(botId)}/debts/${id}`,
        input,
        consumerRequest(),
      )
    ).data,
  settleDebt: async (botId: string, id: string) =>
    (
      await consumerFinanceHttp.post<ConsumerFinanceDebtSettlement>(
        `${consumerFinanceRoot(botId)}/debts/${id}/settle`,
        {},
        consumerRequest(),
      )
    ).data,
  regularPayments: async (
    botId: string,
    query: ConsumerFinanceRegularPaymentQuery,
  ) =>
    (
      await consumerFinanceHttp.get<ConsumerFinanceRegularPaymentPage>(
        `${consumerFinanceRoot(botId)}/regular-payments`,
        consumerRequest({ params: query }),
      )
    ).data,
  createRegularPayment: async (
    botId: string,
    input: ConsumerFinanceRegularPaymentInput,
  ) =>
    (
      await consumerFinanceHttp.post<ConsumerFinanceRegularPayment>(
        `${consumerFinanceRoot(botId)}/regular-payments`,
        input,
        consumerRequest(),
      )
    ).data,
  updateRegularPayment: async (
    botId: string,
    id: string,
    input: ConsumerFinanceRegularPaymentInput,
  ) =>
    (
      await consumerFinanceHttp.patch<ConsumerFinanceRegularPayment>(
        `${consumerFinanceRoot(botId)}/regular-payments/${id}`,
        input,
        consumerRequest(),
      )
    ).data,
  pauseRegularPayment: (botId: string, id: string) =>
    regularStatusAction(botId, id, "pause"),
  resumeRegularPayment: (botId: string, id: string) =>
    regularStatusAction(botId, id, "resume"),
  cancelRegularPayment: (botId: string, id: string) =>
    regularStatusAction(botId, id, "cancel"),
  confirmRegularPayment: async (
    botId: string,
    id: string,
    input: ConsumerFinanceRegularPaymentConfirmInput,
  ) =>
    (
      await consumerFinanceHttp.post<ConsumerFinanceRegularPaymentConfirmation>(
        `${consumerFinanceRoot(botId)}/regular-payments/${id}/confirm`,
        input,
        consumerRequest(),
      )
    ).data,
  regularPaymentRevisions: async (
    botId: string,
    id: string,
    query: { cursor?: string; limit?: number },
  ) =>
    (
      await consumerFinanceHttp.get<ConsumerFinanceRegularPaymentRevisionPage>(
        `${consumerFinanceRoot(botId)}/regular-payments/${id}/revisions`,
        consumerRequest({ params: query }),
      )
    ).data,
  applyOccurrenceAmount: async (
    botId: string,
    id: string,
    occurrenceId: string,
    input: ConsumerFinanceApplyOccurrenceAmountInput,
  ) =>
    (
      await consumerFinanceHttp.post<ConsumerFinanceRegularPayment>(
        `${consumerFinanceRoot(botId)}/regular-payments/${id}/occurrences/${occurrenceId}/apply-amount`,
        input,
        consumerRequest(),
      )
    ).data,
};

async function regularStatusAction(
  botId: string,
  id: string,
  action: "pause" | "resume" | "cancel",
) {
  return (
    await consumerFinanceHttp.post<ConsumerFinanceRegularPayment>(
      `${consumerFinanceRoot(botId)}/regular-payments/${id}/${action}`,
      {},
      consumerRequest(),
    )
  ).data;
}
