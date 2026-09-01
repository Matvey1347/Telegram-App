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
export const CRM_CONVERSATION_STATES = [
  "ACTIVE",
  "IGNORED",
  "ARCHIVED",
] as const;
export type CrmConversationState = (typeof CRM_CONVERSATION_STATES)[number];
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
export const CRM_AUTOMATION_OVERRIDES = [
  "INHERIT",
  "ENABLED",
  "DISABLED",
] as const;
export type CrmAutomationOverride = (typeof CRM_AUTOMATION_OVERRIDES)[number];

export const CRM_FOLLOW_UP_VIEWS = [
  "TODAY",
  "WAITING_FOR_REPLY",
  "WROTE_NO_REPLY",
  "READ_NO_REPLY",
] as const;
export type CrmFollowUpView = (typeof CRM_FOLLOW_UP_VIEWS)[number];

export type CrmMemberSummary = {
  id: string;
  name: string;
  email: string | null;
};

export type CrmAccountSummary = {
  id: string;
  label: string;
  username: string | null;
  photoUrl: string | null;
};

export type CrmPeerSummary = {
  id: string;
  telegramUserId: string;
  username: string | null;
  firstName: string | null;
  lastName: string | null;
  photoUrl: string | null;
};

export type CrmMessagePreview = {
  id: string;
  conversationId: string;
  direction: CrmMessageDirection;
  origin: CrmMessageOrigin;
  text: string | null;
  sentAt: string;
  readState: CrmReadState;
};

export type CrmTaskSummary = {
  id: string;
  title: string;
  dueAt: string;
  status: string;
  type: string;
  priority: string;
};

export type CrmActiveDealSummary = {
  id: string;
  title: string | null;
  status: string;
  placementCount: number;
  settlementCurrency: string;
  agreedAmount: string;
  paidAmount: string;
  paymentStatus: "UNPAID" | "PARTIALLY_PAID" | "PAID" | "OVERPAID";
  scheduledAt: string | null;
};

export type CrmTagSummary = {
  id: string;
  name: string;
  color: string | null;
};

export type CrmContactPaymentSummary = {
  currency: string;
  agreedAmount: string;
  paidAmount: string;
  outstandingAmount: string;
};

export type CrmDealAutomationSummary = {
  dealId: string;
  override: CrmAutomationOverride;
  eligibleAt: string | null;
};

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
  lastInboundAt: string | null;
  lastOutboundAt: string | null;
  lastPurchaseAt: string | null;
  nextContactAt: string | null;
  archivedAt: string | null;
  activeDealCount: number;
  createdAt: string;
  updatedAt: string;
};

export type CrmContactListItem = CrmContact & {
  ownerMember: CrmMemberSummary | null;
  peer: CrmPeerSummary | null;
  unreadCount: number;
  conversationCount: number;
  conversationAccounts: CrmAccountSummary[];
  lastMessage: CrmMessagePreview | null;
  nextOpenTask: CrmTaskSummary | null;
  activeDeal: CrmActiveDealSummary | null;
};

export type CrmContactDetail = CrmContact & {
  ownerMember: CrmMemberSummary | null;
  peers: CrmPeerSummary[];
  unreadCount: number;
  tags: CrmTagSummary[];
  paymentSummary: CrmContactPaymentSummary[];
  dealAutomation: CrmDealAutomationSummary[];
  counts: {
    conversations: number;
    deals: number;
    openTasks: number;
    activities: number;
  };
};

export type CrmContactsListResult = PaginatedResponse<CrmContactListItem>;

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
  historyCursorTelegramMessageId: number | null;
  historyExhausted: boolean;
  lastMessageAt: string | null;
  lastInboundAt: string | null;
  lastOutboundAt: string | null;
  unreadCount: number;
  readState: CrmReadState;
  lastReadTelegramMessageId: string | null;
  lastReadInboxTelegramMessageId: number | null;
  lastReadOutboxTelegramMessageId: number | null;
  lastReadAt: string | null;
  incrementalSyncCheckpoint: string | null;
  recoveryCheckpoint: string | null;
  lastMeaningfulSyncAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type CrmConversationListItem = CrmConversation & {
  account: CrmAccountSummary;
  peer: CrmPeerSummary;
};

export type CrmConversationsListResult =
  PaginatedResponse<CrmConversationListItem>;

export type CrmMessage = {
  id: string;
  workspaceId: string;
  conversationId: string;
  telegramMessageId: string;
  telegramMessageIdNumeric: number | null;
  clientIdempotencyKey: string | null;
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

export type CrmMessageWithAttribution = CrmMessage & {
  sentByMember: CrmMemberSummary | null;
};

export type CrmMessageListItem = CrmMessageWithAttribution & {
  account: CrmAccountSummary;
};

export type CrmMessagesCursorPage = {
  items: CrmMessageListItem[];
  nextCursor: string | null;
  hasMore: boolean;
};

export type CrmUnreadSummary = {
  total: number;
  contacts: number;
  inbox: number;
};

export type CrmDealAutomationUpdateResult = CrmDealAutomationSummary;

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
  initialImportCursor: string | null;
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
