import type { AxiosInstance } from "axios";
import type {
  TelegramSystemBotConnectionStatus,
  TelegramSystemBotLinkPreview,
  TelegramSystemBotTaskSubscriptionsResponse,
  TelegramSystemBotTaskSubscriptionView,
  UpdateTelegramSystemBotGroupSubscriptionsPayload,
  UpdateTelegramSystemBotSubscriptionPayload,
} from "@telegram-system/shared";

export function createTelegramSystemBotApi(api: AxiosInstance) {
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
