import type { AxiosRequestConfig } from "axios";
import { publicFinanceWebEnvironment } from "@finance-web/config/public-env";
import {
  createHttpTransport,
  createRequestCorrelationId,
} from "@finance-web/lib/http/transport";
import { resolveFinanceBrowserApiBase } from "@finance-web/lib/http/api-base";

export function resolveConsumerFinanceApiBase(
  location = typeof window === "undefined" ? undefined : window.location,
) {
  return resolveFinanceBrowserApiBase(publicFinanceWebEnvironment.apiUrl, location);
}

export const consumerFinanceHttp = createHttpTransport({
  baseURL: resolveConsumerFinanceApiBase,
});

consumerFinanceHttp.interceptors.request.use((config) => {
  config.headers["X-Correlation-Id"] = createRequestCorrelationId();
  config.headers["X-Finance-Consumer-Request"] = "1";
  return config;
});

export const CONSUMER_FINANCE_REQUEST_TIMEOUT_MS = 15_000;

export function consumerRequest(config: AxiosRequestConfig = {}) {
  return config;
}

export function startupRequest(config: AxiosRequestConfig = {}) {
  return { ...config, timeout: CONSUMER_FINANCE_REQUEST_TIMEOUT_MS };
}

export function telegramBootstrapRequest(initData: string) {
  return startupRequest({ headers: { "X-Telegram-Init-Data": initData } });
}

export const consumerFinanceRoot = (botId: string) => `/finance-bots/${botId}`;
