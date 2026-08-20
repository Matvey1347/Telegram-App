export type TelegramBotApplicationType = "NONE" | "GREETER" | "FINANCE";

export type TelegramBotRuntimeEnvironment = "LOCAL" | "PRODUCTION";

export type TelegramBotApplicationAvailability =
  | "GLOBAL"
  | "WORKSPACE_RESTRICTED";

export type TelegramBotRuntimeStatus =
  | "DISABLED"
  | "STARTING"
  | "ACTIVE"
  | "ERROR";

export type TelegramBotWebhookStatus =
  | "NOT_CONFIGURED"
  | "CONFIGURED"
  | "ERROR";

export type TelegramBotWebhookConnectionStatus =
  | "CONNECTED"
  | "NOT_CONNECTED"
  | "UNKNOWN";

export type TelegramBotUpdateStatus =
  | "RECEIVED"
  | "PROCESSING"
  | "PROCESSED"
  | "DUPLICATE"
  | "FAILED"
  | "SKIPPED";

export type TelegramBotDeliveryStatus =
  | "PENDING"
  | "PROCESSING"
  | "SENT"
  | "RETRY"
  | "FAILED"
  | "CANCELLED";

export type TelegramBotDeliveryType = "SEND_MESSAGE";

export type TelegramBotMemberSummary = {
  id: string;
  role?: string;
  user?: {
    id: string;
    email: string;
    name: string;
  } | null;
};

export type TelegramBotApplicationOption = {
  type: TelegramBotApplicationType;
  label: string;
  description: string;
  availability: TelegramBotApplicationAvailability;
  eligible: boolean;
  unavailableReason?: string | null;
};

export type TelegramBotRuntimeSummary = {
  id: string;
  environment: TelegramBotRuntimeEnvironment;
  botTokenMasked: string;
  tokenState: "SAVED";
  botId?: string | null;
  username?: string | null;
  firstName?: string | null;
  lastErrorMessage?: string | null;
  lastCheckedAt?: string | null;
  runtimeStatus: TelegramBotRuntimeStatus;
  webhookStatus: TelegramBotWebhookStatus;
  webhookUrl?: string | null;
  webhookConnectionStatus: TelegramBotWebhookConnectionStatus;
  webhookConfiguredAt?: string | null;
  lastUpdateProcessedAt?: string | null;
  lastRuntimeError?: string | null;
  webApp: TelegramBotWebAppStatus;
  miniApp: TelegramBotMiniAppStatus;
};

/** Last known results from startup reconciliation or an explicit runtime check. */
export type TelegramBotWebAppStatus = {
  status: "UNKNOWN" | "AVAILABLE" | "NOT_CONFIGURED" | "ERROR";
  url?: string | null;
  error?: string | null;
};

/** Telegram menu-button / Mini App state; intentionally distinct from Web App reachability. */
export type TelegramBotMiniAppStatus = {
  status: "UNKNOWN" | "CONFIGURED" | "NOT_CONFIGURED" | "ERROR";
  expectedUrl?: string | null;
  actualUrl?: string | null;
  error?: string | null;
};

export type TelegramBotChannelAccessSummary = {
  totalChannels: number;
  canPost: number;
  canManageInviteLinks: number;
  canViewStats: number;
  lastCheckedAt?: string | null;
};

export type TelegramBotFinanceApplicationSummary = {
  applicationType: "FINANCE";
  finance: {
    registeredUsers: number;
    paidUsers: number;
    activeSubscriptions: number;
    failedPayments: number;
  };
};

export type TelegramBotIntegrationView = {
  id: string;
  workspaceId: string;
  label: string;
  isActive: boolean;
  applicationType: TelegramBotApplicationType;
  assignedMember?: TelegramBotMemberSummary | null;
  channelAccessSummary: TelegramBotChannelAccessSummary;
  applicationSummary: TelegramBotFinanceApplicationSummary | null;
  runtimes: TelegramBotRuntimeSummary[];
  applications: TelegramBotApplicationOption[];
};

export type CreateTelegramBotRuntimePayload = {
  environment: TelegramBotRuntimeEnvironment;
  botToken: string;
};

export type UpdateTelegramBotRuntimePayload = {
  botToken: string;
};

export type SwitchTelegramBotApplicationPayload = {
  applicationType: TelegramBotApplicationType;
};
