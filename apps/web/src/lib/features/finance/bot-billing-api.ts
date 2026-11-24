import { api } from "@/lib/api";
import type {
  BotBillingAnalyticsView,
  FinanceAiConfigView,
  BotBillingInterval,
  BotBillingOverviewView,
  BotBillingProvider,
  BotBillingProviderConfigView,
  BotBillingProviderMode,
  BotBillingSubscriberPage,
  BotBillingUserPage,
} from "@telegram-system/shared";

export type BotBillingPlanView = {
  id: string;
  name: string;
  code: string;
  description: string | null;
  isActive: boolean;
  prices: Array<{
    id: string;
    amountMinor: number;
    currency: string;
    interval: BotBillingInterval;
    intervalCount: number;
    stripeSynced?: BotBillingProviderMode[];
    version: number;
    isPublic: boolean;
  }>;
};
export type BotBillingCouponView = {
  id: string;
  code: string;
  percentOff: number | null;
  amountOffMinor: number | null;
  currency: string | null;
  planId: string | null;
  redemptionCount: number;
  isActive: boolean;
};
export type BotBillingSubscribersQuery = {
  cursor?: string;
  search?: string;
  status?: "ACTIVE" | "PAST_DUE" | "CANCELED" | "EXPIRED" | "INCOMPLETE";
  source?: "STRIPE" | "TELEGRAM_STARS" | "MANUAL" | "GIFT";
  planId?: string;
  environment?: "LOCAL" | "PRODUCTION";
};
export type BotBillingUsersQuery = { cursor?: string; search?: string; environment: "LOCAL" | "PRODUCTION" };

export type SaveProviderPayload = {
  publicKey?: string;
  secretKey?: string;
  webhookSecret?: string;
};
export type CreatePlanPayload = {
  name: string;
  code: string;
  description?: string;
};
export type CreatePricePayload = {
  amountMinor: number;
  currency: string;
  interval: "MONTH" | "YEAR";
};
export type CreateCouponPayload = {
  code: string;
  percentOff?: number;
  amountOffMinor?: number;
  currency?: string;
  startsAt?: string;
  expiresAt?: string;
  maxRedemptions?: number;
  newUsersOnly?: boolean;
  planId?: string;
};

export const botBillingApi = {
  workspaceProviders: async (): Promise<BotBillingProviderConfigView[]> => (await api.get("/billing/providers")).data,
  saveWorkspaceProvider: async (provider: BotBillingProvider, mode: BotBillingProviderMode, payload: SaveProviderPayload): Promise<BotBillingProviderConfigView> => (await api.patch(`/billing/providers/${provider}/${mode}`, payload)).data,
  removeWorkspaceProvider: async (provider: BotBillingProvider, mode: BotBillingProviderMode): Promise<BotBillingProviderConfigView> => (await api.delete(`/billing/providers/${provider}/${mode}`)).data,
  overview: async (botId: string, environment: "LOCAL" | "PRODUCTION" = "PRODUCTION"): Promise<BotBillingOverviewView> =>
    (await api.get(`/telegram-bots/${botId}/billing/overview`, { params: { environment } })).data,
  analytics: async (botId: string): Promise<BotBillingAnalyticsView> =>
    (await api.get(`/telegram-bots/${botId}/billing/overview`)).data.analytics,
  plans: async (botId: string): Promise<BotBillingPlanView[]> =>
    (await api.get(`/telegram-bots/${botId}/billing/plans`)).data,
  coupons: async (botId: string): Promise<BotBillingCouponView[]> =>
    (await api.get(`/telegram-bots/${botId}/billing/coupons`)).data,
  subscribers: async (
    botId: string,
    query: BotBillingSubscribersQuery,
  ): Promise<BotBillingSubscriberPage> =>
    (
      await api.get(`/telegram-bots/${botId}/billing/subscribers`, {
        params: query,
      })
    ).data,
  users: async (botId: string, query: BotBillingUsersQuery): Promise<BotBillingUserPage> =>
    (await api.get(`/telegram-bots/${botId}/billing/users`, { params: query })).data,
  grant: async (botId: string, payload: { telegramBotUserId: string; planId: string; source: "GIFT" | "MANUAL"; reason: string; idempotencyKey: string; expiresAt?: string }) =>
    (await api.post(`/telegram-bots/${botId}/billing/grants`, payload)).data,
  updateUserProfile: async (botId: string, userId: string, payload: { locale?: "uk" | "ru" | "en"; currency?: string; timezone?: string; resetOnboarding?: boolean }) =>
    (await api.patch(`/telegram-bots/${botId}/billing/users/${userId}/finance-profile`, payload)).data,
  providers: async (botId: string): Promise<BotBillingProviderConfigView[]> =>
    (await api.get(`/telegram-bots/${botId}/billing/providers`)).data,
  saveProvider: async (
    botId: string,
    provider: BotBillingProvider,
    mode: BotBillingProviderMode,
    payload: SaveProviderPayload,
  ): Promise<BotBillingProviderConfigView> =>
    (
      await api.patch(
        `/telegram-bots/${botId}/billing/providers/${provider}/${mode}`,
        payload,
      )
    ).data,
  useGlobalProvider: async (
    botId: string,
    provider: BotBillingProvider,
    mode: BotBillingProviderMode,
  ): Promise<BotBillingProviderConfigView> =>
    (
      await api.delete(
        `/telegram-bots/${botId}/billing/providers/${provider}/${mode}`,
      )
    ).data,
  createPlan: async (
    botId: string,
    payload: CreatePlanPayload,
  ): Promise<BotBillingPlanView> =>
    (await api.post(`/telegram-bots/${botId}/billing/plans`, payload)).data,
  addPrice: async (
    botId: string,
    planId: string,
    payload: CreatePricePayload,
  ) =>
    (
      await api.post(
        `/telegram-bots/${botId}/billing/plans/${planId}/prices`,
        payload,
      )
    ).data,
  createCoupon: async (
    botId: string,
    payload: CreateCouponPayload,
  ): Promise<BotBillingCouponView> =>
    (await api.post(`/telegram-bots/${botId}/billing/coupons`, payload)).data,
  syncFinanceCatalog: async (botId: string) =>
    (await api.post(`/telegram-bots/${botId}/finance-billing/sync`)).data,
  syncFinanceCoupon: async (botId: string, couponId: string) =>
    (await api.post(`/telegram-bots/${botId}/finance-billing/coupons/${couponId}/sync`)).data,
};


export const financeAiConfigApi = {
  get: async (botId?: string): Promise<FinanceAiConfigView> =>
    (await api.get(financeAiConfigPath(botId))).data,
  save: async (apiKey: string, botId?: string): Promise<FinanceAiConfigView> => {
    const path = financeAiConfigPath(botId);
    await api.patch(path, { apiKey });
    return (await api.post(`${path}/validate`)).data;
  },
  reset: async (botId?: string): Promise<FinanceAiConfigView> =>
    (await api.delete(financeAiConfigPath(botId))).data,
};

function financeAiConfigPath(botId?: string) {
  return botId ? `/telegram-bots/${botId}/finance/ai-config` : "/telegram-bots/finance/ai-config";
}
