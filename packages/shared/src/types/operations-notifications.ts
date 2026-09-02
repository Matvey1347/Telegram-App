export const OPERATIONS_NOTIFICATION_TYPES = [
  "CRM_MESSAGE_RECEIVED",
  "CRM_FOLLOW_UP_DUE",
  "CRM_AUTOMATION_BLOCKED",
  "CRM_PLACEMENT_FAILURE",
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
  "crm.notification.automationBlocked",
  "crm.notification.placementFailure",
] as const;

export type OperationsNotificationCopyKey =
  (typeof OPERATIONS_NOTIFICATION_COPY_KEYS)[number];

export type OperationsNotificationMetadata = Record<
  string,
  string | number | boolean | null
>;

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
