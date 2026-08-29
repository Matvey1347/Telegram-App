export type TelegramChannelsTab = "channels" | "networks" | "accounts";
export type TelegramChannelOwnershipFilter = "own" | "external";
export type TelegramChannelLifecycleFilter = "active" | "archive";
export type TelegramAccountFilter = "mtproto" | "people";

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
