import type {
  ConsumerFinanceAccount,
  ConsumerFinanceAccountInput,
  ConsumerFinanceAccountUpdate,
  ConsumerFinanceCategory,
  ConsumerFinanceCategoryInput,
  ConsumerFinanceCategoryUpdate,
  ConsumerFinanceDeleteResult,
  ConsumerFinanceHistoryPage,
  ConsumerFinanceHistoryQuery,
  ConsumerFinanceTransaction,
  ConsumerFinanceTransactionDetail,
  ConsumerFinanceTransactionInput,
  ConsumerFinanceTransfer,
  ConsumerFinanceTransferInput,
  ConsumerFinanceTransferPage,
  ConsumerFinanceTransferQuery,
  ConsumerFinanceUndoResult,
} from "@telegram-system/shared";
import {
  consumerFinanceHttp,
  consumerFinanceRoot,
  consumerRequest,
} from "./consumer-finance-http";

export const consumerFinanceLedgerApi = {
  accounts: async (botId: string) =>
    (
      await consumerFinanceHttp.get<ConsumerFinanceAccount[]>(
        `${consumerFinanceRoot(botId)}/accounts`,
        consumerRequest(),
      )
    ).data,
  createAccount: async (botId: string, payload: ConsumerFinanceAccountInput) =>
    (
      await consumerFinanceHttp.post<ConsumerFinanceAccount>(
        `${consumerFinanceRoot(botId)}/accounts`,
        payload,
        consumerRequest(),
      )
    ).data,
  updateAccount: async (
    botId: string,
    id: string,
    payload: ConsumerFinanceAccountUpdate,
  ) =>
    (
      await consumerFinanceHttp.patch<ConsumerFinanceAccount>(
        `${consumerFinanceRoot(botId)}/accounts/${id}`,
        payload,
        consumerRequest(),
      )
    ).data,
  archiveAccount: async (botId: string, id: string) =>
    (
      await consumerFinanceHttp.delete<ConsumerFinanceAccount>(
        `${consumerFinanceRoot(botId)}/accounts/${id}`,
        consumerRequest(),
      )
    ).data,
  categories: async (botId: string) =>
    (
      await consumerFinanceHttp.get<ConsumerFinanceCategory[]>(
        `${consumerFinanceRoot(botId)}/categories`,
        consumerRequest(),
      )
    ).data,
  createCategory: async (
    botId: string,
    payload: ConsumerFinanceCategoryInput,
  ) =>
    (
      await consumerFinanceHttp.post<ConsumerFinanceCategory>(
        `${consumerFinanceRoot(botId)}/categories`,
        payload,
        consumerRequest(),
      )
    ).data,
  updateCategory: async (
    botId: string,
    id: string,
    payload: ConsumerFinanceCategoryUpdate,
  ) =>
    (
      await consumerFinanceHttp.patch<ConsumerFinanceCategory>(
        `${consumerFinanceRoot(botId)}/categories/${id}`,
        payload,
        consumerRequest(),
      )
    ).data,
  archiveCategory: async (botId: string, id: string) =>
    (
      await consumerFinanceHttp.delete<ConsumerFinanceCategory>(
        `${consumerFinanceRoot(botId)}/categories/${id}`,
        consumerRequest(),
      )
    ).data,
  transactions: async (botId: string, query: ConsumerFinanceHistoryQuery) =>
    (
      await consumerFinanceHttp.get<ConsumerFinanceHistoryPage>(
        `${consumerFinanceRoot(botId)}/transactions`,
        consumerRequest({ params: query }),
      )
    ).data,
  transaction: async (botId: string, id: string) =>
    (
      await consumerFinanceHttp.get<ConsumerFinanceTransactionDetail>(
        `${consumerFinanceRoot(botId)}/transactions/${id}`,
        consumerRequest(),
      )
    ).data,
  createTransaction: async (
    botId: string,
    payload: ConsumerFinanceTransactionInput,
  ) =>
    (
      await consumerFinanceHttp.post<ConsumerFinanceTransaction>(
        `${consumerFinanceRoot(botId)}/transactions`,
        payload,
        consumerRequest(),
      )
    ).data,
  updateTransaction: async (
    botId: string,
    id: string,
    payload: ConsumerFinanceTransactionInput,
  ) =>
    (
      await consumerFinanceHttp.patch<ConsumerFinanceTransaction>(
        `${consumerFinanceRoot(botId)}/transactions/${id}`,
        payload,
        consumerRequest(),
      )
    ).data,
  deleteTransaction: async (botId: string, id: string) =>
    (
      await consumerFinanceHttp.delete<ConsumerFinanceDeleteResult>(
        `${consumerFinanceRoot(botId)}/transactions/${id}`,
        consumerRequest(),
      )
    ).data,
  undoTransaction: async (botId: string, id: string) =>
    (
      await consumerFinanceHttp.post<ConsumerFinanceUndoResult>(
        `${consumerFinanceRoot(botId)}/transactions/${id}/undo`,
        {},
        consumerRequest(),
      )
    ).data,
  createTransfer: async (
    botId: string,
    payload: ConsumerFinanceTransferInput,
  ) =>
    (
      await consumerFinanceHttp.post<ConsumerFinanceTransfer>(
        `${consumerFinanceRoot(botId)}/transfers`,
        payload,
        consumerRequest(),
      )
    ).data,
  transfers: async (botId: string, query: ConsumerFinanceTransferQuery) =>
    (
      await consumerFinanceHttp.get<ConsumerFinanceTransferPage>(
        `${consumerFinanceRoot(botId)}/transfers`,
        consumerRequest({ params: query }),
      )
    ).data,
  updateTransfer: async (
    botId: string,
    id: string,
    payload: ConsumerFinanceTransferInput,
  ) =>
    (
      await consumerFinanceHttp.patch<ConsumerFinanceTransfer>(
        `${consumerFinanceRoot(botId)}/transfers/${id}`,
        payload,
        consumerRequest(),
      )
    ).data,
  deleteTransfer: async (botId: string, id: string) =>
    (
      await consumerFinanceHttp.delete<ConsumerFinanceTransfer>(
        `${consumerFinanceRoot(botId)}/transfers/${id}`,
        consumerRequest(),
      )
    ).data,
};
