import type { ResolvedEmoji } from './resolved-emoji';
import type { CrmManualSalesStatus, CrmSalesAttentionStatus } from "./telegram-crm-sales-workflow";
import type {
  CrmAccountSummary,
  CrmContactStage,
  CrmConversationState,
  CrmMessagePreview,
  CrmPeerSummary,
  CrmReadState,
} from "./telegram-crm";

export const CRM_INBOX_FILTERS = [
  "ALL",
  "UNREAD",
  "NEEDS_REPLY",
  "AI_LEADS",
  "FOLLOW_UP",
  "ARCHIVED",
] as const;

export type CrmInboxFilter = (typeof CRM_INBOX_FILTERS)[number];

export type CrmInboxFolderSummary = { id: string; name: string; color: string | null; emojiPresentation: ResolvedEmoji | null; unreadCount: number; excludeRead: boolean };
export type CrmInboxFoldersResult = { items: CrmInboxFolderSummary[]; totalUnread: number };

/** One exact Telegram account/peer dialog, including linked CRM clients. */
export type CrmInboxConversationItem = {
  id: string;
  workspaceId: string;
  contact: {
    id: string;
    displayName: string;
    telegramUsername?: string | null;
    stage: CrmContactStage;
    nextContactAt: string | null;
    manualSalesStatus?: CrmManualSalesStatus | null;
    archivedAt?: string | null;
  } | null;
  /** Synced Telegram folders for this account and linked client. */
  folders?: Array<{ id: string; name: string; color: string | null; emojiPresentation?: ResolvedEmoji | null; excludeRead?: boolean }>;
  peer: CrmPeerSummary;
  account: CrmAccountSummary;
  state: CrmConversationState;
  lastMessageAt: string | null;
  lastInboundAt: string | null;
  lastOutboundAt: string | null;
  unreadCount: number;
  readState: CrmReadState;
  attentionStatus?: CrmSalesAttentionStatus | null;
  /** Text is bounded to 240 characters; full content belongs to the thread. */
  lastMessage: CrmMessagePreview | null;
};

export type CrmInboxConversationsPage = {
  items: CrmInboxConversationItem[];
  nextCursor: string | null;
  hasMore: boolean;
};
