import type { PaginatedResponse } from "../pagination";

export const CRM_CONTACT_STAGES = [
  "NEW",
  "LEAD",
  "QUALIFIED",
  "FOLLOW_UP",
  "CUSTOMER",
  "LOST",
  "ARCHIVED",
] as const;

export type CrmContactStage = (typeof CRM_CONTACT_STAGES)[number];

export const CRM_MESSAGE_DIRECTIONS = ["INBOUND", "OUTBOUND"] as const;
export type CrmMessageDirection = (typeof CRM_MESSAGE_DIRECTIONS)[number];

export const CRM_MESSAGE_ORIGINS = [
  "MANUAL",
  "AUTOMATION",
  "SYSTEM",
  "TELEGRAM_SYNC",
] as const;
export type CrmMessageOrigin = (typeof CRM_MESSAGE_ORIGINS)[number];

export type CrmReadState = "UNKNOWN" | "UNREAD" | "READ";
export type CrmDeliveryState =
  | "UNKNOWN"
  | "PENDING"
  | "SENT"
  | "DELIVERED"
  | "FAILED";
export type CrmConversationState = "ACTIVE" | "ARCHIVED";
export type CrmInitialImportStatus =
  | "NOT_STARTED"
  | "IN_PROGRESS"
  | "COMPLETED"
  | "FAILED";
export type CrmSyncStatus = "IDLE" | "SYNCING" | "RECOVERING" | "FAILED";

export const CRM_CUSTOMER_AUTOMATION_TYPES = [
  "PRE_PUBLICATION_REMINDER",
  "PUBLISHED_LINKS",
  "FOLLOW_UP",
] as const;
export type CrmCustomerAutomationType =
  (typeof CRM_CUSTOMER_AUTOMATION_TYPES)[number];
export type CrmAutomationOverride = "INHERIT" | "ENABLED" | "DISABLED";

export type CrmContact = {
  id: string;
  workspaceId: string;
  displayName: string;
  companyName: string | null;
  telegramUsername: string | null;
  phone: string | null;
  email: string | null;
  website: string | null;
  description: string | null;
  source: string | null;
  stage: CrmContactStage;
  ownerMemberId: string | null;
  automatedMessagesEnabled: boolean;
  automatedMessagesEnabledAt: string | null;
  lastContactAt: string | null;
  lastPurchaseAt: string | null;
  nextContactAt: string | null;
  archivedAt: string | null;
  activeDealCount: number;
  createdAt: string;
  updatedAt: string;
};

export type CrmContactsListResult = PaginatedResponse<CrmContact>;

export type CrmPeer = {
  id: string;
  workspaceId: string;
  telegramUserId: string;
  contactId: string | null;
  username: string | null;
  firstName: string | null;
  lastName: string | null;
  photoUrl: string | null;
  createdAt: string;
  updatedAt: string;
};

export type CrmConversation = {
  id: string;
  workspaceId: string;
  telegramCrmPeerId: string;
  contactId: string | null;
  mtprotoAccountId: string;
  telegramDialogId: string;
  state: CrmConversationState;
  lastMessageAt: string | null;
  lastInboundAt: string | null;
  lastOutboundAt: string | null;
  unreadCount: number;
  readState: CrmReadState;
  lastReadTelegramMessageId: string | null;
  lastReadAt: string | null;
  incrementalSyncCheckpoint: string | null;
  recoveryCheckpoint: string | null;
  lastMeaningfulSyncAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type CrmMessage = {
  id: string;
  workspaceId: string;
  conversationId: string;
  telegramMessageId: string;
  mtprotoAccountId: string;
  direction: CrmMessageDirection;
  origin: CrmMessageOrigin;
  sentByMemberId: string | null;
  automationExecutionId: string | null;
  text: string | null;
  contentMetadata: Record<string, unknown> | null;
  sentAt: string;
  editedAt: string | null;
  readState: CrmReadState;
  deliveryState: CrmDeliveryState;
  createdAt: string;
};

export type CrmAccountCapabilities = {
  accountId: string;
  crmSyncEnabled: boolean;
  crmSendEnabled: boolean;
  mtprotoPublishingEnabled: boolean;
};

export type CrmAccountSyncState = {
  mtprotoAccountId: string;
  workspaceId: string;
  initialImportStatus: CrmInitialImportStatus;
  incrementalCheckpoint: string | null;
  recoveryCheckpoint: string | null;
  status: CrmSyncStatus;
  lastErrorCode: string | null;
  lastErrorMessage: string | null;
  lastMeaningfulSyncAt: string | null;
  createdAt: string | null;
  updatedAt: string | null;
};

export type CrmSenderAccount = CrmAccountCapabilities & {
  label: string;
  status: "connected";
  isActive: true;
};

export type CrmWorkspaceAutomationSettings = {
  customerTelegramAutomationsEnabled: boolean;
  customerTelegramAutomationsEnabledAt: string | null;
  typeEnabled: Record<CrmCustomerAutomationType, boolean>;
};

export type CrmWorkspaceSettings = {
  workspaceId: string;
  defaultCrmSenderAccountId: string | null;
  automation: CrmWorkspaceAutomationSettings;
  createdAt: string | null;
  updatedAt: string | null;
};

export type CrmAutomationEligibility = {
  allowed: boolean;
  reason:
    | "ELIGIBLE"
    | "WORKSPACE_DISABLED"
    | "CONTACT_DISABLED"
    | "TYPE_DISABLED"
    | "DEAL_DISABLED"
    | "DEAL_NOT_ELIGIBLE"
    | "BEFORE_CUTOVER"
    | "HISTORICAL_EVENT"
    | "MISSING_IDEMPOTENCY_KEY";
};
