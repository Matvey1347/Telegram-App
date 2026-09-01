import type { PaginatedResponse } from "../pagination";
import type {
  CrmAccountSummary,
  CrmContact,
  CrmContactStage,
  CrmConversationState,
  CrmMessageWithAttribution,
  CrmMessagePreview,
  CrmPeer,
  CrmReadState,
} from "./telegram-crm";

export const CRM_INBOX_PROMOTION_STAGES = [
  "LEAD",
  "QUALIFIED",
  "FOLLOW_UP",
  "CUSTOMER",
] as const satisfies readonly CrmContactStage[];

export type CrmInboxPromotionStage =
  (typeof CRM_INBOX_PROMOTION_STAGES)[number];

export type CrmInboxConversationSummary = {
  id: string;
  mtprotoAccountId: string;
  state: CrmConversationState;
  lastMessageAt: string | null;
  lastInboundAt: string | null;
  lastOutboundAt: string | null;
  unreadCount: number;
  readState: CrmReadState;
  account: CrmAccountSummary;
  lastMessage: CrmMessagePreview | null;
};

/** One canonical row per unlinked Telegram Peer, across all enabled accounts. */
export type CrmInboxItem = {
  peer: CrmPeer;
  conversationCount: number;
  unreadCount: number;
  conversations: CrmInboxConversationSummary[];
  latestConversation: CrmInboxConversationSummary | null;
};

export type CrmInboxListResult = PaginatedResponse<CrmInboxItem>;

export type CrmInboxPromotionResult = {
  contact: CrmContact;
  peerId: string;
  linkedConversationCount: number;
};

export type CrmInboxStateResult = {
  peerId: string;
  state: CrmConversationState;
  changedConversationCount: number;
};

export type CrmContactMergeResult = {
  targetContactId: string;
  sourceContactId: string;
  moved: Record<string, number>;
};

export type CrmManualMessageResult = {
  message: CrmMessageWithAttribution;
  idempotentReplay: boolean;
};

export type CrmConversationReadResult = {
  conversationId: string;
  lastReadInboxTelegramMessageId: number | null;
  readMessageCount: number;
  unreadCount: 0;
};

export type CrmHistoryImportResult = {
  conversationId: string;
  imported: number;
  scanned: number;
  nextBeforeTelegramMessageId: number | null;
  exhausted: boolean;
};
