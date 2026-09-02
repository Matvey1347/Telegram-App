import type { TelegramManagedPost } from "@/lib/api";

export function telegramSyncedPostGroup(
  channelId: string,
  title: string,
): NonNullable<TelegramManagedPost["group"]> {
  return {
    id: `telegram-synced:${channelId}`,
    workspaceId: "",
    telegramChannelId: channelId,
    title,
    icon: null,
    iconPresentation: null,
    isSystem: true,
    systemKey: "TELEGRAM_SYNCED_READ_ONLY",
    statusNumberingEnabled: false,
    sidebarPosition: null,
  };
}
