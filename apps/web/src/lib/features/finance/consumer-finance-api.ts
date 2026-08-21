import type {
  ConsumerBillingCatalog,
  ConsumerFinanceAccount,
  ConsumerFinanceAnalytics,
  ConsumerFinanceAnalyticsQuery,
  ConsumerFinanceAccountInput,
  ConsumerFinanceAccountUpdate,
  ConsumerFinanceCategory,
  ConsumerFinanceCategoryInput,
  ConsumerFinanceCategoryUpdate,
  ConsumerFinanceDashboard,
  ConsumerFinanceDeleteResult,
  ConsumerFinanceEntitlements,
  ConsumerFinanceGoal,
  ConsumerFinanceGoalInput,
  ConsumerFinanceHistoryPage,
  ConsumerFinanceHistoryQuery,
  ConsumerFinanceLimit,
  ConsumerFinanceReminder,
  ConsumerFinanceReminderInput,
  ConsumerFinanceSessionState,
  ConsumerFinanceSettingsInput,
  ConsumerFinanceTransaction,
  ConsumerFinanceTransactionDetail,
  ConsumerFinanceTransactionInput,
  ConsumerFinanceTransfer,
  ConsumerFinanceTransferInput,
  ConsumerFinanceTransferPage,
  ConsumerFinanceTransferQuery,
  ConsumerFinanceUndoResult,
  ConsumerFinanceUltimateAnalytics,
  ConsumerFinanceUltimateAnalyticsPeriod,
  ConsumerFinanceUltimateAnswer,
  ConsumerFinanceUltimateOverview,
  ConsumerFinanceUltimateQuestionInput,
} from "@telegram-system/shared";
import type { AxiosRequestConfig, AxiosResponse } from "axios";
import { api as internalApi, type ConsumerApiRequestConfig } from "../../api";

const consumerRequest = (): ConsumerApiRequestConfig => ({ consumer: true });
export const CONSUMER_FINANCE_REQUEST_TIMEOUT_MS = 15_000;
const startupRequest = (): ConsumerApiRequestConfig => ({
  ...consumerRequest(),
  timeout: CONSUMER_FINANCE_REQUEST_TIMEOUT_MS,
});
const telegramBootstrapRequest = (
  initData: string,
): ConsumerApiRequestConfig => ({
  ...startupRequest(),
  headers: { "X-Telegram-Init-Data": initData },
});
const root = (botId: string) => `/finance-bots/${botId}`;
export function resolveConsumerFinanceApiBase(
  location = typeof window === "undefined" ? undefined : window.location,
) {
  const currentOriginIsBotGateway =
    location &&
    (location.port === "4100" ||
      /\.ngrok(?:-free)?\.app$/u.test(location.hostname));
  if (currentOriginIsBotGateway) {
    // `dev:bots` exposes both Next and Nest through one ngrok gateway. The
    // browser must use that gateway, not NEXT_PUBLIC_API_URL from .env. This
    // also makes http://localhost:4100 work as the local Mini App preview.
    return `${location.origin}/api`;
  }
  const configured = process.env.NEXT_PUBLIC_API_URL?.trim();
  if (!configured) return "/api";
  return configured.endsWith("/api")
    ? configured
    : `${configured.replace(/\/+$/, "")}/api`;
}

/** Keeps this domain on the shared client while marking every request as consumer-scoped. */
const api = {
  get<T>(url: string, config: AxiosRequestConfig): Promise<AxiosResponse<T>> {
    return internalApi.get<T>(url, {
      ...config,
      baseURL: resolveConsumerFinanceApiBase(),
      consumer: true,
      headers: {
        ...config.headers,
        "X-Finance-Consumer-Request": "1",
      },
    } as ConsumerApiRequestConfig);
  },
  post<T>(
    url: string,
    data: unknown,
    config: AxiosRequestConfig,
  ): Promise<AxiosResponse<T>> {
    return internalApi.post<T>(url, data, {
      ...config,
      baseURL: resolveConsumerFinanceApiBase(),
      consumer: true,
      headers: {
        ...config.headers,
        "X-Finance-Consumer-Request": "1",
      },
    } as ConsumerApiRequestConfig);
  },
  patch<T>(
    url: string,
    data: unknown,
    config: AxiosRequestConfig,
  ): Promise<AxiosResponse<T>> {
    return internalApi.patch<T>(url, data, {
      ...config,
      baseURL: resolveConsumerFinanceApiBase(),
      consumer: true,
      headers: {
        ...config.headers,
        "X-Finance-Consumer-Request": "1",
      },
    } as ConsumerApiRequestConfig);
  },
  delete<T = unknown>(
    url: string,
    config: AxiosRequestConfig,
  ): Promise<AxiosResponse<T>> {
    return internalApi.delete<T>(url, {
      ...config,
      baseURL: resolveConsumerFinanceApiBase(),
      consumer: true,
      headers: {
        ...config.headers,
        "X-Finance-Consumer-Request": "1",
      },
    } as ConsumerApiRequestConfig);
  },
};

export const consumerFinanceApi = {
  auth: async (
    botId: string,
    initData: string,
  ): Promise<ConsumerFinanceSessionState> =>
    (
      await api.post<ConsumerFinanceSessionState>(
        `${root(botId)}/auth`,
        {},
        telegramBootstrapRequest(initData),
      )
    ).data,
  session: async (botId: string): Promise<ConsumerFinanceSessionState> =>
    (
      await api.get<ConsumerFinanceSessionState>(
        `${root(botId)}/auth/session`,
        startupRequest(),
      )
    ).data,
  logout: async (botId: string): Promise<ConsumerFinanceSessionState> =>
    (
      await api.post<ConsumerFinanceSessionState>(
        `${root(botId)}/auth/logout`,
        {},
        startupRequest(),
      )
    ).data,
  browserLoginConfig: async (botId: string, returnTo: string) =>
    (
      await api.get<{ botUsername: string; callbackUrl: string }>(
        `${root(botId)}/auth/browser-config`,
        { ...startupRequest(), params: { returnTo } },
      )
    ).data,
  createBrowserTransfer: async (botId: string) =>
    (
      await api.post<{ token: string; expiresAt: string }>(
        `${root(botId)}/auth/transfer`,
        {},
        consumerRequest(),
      )
    ).data,
  browserTransferUrl: (botId: string, token: string) =>
    `${resolveConsumerFinanceApiBase()}${root(botId)}/auth/transfer?token=${encodeURIComponent(token)}`,
  dashboard: async (botId: string) =>
    (
      await api.get<ConsumerFinanceDashboard>(
        `${root(botId)}/dashboard`,
        consumerRequest(),
      )
    ).data,
  analytics: async (botId: string, query: ConsumerFinanceAnalyticsQuery) =>
    (
      await api.get<ConsumerFinanceAnalytics>(`${root(botId)}/analytics`, {
        params: query,
      })
    ).data,
  ultimateOverview: async (botId: string) =>
    (await api.get<ConsumerFinanceUltimateOverview>(`${root(botId)}/ultimate/overview`, consumerRequest())).data,
  ultimateAnalytics: async (
    botId: string,
    period: ConsumerFinanceUltimateAnalyticsPeriod,
  ) =>
    (await api.get<ConsumerFinanceUltimateAnalytics>(`${root(botId)}/ultimate/analytics`, {
      ...consumerRequest(),
      params: { period },
    })).data,
  askFinance: async (botId: string, payload: ConsumerFinanceUltimateQuestionInput) =>
    (await api.post<ConsumerFinanceUltimateAnswer>(`${root(botId)}/ultimate/ask`, payload, consumerRequest())).data,
  accounts: async (botId: string) =>
    (await api.get<ConsumerFinanceAccount[]>(`${root(botId)}/accounts`, {}))
      .data,
  createAccount: async (botId: string, payload: ConsumerFinanceAccountInput) =>
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
      await api.delete<ConsumerFinanceAccount>(
        `${root(botId)}/accounts/${id}`,
        consumerRequest(),
      )
    ).data,
  categories: async (botId: string) =>
    (await api.get<ConsumerFinanceCategory[]>(`${root(botId)}/categories`, {}))
      .data,
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
  updateCategory: async (
    botId: string,
    id: string,
    payload: ConsumerFinanceCategoryUpdate,
  ) =>
    (
      await api.patch<ConsumerFinanceCategory>(
        `${root(botId)}/categories/${id}`,
        payload,
        consumerRequest(),
      )
    ).data,
  archiveCategory: async (botId: string, id: string) =>
    (
      await api.delete<ConsumerFinanceCategory>(
        `${root(botId)}/categories/${id}`,
        consumerRequest(),
      )
    ).data,
  transactions: async (botId: string, query: ConsumerFinanceHistoryQuery) =>
    (
      await api.get<ConsumerFinanceHistoryPage>(`${root(botId)}/transactions`, {
        params: query,
      })
    ).data,
  transaction: async (botId: string, id: string) =>
    (
      await api.get<ConsumerFinanceTransactionDetail>(
        `${root(botId)}/transactions/${id}`,
        consumerRequest(),
      )
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
  transfers: async (botId: string, query: ConsumerFinanceTransferQuery) =>
    (
      await api.get<ConsumerFinanceTransferPage>(`${root(botId)}/transfers`, {
        ...consumerRequest(),
        params: query,
      })
    ).data,
  updateTransfer: async (
    botId: string,
    id: string,
    payload: ConsumerFinanceTransferInput,
  ) =>
    (
      await api.patch<ConsumerFinanceTransfer>(
        `${root(botId)}/transfers/${id}`,
        payload,
        consumerRequest(),
      )
    ).data,
  deleteTransfer: async (botId: string, id: string) =>
    (
      await api.delete<ConsumerFinanceTransfer>(
        `${root(botId)}/transfers/${id}`,
        consumerRequest(),
      )
    ).data,
  limits: async (botId: string) =>
    (await api.get<ConsumerFinanceLimit[]>(`${root(botId)}/limits`, {})).data,
  smartLimits: async (botId: string) =>
    (
      await api.get<
        | { code: "PRO_REQUIRED"; capability: "SMART_LIMITS" }
        | Array<
            ConsumerFinanceLimit & {
              forecast: {
                projectedAmount?: string;
                projectedPercentage?: number;
              };
            }
          >
      >(`${root(botId)}/smart-limits`, consumerRequest())
    ).data,
  saveLimit: async (
    botId: string,
    payload: { categoryId: string; amount: string; currency: string },
  ) =>
    (await api.post<ConsumerFinanceLimit>(`${root(botId)}/limits`, payload, {}))
      .data,
  goal: async (botId: string) =>
    (await api.get<ConsumerFinanceGoal | null>(`${root(botId)}/goal`, {})).data,
  saveGoal: async (botId: string, payload: ConsumerFinanceGoalInput) =>
    (await api.post<ConsumerFinanceGoal>(`${root(botId)}/goal`, payload, {}))
      .data,
  deleteGoal: async (botId: string, id: string) =>
    api.delete(`${root(botId)}/goal/${id}`, consumerRequest()),
  reminders: async (botId: string) =>
    (await api.get<ConsumerFinanceReminder[]>(`${root(botId)}/reminders`, {}))
      .data,
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
    (await api.patch(`${root(botId)}/settings`, payload, consumerRequest()))
      .data,
  entitlements: async (botId: string) =>
    (
      await api.get<ConsumerFinanceEntitlements>(
        `${root(botId)}/entitlements`,
        consumerRequest(),
      )
    ).data,
  deleteData: async (botId: string) =>
    api.delete(`${root(botId)}/data`, {
      ...consumerRequest(),
      data: { confirmation: "DELETE MY FINANCE DATA" },
    }),
  billing: async (botId: string) =>
    (await api.get<ConsumerBillingCatalog>(`${root(botId)}/billing`, {})).data,
  exportData: async (botId: string) =>
    (await api.get(`${root(botId)}/export`, consumerRequest())).data,
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
  cancelAutoRenew: async (botId: string) =>
    (await api.post(`${root(botId)}/billing/cancel-auto-renew`, {}, consumerRequest())).data,
  resumeAutoRenew: async (botId: string) =>
    (await api.post(`${root(botId)}/billing/resume-auto-renew`, {}, consumerRequest())).data,
  paymentPortal: async (botId: string) =>
    (await api.post<{ url: string }>(`${root(botId)}/billing/payment-portal`, {}, consumerRequest())).data,
  exportUrl: (botId: string) => `${root(botId)}/export`,
};
