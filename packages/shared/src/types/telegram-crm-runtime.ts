import type { CrmConversation, CrmMessageWithAttribution } from "./telegram-crm";

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
  | (CrmRealtimeBase & {
      type: "message.received" | "message.sent";
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
    })
  | (CrmRealtimeBase & {
      type: "inbox.updated";
      peerId: string;
      contactId: null;
      ownerMemberId: null;
      conversation: CrmConversation | null;
    });
