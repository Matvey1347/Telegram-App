import type { AxiosInstance } from "axios";

export function createTelegramInviteLinkMaintenanceApi(api: AxiosInstance) {
  return {
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
