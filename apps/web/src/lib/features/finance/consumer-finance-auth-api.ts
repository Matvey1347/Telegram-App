import type { ConsumerFinanceSessionState } from "@telegram-system/shared";
import {
  consumerFinanceHttp,
  consumerFinanceRoot,
  consumerRequest,
  resolveConsumerFinanceApiBase,
  startupRequest,
  telegramBootstrapRequest,
} from "./consumer-finance-http";

export type ConsumerFinanceBrowserLoginChallenge = {
  token: string;
  loginUrl: string;
  expiresAt: string;
};

export type ConsumerFinanceBrowserLoginStatus =
  | { status: "pending" }
  | { status: "expired" }
  | {
      status: "authenticated";
      profile: Extract<
        ConsumerFinanceSessionState,
        { authenticated: true }
      >["profile"];
    };

export const consumerFinanceAuthApi = {
  auth: async (
    botId: string,
    initData: string,
  ): Promise<ConsumerFinanceSessionState> =>
    (
      await consumerFinanceHttp.post<ConsumerFinanceSessionState>(
        `${consumerFinanceRoot(botId)}/auth`,
        {},
        telegramBootstrapRequest(initData),
      )
    ).data,
  session: async (botId: string): Promise<ConsumerFinanceSessionState> =>
    (
      await consumerFinanceHttp.get<ConsumerFinanceSessionState>(
        `${consumerFinanceRoot(botId)}/auth/session`,
        startupRequest(),
      )
    ).data,
  logout: async (botId: string): Promise<ConsumerFinanceSessionState> =>
    (
      await consumerFinanceHttp.post<ConsumerFinanceSessionState>(
        `${consumerFinanceRoot(botId)}/auth/logout`,
        {},
        startupRequest(),
      )
    ).data,
  browserLoginConfig: async (botId: string, returnTo: string) =>
    (
      await consumerFinanceHttp.get<{
        botUsername: string;
        callbackUrl: string;
      }>(
        `${consumerFinanceRoot(botId)}/auth/browser-config`,
        startupRequest({ params: { returnTo } }),
      )
    ).data,
  createBrowserLoginChallenge: async (botId: string) =>
    (
      await consumerFinanceHttp.post<ConsumerFinanceBrowserLoginChallenge>(
        `${consumerFinanceRoot(botId)}/auth/browser-challenge`,
        {},
        startupRequest(),
      )
    ).data,
  consumeBrowserLoginChallenge: async (botId: string, token: string) =>
    (
      await consumerFinanceHttp.post<ConsumerFinanceBrowserLoginStatus>(
        `${consumerFinanceRoot(botId)}/auth/browser-challenge/consume`,
        { token },
        startupRequest(),
      )
    ).data,
  createBrowserTransfer: async (botId: string) =>
    (
      await consumerFinanceHttp.post<{ token: string; expiresAt: string }>(
        `${consumerFinanceRoot(botId)}/auth/transfer`,
        {},
        consumerRequest(),
      )
    ).data,
  browserTransferUrl: (botId: string, token: string) =>
    `${resolveConsumerFinanceApiBase()}${consumerFinanceRoot(botId)}/auth/transfer?token=${encodeURIComponent(token)}`,
};
