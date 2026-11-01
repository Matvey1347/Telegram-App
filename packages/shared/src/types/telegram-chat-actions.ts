import type { CrmMessageListItem } from "./telegram-crm";

/** Current account/permission capability, not a promise that Telegram accepts every message. */
export type CrmChatCapabilities = {
  canReply: boolean;
  canEdit: boolean;
  canDelete: boolean;
  canDeleteForEveryone: boolean;
  canReact: boolean;
  canForward: boolean;
  canUpload: boolean;
  canSendVoice: boolean;
  maxUploadBytes: number;
  voiceMimeTypes: string[];
  reactionEmoji: string[];
  reason?: string;
};

export type CrmChatActionRequest = {
  /** UTC YYYY-MM-DD:UUID; retain for an uncertain operation, never regenerate on retry. */
  operationId: string;
  kind: "EDIT" | "DELETE" | "REACTION" | "FORWARD";
  messageId: string;
  text?: string;
  revoke?: boolean;
  emoji?: string | null;
  destinationConversationId?: string;
};

export type CrmChatActionResult = {
  operationId: string;
  status: "CONFIRMED" | "UNKNOWN" | "FAILED";
  conversationId: string;
  message?: CrmMessageListItem | null;
  deletedMessageIds?: string[];
  errorCode?: string;
};

export type CrmChatMediaInput = {
  operationId: string;
  kind: "IMAGE" | "FILE" | "VOICE";
  caption?: string;
  replyToMessageId?: string;
};

export type CrmChatEntity = {
  type: "bold" | "italic" | "underline" | "strike" | "code" | "pre" | "textUrl" | "spoiler" | "blockquote" | "url" | "customEmoji";
  /** Telegram offsets/lengths use UTF-16 code units, like JS string indices. */
  offset: number;
  length: number;
  url?: string;
  language?: string;
  documentId?: string;
};

export type CrmChatMessageMetadata = {
  entities?: CrmChatEntity[];
  replyToTelegramMessageId?: number;
  reactions?: Array<{ emoji: string; count: number; chosen: boolean }>;
  media?: { kind: "image" | "file" | "audio" | "video"; fileName: string; mimeType: string; size: number; duration?: number; voice?: boolean };
  protectedContent?: boolean;
  forwarded?: { date: string; author?: string };
};
