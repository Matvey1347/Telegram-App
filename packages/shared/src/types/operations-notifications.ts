export const OPERATIONS_NOTIFICATION_TYPES = [
  "CRM_MESSAGE_RECEIVED",
  "CRM_FOLLOW_UP_DUE",
  "CRM_PLACEMENT_FAILURE",
  "TELEGRAM_ACCOUNT_REAUTH_REQUIRED",
  "CRM_AI_LEAD_QUALIFIED",
  "SYSTEM_TEST",
  "CHANNEL_POSTS_REMINDER",
  "AI_POSTING_AUTOPILOT",
] as const;

export type OperationsNotificationType =
  (typeof OPERATIONS_NOTIFICATION_TYPES)[number];

export const OPERATIONS_NOTIFICATION_PRIORITIES = [
  "LOW",
  "NORMAL",
  "HIGH",
] as const;

export type OperationsNotificationPriority =
  (typeof OPERATIONS_NOTIFICATION_PRIORITIES)[number];

export const OPERATIONS_NOTIFICATION_COPY_KEYS = [
  "crm.notification.messageReceived",
  "crm.notification.followUpDue",
  "crm.notification.placementFailure",
  "telegram.notification.accountReauthRequired",
  "crm.notification.aiLeadQualified",
  "operations.notification.pushTest",
  "telegram.notification.channelPostsReminder",
  "telegram.notification.aiPostingAutopilot",
] as const;

export type OperationsNotificationCopyKey =
  (typeof OPERATIONS_NOTIFICATION_COPY_KEYS)[number];

export type OperationsNotificationMetadata = Record<
  string,
  string | number | boolean | null
>;

export type OperationsCrmMessageGroupPresentation = {
  kind: "crm-message";
  conversationId: string;
  contactId: string | null;
  senderName: string;
  avatarUrl: string | null;
  messageCount: number;
  notificationIds: string[];
};

export type OperationsTelegramAccountPresentation = {
  kind: "telegram-account";
  accountId: string;
  label: string;
  avatarUrl: string | null;
};

export type OperationsNotificationPresentation =
  | OperationsCrmMessageGroupPresentation
  | OperationsTelegramAccountPresentation;

export type OperationsNotificationItem = {
  id: string;
  workspaceId: string;
  recipientMemberId: string;
  type: OperationsNotificationType;
  priority: OperationsNotificationPriority;
  copyKey: OperationsNotificationCopyKey;
  title: string;
  body: string;
  metadata: OperationsNotificationMetadata;
  presentation?: OperationsNotificationPresentation | null;
  targetUrl: string;
  readAt: string | null;
  createdAt: string;
  expiresAt: string;
};

export type OperationsNotificationPage = {
  items: OperationsNotificationItem[];
  nextCursor: string | null;
};

export type OperationsNotificationUnreadCount = {
  unread: number;
};

export type OperationsNotificationPreferences = {
  webPushEnabled: boolean;
  pushConfigured: boolean;
  activeSubscriptionCount: number;
  /** Optional during a rolling deployment; absent fields use the defaults below. */
  crmNotificationsEnabled?: boolean;
  crmIncomingMessagesEnabled?: boolean;
  crmFollowUpEnabled?: boolean;
  crmAiLeadsEnabled?: boolean;
  crmMessagePreviewEnabled?: boolean;
  channelRemindersPushEnabled?: boolean;
  channelRemindersTelegramEnabled?: boolean;
};

export const CRM_NOTIFICATION_PREFERENCE_DEFAULTS = {
  crmNotificationsEnabled: true,
  crmIncomingMessagesEnabled: false,
  crmFollowUpEnabled: true,
  crmAiLeadsEnabled: false,
  crmMessagePreviewEnabled: false,
} as const;

export type OperationsNotificationPreferencesPatch = Partial<
  Pick<
    OperationsNotificationPreferences,
    | "webPushEnabled"
    | "channelRemindersPushEnabled"
    | "channelRemindersTelegramEnabled"
    | keyof typeof CRM_NOTIFICATION_PREFERENCE_DEFAULTS
  >
>;

export type OperationsNotificationTestResult = {
  status:
    | "sent"
    | "failed"
    | "disabled"
    | "unavailable"
    | "no_subscription"
    | "rate_limited";
  attempted: number;
  delivered: number;
  failed: number;
  skipped: number;
};

export type OperationsNotificationPushConfig = {
  enabled: boolean;
  publicKey: string | null;
};

export type OperationsPushSubscriptionInput = {
  endpoint: string;
  keys: {
    p256dh: string;
    auth: string;
  };
  userAgent?: string | null;
};

export type OperationsNotificationCreatedEvent = {
  type: "notification.created";
  workspaceId: string;
  recipientMemberId: string;
  occurredAt: string;
  notification: OperationsNotificationItem;
};

export type OperationsNotificationInvalidatedEvent = {
  type: "notifications.invalidated";
  workspaceId: string;
  recipientMemberId: string;
  occurredAt: string;
};

export type OperationsNotificationRealtimeEvent =
  | OperationsNotificationCreatedEvent
  | OperationsNotificationInvalidatedEvent;
