import type { AxiosInstance } from "axios";
import type { AxiosRequestConfig } from "axios";
import type {
  CancelTelegramSystemBotPostImportResult,
  PrepareTelegramSystemBotPostImportPayload,
  TelegramSystemBotConnectionStatus,
  TelegramSystemBotLinkPreview,
  TelegramSystemBotPostImportResult,
  TelegramSystemBotPostImportStart,
  TelegramSystemBotTaskSubscriptionsResponse,
  TelegramSystemBotTaskSubscriptionView,
  UpdateTelegramSystemBotGroupSubscriptionsPayload,
  UpdateTelegramSystemBotSubscriptionPayload,
  TelegramSystemBotPostDraft,
} from "@telegram-system/shared";

const editablePostPayload = (draft: TelegramSystemBotPostDraft) => ({
  title: draft.title,
  text: draft.text,
  imageUrls: draft.imageUrls,
  ...(draft.mediaItems ? { mediaItems: draft.mediaItems } : {}),
  buttonRows: draft.buttonRows,
});

const workflowResultConfig = (): AxiosRequestConfig => ({
  params: { _: Date.now() },
  headers: { "Cache-Control": "no-cache" },
});

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
          undefined,
          silentFeedback,
        )
      ).data,
    startPostImport: async (payload: PrepareTelegramSystemBotPostImportPayload) =>
      (
        await api.post<TelegramSystemBotPostImportStart>(
          "/telegram/system-bot/post-imports",
          payload,
          silentFeedback,
        )
      ).data,
    readPostImport: async (workflowId: string) =>
      (
        await api.get<TelegramSystemBotPostImportResult>(
          `/telegram/system-bot/post-imports/${encodeURIComponent(workflowId)}`,
          workflowResultConfig(),
        )
      ).data,
    cancelPostImport: async (workflowId: string) =>
      (
        await api.delete<CancelTelegramSystemBotPostImportResult>(
          `/telegram/system-bot/post-imports/${encodeURIComponent(workflowId)}`,
          silentFeedback,
        )
      ).data,
    sendPostPreview: async (draft: TelegramSystemBotPostDraft) =>
      (
        await api.post<{ status: "SENT" }>(
          "/telegram/system-bot/post-preview",
          editablePostPayload(draft),
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
