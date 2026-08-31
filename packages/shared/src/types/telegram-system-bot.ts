import type { ResolvedEmoji } from "./resolved-emoji";

export type TelegramSystemBotConnectionStatus = {
  connected: boolean;
  username: string | null;
  firstName: string | null;
  connectedAt: string | null;
  currentWorkspaceId: string | null;
  currentWorkspaceName: string | null;
  botUsername: string | null;
  /** Null when the API process is intentionally not running a System Bot runtime. */
  runtimeEnvironment?: "LOCAL" | "PRODUCTION" | null;
};

export type TelegramChannelSystemBotConnectionStatus =
  | "CONNECTED"
  | "NOT_CONNECTED"
  | "MISSING_POST_PERMISSION"
  | "UNVERIFIED"
  | "NOT_CONFIGURED";

/** Last known publishing access for the workspace System Bot in one channel. */
export type TelegramChannelSystemBotConnection = {
  connected: boolean;
  status: TelegramChannelSystemBotConnectionStatus;
  botUsername: string | null;
  lastCheckedAt: string | null;
  requiredPermission: "POST_MESSAGES";
};

export type TelegramSystemBotLinkPreview = {
  expiresAt: string;
  telegramUsername: string | null;
  telegramFirstName: string | null;
};

export type TelegramSystemBotWorkspace = {
  id: string;
  name: string;
  role: "owner" | "admin" | "MEDIA_BUYER" | "member";
  selected: boolean;
  avatarPresentation?: ResolvedEmoji | null;
};

export type UpdateTelegramSystemBotSubscriptionPayload = {
  workspaceId: string;
  taskKey: string;
  enabled: boolean;
  notifyOnSuccess: boolean;
  notifyOnFailure: boolean;
};

export type UpdateTelegramSystemBotGroupSubscriptionsPayload = {
  workspaceId: string;
  groupKey: "TELEGRAM";
  notifyOnSuccess: boolean;
  notifyOnFailure: boolean;
};

export type TelegramSystemBotTaskSubscriptionView =
  UpdateTelegramSystemBotSubscriptionPayload;

export type TelegramSystemBotTaskSubscriptionsResponse = {
  connected: boolean;
  botUsername: string | null;
  workspaceId: string;
  items: TelegramSystemBotTaskSubscriptionView[];
};
