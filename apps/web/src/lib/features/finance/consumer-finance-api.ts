import type {
  ConsumerBillingCatalog,
  ConsumerFinanceAccount,
  ConsumerFinanceArchiveResult,
  ConsumerFinanceAnalytics,
  ConsumerFinanceAnalyticsQuery,
  ConsumerFinanceAccountInput,
  ConsumerFinanceAccountUpdate,
  ConsumerFinanceCategory,
  ConsumerFinanceCategoryInput,
  ConsumerFinanceDashboard,
  ConsumerFinanceDeleteResult,
  ConsumerFinanceGoal,
  ConsumerFinanceGoalInput,
  ConsumerFinanceHistoryPage,
  ConsumerFinanceHistoryQuery,
  ConsumerFinanceLimit,
  ConsumerFinanceReminder,
  ConsumerFinanceReminderInput,
  ConsumerFinanceSettingsInput,
  ConsumerFinanceTransaction,
  ConsumerFinanceTransactionInput,
  ConsumerFinanceTransfer,
  ConsumerFinanceTransferInput,
  ConsumerFinanceUndoResult,
} from "@telegram-system/shared";
import type { AxiosRequestConfig, AxiosResponse } from "axios";
import { api as internalApi, type ConsumerApiRequestConfig } from "../../api";

const consumerRequest = (): ConsumerApiRequestConfig => ({ consumer: true });
const telegramBootstrapRequest = (initData: string): ConsumerApiRequestConfig => ({
  consumer: true,
  headers: { "X-Telegram-Init-Data": initData },
});
const root = (botId: string) => `/finance-bots/${botId}`;
const apiBase = () => process.env.NEXT_PUBLIC_API_URL || "/api";

/** Keeps this domain on the shared client while marking every request as consumer-scoped. */
const api = {
  get<T>(url: string, config: AxiosRequestConfig): Promise<AxiosResponse<T>> {
    return internalApi.get<T>(url, { ...config, consumer: true } as ConsumerApiRequestConfig);
  },
  post<T>(url: string, data: unknown, config: AxiosRequestConfig): Promise<AxiosResponse<T>> {
    return internalApi.post<T>(url, data, { ...config, consumer: true } as ConsumerApiRequestConfig);
  },
  patch<T>(url: string, data: unknown, config: AxiosRequestConfig): Promise<AxiosResponse<T>> {
    return internalApi.patch<T>(url, data, { ...config, consumer: true } as ConsumerApiRequestConfig);
  },
  delete<T = unknown>(url: string, config: AxiosRequestConfig): Promise<AxiosResponse<T>> {
    return internalApi.delete<T>(url, { ...config, consumer: true } as ConsumerApiRequestConfig);
  },
};

export const consumerFinanceApi = {
  auth: async (botId: string, initData: string) =>
    (await api.post(`${root(botId)}/auth`, {}, telegramBootstrapRequest(initData)))
      .data,
  session: async (botId: string) =>
    (await api.get(`${root(botId)}/auth/session`, consumerRequest())).data,
  browserLoginConfig: async (botId: string, returnTo: string) =>
    (
      await api.get<{ botUsername: string; callbackUrl: string }>(
        `${root(botId)}/auth/browser-config`,
        { ...consumerRequest(), params: { returnTo } },
      )
    ).data,
  createBrowserTransfer: async (botId: string) =>
    (await api.post<{ token: string; expiresAt: string }>(`${root(botId)}/auth/transfer`, {}, consumerRequest())).data,
  browserTransferUrl: (botId: string, token: string) =>
    `${apiBase()}${root(botId)}/auth/transfer?token=${encodeURIComponent(token)}`,
  dashboard: async (botId: string) =>
    (
      await api.get<ConsumerFinanceDashboard>(`${root(botId)}/dashboard`, consumerRequest())
    ).data,
  analytics: async (
    botId: string,
    query: ConsumerFinanceAnalyticsQuery,
  ) =>
    (
      await api.get<ConsumerFinanceAnalytics>(`${root(botId)}/analytics`, {
        params: query,
      })
    ).data,
  accounts: async (botId: string) =>
    (
      await api.get<ConsumerFinanceAccount[]>(`${root(botId)}/accounts`, {
      })
    ).data,
  createAccount: async (
    botId: string,
    payload: ConsumerFinanceAccountInput,
  ) =>
    (
      await api.post<ConsumerFinanceAccount>(
        `${root(botId)}/accounts`,
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
      await api.patch<ConsumerFinanceAccount>(
        `${root(botId)}/accounts/${id}`,
        payload,
        consumerRequest(),
      )
    ).data,
  archiveAccount: async (botId: string, id: string) =>
    (
      await api.delete<ConsumerFinanceArchiveResult>(
        `${root(botId)}/accounts/${id}`,
        consumerRequest(),
      )
    ).data,
  categories: async (botId: string) =>
    (
      await api.get<ConsumerFinanceCategory[]>(`${root(botId)}/categories`, {
      })
    ).data,
  createCategory: async (
    botId: string,
    payload: ConsumerFinanceCategoryInput,
  ) =>
    (
      await api.post<ConsumerFinanceCategory>(
        `${root(botId)}/categories`,
        payload,
        consumerRequest(),
      )
    ).data,
  archiveCategory: async (botId: string, id: string) =>
    (
      await api.delete<ConsumerFinanceArchiveResult>(
        `${root(botId)}/categories/${id}`,
        consumerRequest(),
      )
    ).data,
  transactions: async (
    botId: string,
    query: ConsumerFinanceHistoryQuery,
  ) =>
    (
      await api.get<ConsumerFinanceHistoryPage>(`${root(botId)}/transactions`, {
        params: query,
      })
    ).data,
  createTransaction: async (
    botId: string,
    payload: ConsumerFinanceTransactionInput,
  ) =>
    (
      await api.post<ConsumerFinanceTransaction>(
        `${root(botId)}/transactions`,
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
      await api.patch<ConsumerFinanceTransaction>(
        `${root(botId)}/transactions/${id}`,
        payload,
        consumerRequest(),
      )
    ).data,
  deleteTransaction: async (botId: string, id: string) =>
    (
      await api.delete<ConsumerFinanceDeleteResult>(
        `${root(botId)}/transactions/${id}`,
        consumerRequest(),
      )
    ).data,
  undoTransaction: async (botId: string, id: string) =>
    (
      await api.post<ConsumerFinanceUndoResult>(
        `${root(botId)}/transactions/${id}/undo`,
        {},
        consumerRequest(),
      )
    ).data,
  createTransfer: async (
    botId: string,
    payload: ConsumerFinanceTransferInput,
  ) =>
    (
      await api.post<ConsumerFinanceTransfer>(
        `${root(botId)}/transfers`,
        payload,
        consumerRequest(),
      )
    ).data,
  limits: async (botId: string) =>
    (
      await api.get<ConsumerFinanceLimit[]>(`${root(botId)}/limits`, {
      })
    ).data,
  smartLimits: async (botId: string) =>
    (await api.get<{ code: 'PRO_REQUIRED'; capability: 'SMART_LIMITS' } | Array<ConsumerFinanceLimit & { forecast: { projectedAmount?: string; projectedPercentage?: number } }>>(`${root(botId)}/smart-limits`, consumerRequest())).data,
  saveLimit: async (
    botId: string,
    payload: { categoryId: string; amount: string; currency: string },
  ) =>
    (
      await api.post<ConsumerFinanceLimit>(`${root(botId)}/limits`, payload, {
      })
    ).data,
  goal: async (botId: string) =>
    (
      await api.get<ConsumerFinanceGoal | null>(`${root(botId)}/goal`, {
      })
    ).data,
  saveGoal: async (
    botId: string,
    payload: ConsumerFinanceGoalInput,
  ) =>
    (
      await api.post<ConsumerFinanceGoal>(`${root(botId)}/goal`, payload, {
      })
    ).data,
  deleteGoal: async (botId: string, id: string) =>
    api.delete(`${root(botId)}/goal/${id}`, consumerRequest()),
  reminders: async (botId: string) =>
    (
      await api.get<ConsumerFinanceReminder[]>(`${root(botId)}/reminders`, {
      })
    ).data,
  createReminder: async (
    botId: string,
    payload: ConsumerFinanceReminderInput,
  ) =>
    (
      await api.post<ConsumerFinanceReminder>(
        `${root(botId)}/reminders`,
        payload,
        consumerRequest(),
      )
    ).data,
  updateSettings: async (
    botId: string,
    payload: ConsumerFinanceSettingsInput,
  ) =>
    (
      await api.patch(`${root(botId)}/settings`, payload, consumerRequest())
    ).data,
  deleteData: async (botId: string) =>
    api.delete(`${root(botId)}/data`, {
      ...consumerRequest(),
      data: { confirmation: "DELETE MY FINANCE DATA" },
    }),
  billing: async (botId: string) =>
    (
      await api.get<ConsumerBillingCatalog>(`${root(botId)}/billing`, {
      })
    ).data,
  exportData: async (botId: string) =>
    (await api.get(`${root(botId)}/export`, consumerRequest()))
      .data,
  checkout: async (
    botId: string,
    provider: "STRIPE" | "TELEGRAM_STARS",
    priceId: string,
    mode?: string,
    couponCode?: string,
  ) =>
    (
      await api.post<{ url: string }>(
        `${root(botId)}/billing/${provider === "STRIPE" ? "stripe" : "stars"}/checkout`,
        {
          priceId,
          mode,
          couponCode:
            provider === "STRIPE" ? couponCode || undefined : undefined,
        },
        consumerRequest(),
      )
    ).data,
  exportUrl: (botId: string) => `${root(botId)}/export`,
};
