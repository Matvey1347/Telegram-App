export type TelegramChannelsTab = "channels" | "networks" | "accounts";
export type TelegramChannelOwnershipFilter = "own" | "external";
export type TelegramChannelLifecycleFilter = "active" | "archive";
export type TelegramAccountFilter = "mtproto" | "people";

export const TELEGRAM_CHANNEL_TAB_OPTIONS = {
  all: ["channels", "networks", "accounts"],
  primary: ["channels", "networks", "accounts"],
} as const satisfies Record<string, readonly TelegramChannelsTab[]>;

export const TELEGRAM_CHANNEL_TAB_LABELS = {
  channels: "Channels",
  networks: "Network",
  accounts: "Accounts",
} as const satisfies Record<TelegramChannelsTab, string>;

export const parseTelegramChannelsTab = (
  value: string | null,
): TelegramChannelsTab =>
  value === "networks" || value === "accounts" ? value : "channels";

export const parseTelegramChannelOwnership = (
  value: string | null,
): TelegramChannelOwnershipFilter => (value === "external" ? value : "own");

export const parseTelegramChannelLifecycle = (
  value: string | null,
): TelegramChannelLifecycleFilter => (value === "archive" ? value : "active");

export const parseTelegramAccountFilter = (
  value: string | null,
): TelegramAccountFilter => (value === "people" ? value : "mtproto");
