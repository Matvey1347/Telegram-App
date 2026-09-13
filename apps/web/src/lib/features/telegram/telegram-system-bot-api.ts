import type { AxiosInstance } from "axios";
import type { AxiosRequestConfig } from "axios";
import type {
  TelegramSystemBotConnectionStatus,
  TelegramSystemBotLinkPreview,
  TelegramSystemBotTaskSubscriptionsResponse,
  TelegramSystemBotTaskSubscriptionView,
  UpdateTelegramSystemBotGroupSubscriptionsPayload,
  UpdateTelegramSystemBotSubscriptionPayload,
  TelegramSystemBotPostDraft,
} from "@telegram-system/shared";

export type TelegramSystemBotAdSalePostDraft = TelegramSystemBotPostDraft;

export type TelegramSystemBotMutualPromotionPostDraft =
  TelegramSystemBotAdSalePostDraft;

const editablePostPayload = (draft: TelegramSystemBotPostDraft) => ({
  title: draft.title,
  text: draft.text,
  imageUrls: draft.imageUrls,
  ...(draft.mediaItems ? { mediaItems: draft.mediaItems } : {}),
  buttonRows: draft.buttonRows,
});

const workflowResultConfig = (workflowId: string): AxiosRequestConfig => ({
  params: { workflowId, _: Date.now() },
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
        >(
          "/telegram/system-bot/ad-sale-post-import",
          workflowResultConfig(workflowId),
        )
      ).data,
    preparePromoPostImport: async () =>
      (
        await api.post<{ workflowId: string }>(
          "/telegram/system-bot/promo-post-import",
          undefined,
          silentFeedback,
        )
      ).data,
    promoPostImportResult: async (workflowId: string) =>
      (
        await api.get<
          { ready: false } | { ready: true; draft: TelegramSystemBotPostDraft }
        >(
          "/telegram/system-bot/promo-post-import",
          workflowResultConfig(workflowId),
        )
      ).data,
    prepareMutualPromotionPostImport: async (folderId: string) =>
      (
        await api.post<{ workflowId: string }>(
          "/telegram/system-bot/mutual-promotion-post-import",
          { folderId },
          silentFeedback,
        )
      ).data,
    mutualPromotionPostImportResult: async (workflowId: string) =>
      (
        await api.get<
          | { ready: false }
          | {
              ready: true;
              drafts: TelegramSystemBotMutualPromotionPostDraft[];
            }
        >(
          "/telegram/system-bot/mutual-promotion-post-import",
          workflowResultConfig(workflowId),
        )
      ).data,
    sendAdSalePostPreview: async (draft: TelegramSystemBotAdSalePostDraft) =>
      (
        await api.post<{ status: "SENT" }>(
          "/telegram/system-bot/ad-sale-post-preview",
          editablePostPayload(draft),
          silentFeedback,
        )
      ).data,
    sendPromoPostPreview: async (draft: TelegramSystemBotPostDraft) =>
      (
        await api.post<{ status: "SENT" }>(
          "/telegram/system-bot/promo-post-preview",
          editablePostPayload(draft),
          silentFeedback,
        )
      ).data,
    sendPostPreview: async (draft: TelegramSystemBotPostDraft) =>
      (
        await api.post<{ status: "SENT" }>(
          "/telegram/system-bot/promo-post-preview",
          editablePostPayload(draft),
          silentFeedback,
        )
      ).data,
    sendMutualPromotionPostPreview: async (
      draft: TelegramSystemBotMutualPromotionPostDraft,
    ) =>
      (
        await api.post<{ status: "SENT" }>(
          "/telegram/system-bot/mutual-promotion-post-preview",
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
