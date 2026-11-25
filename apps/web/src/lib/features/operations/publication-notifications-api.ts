import type {
  PublicationNotificationPreview,
  PublicationNotificationSettings,
  PublicationNotificationSettingsView,
} from "@telegram-system/shared";
import { api } from "@/lib/api";

const path = "/telegram/publication-notifications";

export const publicationNotificationsApi = {
  settings: async (signal?: AbortSignal) =>
    (await api.get<PublicationNotificationSettingsView>(path, { signal })).data,
  save: async (settings: PublicationNotificationSettings) =>
    (await api.put<PublicationNotificationSettingsView>(path, settings)).data,
  preview: async (channelId: string, signal?: AbortSignal) =>
    (
      await api.get<PublicationNotificationPreview>(
        `${path}/preview${channelId ? `/${encodeURIComponent(channelId)}` : ""}`,
        { signal },
      )
    ).data,
};
