import { resolveFinanceBrowserApiBase } from "@finance-web/lib/http/api-base";
import { publicFinanceWebEnvironment } from "@finance-web/config/public-env";
import type {
  FinanceStandaloneBillingCatalog,
  FinanceStandaloneCheckoutResponse,
  FinanceStandaloneOfferCode,
} from "@telegram-system/shared";

export type FinanceBillingOfferCode = FinanceStandaloneOfferCode;
export type FinanceBillingState = FinanceStandaloneBillingCatalog;

export class FinanceBillingHttpError extends Error {
  constructor(readonly status: number) {
    super(status === 401 || status === 403
      ? "Please sign in to Finance to manage billing."
      : "Billing is unavailable. Please try again.");
  }
}

const root = (botId: string) => {
  const base = resolveFinanceBrowserApiBase(publicFinanceWebEnvironment.apiUrl);
  return `${base}/finance/${encodeURIComponent(botId)}/billing`;
};

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...init,
    credentials: "include",
    headers: { "Content-Type": "application/json", ...init?.headers },
  });
  if (!response.ok) {
    throw new FinanceBillingHttpError(response.status);
  }
  return response.json() as Promise<T>;
}

export const financeBillingApi = {
  establishTelegramSession: (botId: string, initData: string) => {
    const base = resolveFinanceBrowserApiBase(publicFinanceWebEnvironment.apiUrl);
    return request<{ authenticated: boolean }>(`${base}/finance/session/telegram-browser`, {
      method: "POST",
      body: JSON.stringify({ financeBotId: botId, initData }),
    });
  },
  get: (botId: string) => request<FinanceBillingState>(root(botId)),
  checkout: (botId: string, offerCode: FinanceBillingOfferCode) =>
    request<FinanceStandaloneCheckoutResponse>(`${root(botId)}/checkout`, {
      method: "POST",
      body: JSON.stringify({ offerCode }),
    }),
  portal: (botId: string) =>
    request<{ url: string }>(`${root(botId)}/portal`, { method: "POST" }),
  cancel: (botId: string) =>
    request<FinanceBillingState>(`${root(botId)}/cancel`, { method: "POST" }),
  resume: (botId: string) =>
    request<FinanceBillingState>(`${root(botId)}/resume`, { method: "POST" }),
};
