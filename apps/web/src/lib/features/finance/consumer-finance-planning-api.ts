import type {
  ConsumerBillingCatalog,
  ConsumerFinanceEntitlements,
  ConsumerFinanceLimit,
  ConsumerFinanceReminder,
  ConsumerFinanceReminderInput,
  ConsumerFinanceRenewalUpdate,
} from "@telegram-system/shared";
import {
  consumerFinanceHttp,
  consumerFinanceRoot,
  consumerRequest,
} from "./consumer-finance-http";

export const consumerFinancePlanningApi = {
  limits: async (botId: string) =>
    (
      await consumerFinanceHttp.get<ConsumerFinanceLimit[]>(
        `${consumerFinanceRoot(botId)}/limits`,
        consumerRequest(),
      )
    ).data,
  smartLimits: async (botId: string) =>
    (
      await consumerFinanceHttp.get<
        | { code: "PRO_REQUIRED"; capability: "SMART_LIMITS" }
        | Array<
            ConsumerFinanceLimit & {
              forecast: {
                projectedAmount?: string;
                projectedPercentage?: number;
              };
            }
          >
      >(`${consumerFinanceRoot(botId)}/smart-limits`, consumerRequest())
    ).data,
  saveLimit: async (
    botId: string,
    payload: { categoryId: string; amount: string; currency: string },
  ) =>
    (
      await consumerFinanceHttp.post<ConsumerFinanceLimit>(
        `${consumerFinanceRoot(botId)}/limits`,
        payload,
        consumerRequest(),
      )
    ).data,
  reminders: async (botId: string) =>
    (
      await consumerFinanceHttp.get<ConsumerFinanceReminder[]>(
        `${consumerFinanceRoot(botId)}/reminders`,
        consumerRequest(),
      )
    ).data,
  createReminder: async (
    botId: string,
    payload: ConsumerFinanceReminderInput,
  ) =>
    (
      await consumerFinanceHttp.post<ConsumerFinanceReminder>(
        `${consumerFinanceRoot(botId)}/reminders`,
        payload,
        consumerRequest(),
      )
    ).data,
  entitlements: async (botId: string) =>
    (
      await consumerFinanceHttp.get<ConsumerFinanceEntitlements>(
        `${consumerFinanceRoot(botId)}/entitlements`,
        consumerRequest(),
      )
    ).data,
  deleteData: async (botId: string) =>
    consumerFinanceHttp.delete(
      `${consumerFinanceRoot(botId)}/data`,
      consumerRequest({ data: { confirmation: "DELETE MY FINANCE DATA" } }),
    ),
  billing: async (botId: string) =>
    (
      await consumerFinanceHttp.get<ConsumerBillingCatalog>(
        `${consumerFinanceRoot(botId)}/billing`,
        consumerRequest(),
      )
    ).data,
  exportData: async (botId: string) =>
    (
      await consumerFinanceHttp.get(
        `${consumerFinanceRoot(botId)}/export`,
        consumerRequest(),
      )
    ).data,
  checkout: async (
    botId: string,
    provider: "STRIPE" | "TELEGRAM_STARS",
    priceId: string,
    mode?: string,
    couponCode?: string,
  ) =>
    (
      await consumerFinanceHttp.post<{ url: string }>(
        `${consumerFinanceRoot(botId)}/billing/${provider === "STRIPE" ? "stripe" : "stars"}/checkout`,
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
    (
      await consumerFinanceHttp.post<ConsumerFinanceRenewalUpdate>(
        `${consumerFinanceRoot(botId)}/billing/cancel-auto-renew`,
        {},
        consumerRequest(),
      )
    ).data,
  resumeAutoRenew: async (botId: string) =>
    (
      await consumerFinanceHttp.post<ConsumerFinanceRenewalUpdate>(
        `${consumerFinanceRoot(botId)}/billing/resume-auto-renew`,
        {},
        consumerRequest(),
      )
    ).data,
  paymentPortal: async (botId: string) =>
    (
      await consumerFinanceHttp.post<{ url: string }>(
        `${consumerFinanceRoot(botId)}/billing/payment-portal`,
        {},
        consumerRequest(),
      )
    ).data,
  exportUrl: (botId: string) => `${consumerFinanceRoot(botId)}/export`,
};
