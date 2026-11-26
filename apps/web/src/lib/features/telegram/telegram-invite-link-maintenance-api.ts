import type { AxiosInstance, AxiosRequestConfig } from "axios";

import type { TelegramInviteLinkAccount } from "@telegram-system/shared";
import type { TelegramInviteLink } from "@/lib/api-types";

// Keep the slow MTProto invite creation mutation visible to the user.
const createInviteLinkFeedbackConfig = {
  feedback: {
    title: "Creating invite link",
    loadingMessage: "Creating the invite link in Telegram…",
    successMessage: "Invite link created.",
    errorMessage: "Telegram could not create the invite link.",
  },
} as never;
export function createTelegramInviteLinkMaintenanceApi(api: AxiosInstance, quietMutationConfig: AxiosRequestConfig) {
  return {
    inviteLinkAccounts: async (id: string, signal?: AbortSignal) =>
      (await api.get<TelegramInviteLinkAccount[]>(`/telegram-channels/${id}/invite-links/accounts`, { signal })).data,
    registerInviteLink: async (id: string, url: string) =>
      (
        await api.post<{ id: string; name: string; url: string }>(
          `/telegram-channels/${id}/invite-links/register`,
          { url },
          quietMutationConfig,
        )
      ).data,
    createInviteLink: async (
      id: string,
      payload: {
        title: string;
        mtprotoAccountId?: string;
        requestNeeded: boolean;
        expiresAt?: string;
        usageLimit?: number;
        monthlyFeeStars?: number;
      },
    ) =>
      (
        await api.post<TelegramInviteLink>(
          `/telegram-channels/${id}/invite-links/create`,
          payload,
          createInviteLinkFeedbackConfig,
        )
      ).data,
    refreshInactiveInviteLinks: async (id: string, mtprotoAccountId: string) =>
      (
        await api.post<{
          channelId: string;
          checkedLinks: number;
          replacedLinks: number;
          unavailableLinks: number;
          assignments: Record<string, unknown>;
          results: Array<{
            oldLinkId: string;
            newLinkId?: string;
            status: "active" | "replaced" | "unavailable";
          }>;
        }>(`/telegram-channels/${id}/invite-links/refresh-inactive`, {
          mtprotoAccountId,
        })
      ).data,
  };
}
