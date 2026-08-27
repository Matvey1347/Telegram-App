import type { AxiosInstance } from "axios";
import type { AxiosRequestConfig } from "axios";
import type {
  TelegramSystemBotConnectionStatus,
  TelegramSystemBotLinkPreview,
  TelegramSystemBotTaskSubscriptionsResponse,
  TelegramSystemBotTaskSubscriptionView,
  UpdateTelegramSystemBotGroupSubscriptionsPayload,
  UpdateTelegramSystemBotSubscriptionPayload,
} from "@telegram-system/shared";

export type TelegramSystemBotAdSalePostDraft = {
  title: string;
  text: string;
  imageUrls: string[];
  buttonRows: Array<
    Array<{
      text: string;
      url: string;
      style: "default" | "primary" | "success" | "danger";
    }>
  >;
};

export function createTelegramSystemBotApi(api: AxiosInstance) {
  const silentFeedback = {
    feedback: { mode: "silent" },
  } as AxiosRequestConfig;
  return {
    connection: async () =>
      (
        await api.get<TelegramSystemBotConnectionStatus>(
          "/telegram/system-bot/connection",
        )
      ).data,
    previewLink: async (token: string) =>
      (
        await api.get<TelegramSystemBotLinkPreview>(
          "/telegram/system-bot/connect/preview",
          { params: { token } },
        )
      ).data,
    connect: async (token: string) =>
      (
        await api.post<TelegramSystemBotConnectionStatus>(
          "/telegram/system-bot/connect",
          { token },
        )
      ).data,
    disconnect: async () =>
      (
        await api.delete<{ success: boolean }>(
          "/telegram/system-bot/connection",
        )
      ).data,
    selectCurrentWorkspace: async () =>
      (
        await api.post<{ success: boolean }>(
          "/telegram/system-bot/connection/workspace",
        )
      ).data,
    prepareAdSalePostImport: async () =>
      (
        await api.post<{ workflowId: string }>(
          "/telegram/system-bot/ad-sale-post-import",
          undefined,
          silentFeedback,
        )
      ).data,
    adSalePostImportResult: async (workflowId: string) =>
      (
        await api.get<
          | { ready: false }
          | { ready: true; draft: TelegramSystemBotAdSalePostDraft }
        >("/telegram/system-bot/ad-sale-post-import", {
          params: { workflowId },
        })
      ).data,
    sendAdSalePostPreview: async (draft: TelegramSystemBotAdSalePostDraft) =>
      (
        await api.post<{ status: "SENT" }>(
          "/telegram/system-bot/ad-sale-post-preview",
          draft,
          silentFeedback,
        )
      ).data,
    subscriptions: async (workspaceId: string) =>
      (
        await api.get<TelegramSystemBotTaskSubscriptionsResponse>(
          "/telegram/system-bot/subscriptions",
          { params: { workspaceId } },
        )
      ).data,
    updateSubscription: async (
      payload: UpdateTelegramSystemBotSubscriptionPayload,
    ) =>
      (
        await api.post<TelegramSystemBotTaskSubscriptionView>(
          "/telegram/system-bot/subscriptions",
          payload,
        )
      ).data,
    updateGroupSubscriptions: async (
      payload: UpdateTelegramSystemBotGroupSubscriptionsPayload,
    ) =>
      (
        await api.post<TelegramSystemBotTaskSubscriptionsResponse>(
          "/telegram/system-bot/subscriptions/group",
          payload,
        )
      ).data,
  };
}
