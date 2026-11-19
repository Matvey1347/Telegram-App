import { api, type TelegramChannel } from "@/lib/api";

/** Explicit commands only: ordinary channel reads never generate emoji. */
export const channelAvatarEmojiApi = {
  refresh: async (channelId: string) =>
    (await api.post<TelegramChannel>(`/telegram-channels/${channelId}/avatar-emoji/refresh`)).data,
  restore: async (channelId: string) =>
    (await api.post<TelegramChannel>(`/telegram-channels/${channelId}/avatar-emoji/restore`)).data,
};
