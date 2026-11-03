import type { ReactNode } from "react";
import type { ResolvedEmoji } from "@telegram-system/shared";

/** Adapters expose only actions their transport and current permissions allow. */
export type ChatCapabilities = {
  canSend: boolean;
  canReply: boolean;
  canEdit: boolean;
  canDelete: boolean;
  canReact: boolean;
  canForward: boolean;
  canUpload: boolean;
  canSendVoice: boolean;
  canFormatText: boolean;
};

export type ChatConversation = {
  id: string;
  title: string;
  subtitle?: string;
  preview?: string;
  lastActivityAt?: string | null;
  unreadCount: number;
  status?: string;
  avatarPresentation?: ResolvedEmoji | null;
  folders?: Array<{ id: string; name: string; color: string | null }>;
};

export type ChatAttachment = {
  id: string;
  name: string;
  kind: "image" | "file" | "audio" | "video";
  /** URLs are supplied on demand by the adapter, never resolved by Chat UI. */
  url?: string | null;
  sizeLabel?: string;
  load?: (signal: AbortSignal) => Promise<Blob>;
};

export type ChatMessage = {
  id: string;
  text: string;
  direction: "incoming" | "outgoing";
  sentAt: string;
  editedAt?: string | null;
  deleted?: boolean;
  forwarded?: string;
  actionCapabilities?: Partial<Pick<ChatCapabilities, "canReply" | "canEdit" | "canDelete" | "canReact" | "canForward">>;
  status?: "sending" | "sent" | "delivered" | "read" | "failed" | "unknown";
  attachments?: ChatAttachment[];
  replyTo?: { id: string; text: string; author?: string } | null;
  reactions?: Array<{ emoji: string; count: number; chosen?: boolean; displayEmoji?: string; iconPresentation?: ResolvedEmoji }>;
  /** Optional safe renderer supplied by an adapter for supported text entities. */
  content?: ReactNode;
};

export type ChatMessageActions = {
  onCopy?: (message: ChatMessage) => void | Promise<void>;
  onReply?: (message: ChatMessage) => void;
  onEdit?: (message: ChatMessage) => void;
  onDelete?: (message: ChatMessage) => void;
  onReact?: (message: ChatMessage) => void;
  onForward?: (message: ChatMessage) => void;
  onJumpToReply?: (messageId: string) => void;
};
