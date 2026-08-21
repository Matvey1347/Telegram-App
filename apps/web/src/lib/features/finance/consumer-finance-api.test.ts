import type { AxiosAdapter, InternalAxiosRequestConfig } from "axios";
import { AxiosError } from "axios";
import { afterEach, describe, expect, it } from "vitest";
import { api } from "@/lib/api";
import { AUTH_TOKEN_KEY } from "@/lib/features/identity/auth";
import {
  CONSUMER_FINANCE_REQUEST_TIMEOUT_MS,
  consumerFinanceApi,
  resolveConsumerFinanceApiBase,
} from "./consumer-finance-api";

const originalAdapter = api.defaults.adapter;

afterEach(() => {
  api.defaults.adapter = originalAdapter;
  localStorage.clear();
});

describe("consumerFinanceApi", () => {
  it("omits internal auth and workspace headers", async () => {
    localStorage.setItem(AUTH_TOKEN_KEY, "internal-token");
    localStorage.setItem("selected-workspace-id", "workspace-id");
    let request: InternalAxiosRequestConfig | undefined;
    api.defaults.adapter = async (config) => {
      request = config;
      return { data: {}, status: 200, statusText: "OK", headers: {}, config };
    };

    await consumerFinanceApi.dashboard("bot-id");

    expect(request?.headers.get("Authorization")).toBeUndefined();
    expect(request?.headers.get("X-Workspace-Id")).toBeUndefined();
    expect(request?.headers.get("X-Telegram-Init-Data")).toBeUndefined();
    expect(request?.headers.get("X-Finance-Consumer-Request")).toBe("1");
    expect((request as unknown as { consumer?: boolean }).consumer).toBe(true);
    expect(request?.timeout).toBe(0);
  });

  it("uses the local Mini App gateway when opened through localhost:4100", () => {
    expect(
      resolveConsumerFinanceApiBase({
        origin: "http://localhost:4100",
        hostname: "localhost",
        port: "4100",
      } as Location),
    ).toBe("http://localhost:4100/api");
  });

  it("uses the configured local API when opened through localhost:3000", () => {
    const previous = process.env.NEXT_PUBLIC_API_URL;
    process.env.NEXT_PUBLIC_API_URL = "http://localhost:4000";
    expect(
      resolveConsumerFinanceApiBase({
        origin: "http://localhost:3000",
        hostname: "localhost",
        port: "3000",
      } as Location),
    ).toBe("http://localhost:4000/api");
    if (previous === undefined) delete process.env.NEXT_PUBLIC_API_URL;
    else process.env.NEXT_PUBLIC_API_URL = previous;
  });

  it("uses the same-origin gateway when opened through ngrok", () => {
    expect(
      resolveConsumerFinanceApiBase({
        origin: "https://finance-example.ngrok-free.app",
        hostname: "finance-example.ngrok-free.app",
        port: "",
      } as Location),
    ).toBe("https://finance-example.ngrok-free.app/api");
  });

  it("keeps the internal token after a consumer 401", async () => {
    localStorage.setItem(AUTH_TOKEN_KEY, "internal-token");
    api.defaults.adapter = ((config) =>
      Promise.reject(
        new AxiosError("Unauthorized", undefined, config, undefined, {
          status: 401,
          statusText: "Unauthorized",
          headers: {},
          config,
          data: {},
        }),
      )) as AxiosAdapter;

    await expect(consumerFinanceApi.dashboard("bot-id")).rejects.toThrow(
      "Unauthorized",
    );
    expect(localStorage.getItem(AUTH_TOKEN_KEY)).toBe("internal-token");
  });

  it("requests analytics as a single filtered consumer read", async () => {
    let request: InternalAxiosRequestConfig | undefined;
    api.defaults.adapter = async (config) => {
      request = config;
      return {
        data: {
          currency: "USD",
          period: { period: "CUSTOM", from: "2026-08-01", to: "2026-08-16" },
          summary: { income: "0", expenses: "0", netCashflow: "0" },
          expensesByCategory: [],
          timeline: [],
          legacyFallback: {
            transactionCount: 1,
            nativeAmounts: [{ currency: "UAH", amount: "1000" }],
            reason: "UNKNOWN_HISTORICAL_DEFAULT_CURRENCY",
          },
        },
        status: 200,
        statusText: "OK",
        headers: {},
        config,
      };
    };

    const result = await consumerFinanceApi.analytics("bot-id", {
      period: "CUSTOM",
      from: "2026-08-01",
      to: "2026-08-16",
    });

    expect(request?.url).toBe("/finance-bots/bot-id/analytics");
    expect(request?.params).toEqual({
      period: "CUSTOM",
      from: "2026-08-01",
      to: "2026-08-16",
    });
    expect(request?.headers.get("X-Telegram-Init-Data")).toBeUndefined();
    expect(result.legacyFallback?.nativeAmounts).toEqual([
      { currency: "UAH", amount: "1000" },
    ]);
  });

  it("loads entitlements and transaction items only through their explicit reads", async () => {
    const requests: InternalAxiosRequestConfig[] = [];
    api.defaults.adapter = async (config) => {
      requests.push(config);
      return {
        data: config.url?.endsWith("/entitlements")
          ? {
              tier: "FREE",
              capabilities: ["AI_INPUT", "RECEIPT_SCAN"],
              usage: [],
              activeUntil: null,
              cancelAtPeriodEnd: false,
            }
          : { id: "transaction-1", items: [] },
        status: 200,
        statusText: "OK",
        headers: {},
        config,
      };
    };

    await consumerFinanceApi.entitlements("bot-id");
    await consumerFinanceApi.transaction("bot-id", "transaction-1");

    expect(requests.map((request) => request.url)).toEqual([
      "/finance-bots/bot-id/entitlements",
      "/finance-bots/bot-id/transactions/transaction-1",
    ]);
  });

  it("sends Telegram initData only to the one-time authentication bootstrap", async () => {
    let request: InternalAxiosRequestConfig | undefined;
    api.defaults.adapter = async (config) => {
      request = config;
      return { data: {}, status: 200, statusText: "OK", headers: {}, config };
    };

    await consumerFinanceApi.auth("bot-id", "signed-init-data");

    expect(request?.url).toBe("/finance-bots/bot-id/auth");
    expect(request?.headers.get("X-Telegram-Init-Data")).toBe(
      "signed-init-data",
    );
    expect(request?.timeout).toBe(CONSUMER_FINANCE_REQUEST_TIMEOUT_MS);
  });

  it("logs out through the scoped Finance endpoint without exposing Telegram credentials", async () => {
    let request: InternalAxiosRequestConfig | undefined;
    api.defaults.adapter = async (config) => {
      request = config;
      return {
        data: { authenticated: false },
        status: 200,
        statusText: "OK",
        headers: {},
        config,
      };
    };

    await expect(consumerFinanceApi.logout("bot-id")).resolves.toEqual({
      authenticated: false,
    });
    expect(request?.url).toBe("/finance-bots/bot-id/auth/logout");
    expect(request?.method).toBe("post");
    expect(request?.headers.get("X-Finance-Consumer-Request")).toBe("1");
    expect(request?.headers.get("X-Telegram-Init-Data")).toBeUndefined();
  });

  it("creates a browser transfer from the cookie-backed consumer session", async () => {
    let request: InternalAxiosRequestConfig | undefined;
    api.defaults.adapter = async (config) => {
      request = config;
      return {
        data: {
          token: "one-time-token",
          expiresAt: "2026-08-20T12:00:00.000Z",
        },
        status: 200,
        statusText: "OK",
        headers: {},
        config,
      };
    };

    await expect(
      consumerFinanceApi.createBrowserTransfer("bot-id"),
    ).resolves.toEqual({
      token: "one-time-token",
      expiresAt: "2026-08-20T12:00:00.000Z",
    });
    expect(request?.url).toBe("/finance-bots/bot-id/auth/transfer");
    expect(request?.headers.get("X-Telegram-Init-Data")).toBeUndefined();
    expect(
      consumerFinanceApi.browserTransferUrl("bot-id", "one time"),
    ).toContain("token=one%20time");
  });

  it("loads the browser login widget configuration with a safe return location", async () => {
    let request: InternalAxiosRequestConfig | undefined;
    api.defaults.adapter = async (config) => {
      request = config;
      return {
        data: {
          botUsername: "finance_bot",
          callbackUrl: "https://api.example.test/callback",
        },
        status: 200,
        statusText: "OK",
        headers: {},
        config,
      };
    };

    await consumerFinanceApi.browserLoginConfig("bot-id", "/finance/bot-id");

    expect(request?.url).toBe("/finance-bots/bot-id/auth/browser-config");
    expect(request?.params).toEqual({ returnTo: "/finance/bot-id" });
  });

  it("lists and edits transfers without sending a manual rate or destination amount", async () => {
    const requests: InternalAxiosRequestConfig[] = [];
    api.defaults.adapter = async (config) => {
      requests.push(config);
      return {
        data:
          config.method === "get"
            ? { items: [], nextCursor: null }
            : { id: "tr-1" },
        status: 200,
        statusText: "OK",
        headers: {},
        config,
      };
    };
    await consumerFinanceApi.transfers("bot-id", {
      accountId: "a",
      search: "rent",
    });
    await consumerFinanceApi.updateTransfer("bot-id", "tr-1", {
      fromAccountId: "a",
      toAccountId: "b",
      amount: "25",
      occurredAt: "2026-08-21T12:00:00.000Z",
    });
    expect(requests[0].url).toBe("/finance-bots/bot-id/transfers");
    expect(requests[0].params).toEqual({ accountId: "a", search: "rent" });
    expect(JSON.parse(String(requests[1].data))).toEqual({
      fromAccountId: "a",
      toAccountId: "b",
      amount: "25",
      occurredAt: "2026-08-21T12:00:00.000Z",
    });
  });
});
