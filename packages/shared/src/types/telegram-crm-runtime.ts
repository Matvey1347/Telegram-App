import type { ResolvedEmoji } from "./resolved-emoji";
import type { CrmManualSalesStatus } from "./telegram-crm-sales-workflow";
import type {
  CrmConversation,
  CrmMessageWithAttribution,
} from "./telegram-crm";

export type CrmTelegramCheckpoint = {
  pts: number;
  qts: number;
  date: number;
  seq: number;
};

export type CrmInitialSyncResult = {
  accountId: string;
  scannedDialogs: number;
  importedPeers: number;
  importedConversations: number;
  importedMessages: number;
  nextCursor: string | null;
  exhausted: boolean;
};

type CrmRealtimeBase = {
  workspaceId: string;
  occurredAt: string;
};

export type CrmRealtimeEvent =
  | (CrmRealtimeBase & { type: "folders.updated"; ownerMemberId: null })
  | (CrmRealtimeBase & {
      type: "message.deleted";
      conversationId: string;
      contactId: string | null;
      ownerMemberId: string | null;
      messageIds: string[];
      unreadCount: number;
      lastMessage?: CrmMessageWithAttribution | null;
      lastMessageAt: string | null;
    })
  | (CrmRealtimeBase & {
      type: "message.received" | "message.sent" | "message.updated";
      conversationId: string;
      contactId: string | null;
      ownerMemberId: string | null;
      message: CrmMessageWithAttribution;
    })
  | (CrmRealtimeBase & {
      type: "conversation.unreadChanged" | "readChanged";
      conversationId: string;
      contactId: string | null;
      ownerMemberId: string | null;
      unreadCount: number;
    })
  | (CrmRealtimeBase & {
      type: "contact.updated";
      contactId: string;
      ownerMemberId: string | null;
      manualSalesStatus?: CrmManualSalesStatus | null;
      nextContactAt?: string | null;
      archivedAt?: string | null;
    })
  | (CrmRealtimeBase & {
      type: "inbox.updated";
      peerId: string;
      contactId: null;
      ownerMemberId: null;
      conversation: CrmConversation | null;
    })
  | (CrmRealtimeBase & {
      type: "sync.progress";
      accountId: string;
      ownerMemberId: string;
      phase: "STARTED" | "RUNNING" | "COMPLETED" | "FAILED";
      scannedDialogs: number;
      importedPeers: number;
      importedConversations: number;
      importedMessages: number;
      current: number;
      total: number;
    });

/** Ephemeral, authorized original Premium reaction assets keyed by Telegram document ID. */
export type CrmReactionAssetsResponse = { items: Record<string, ResolvedEmoji> };
