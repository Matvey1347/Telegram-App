import { deriveCrmSalesAttention, type CrmInboxConversationItem, type CrmMessageListItem } from "@telegram-system/shared";
import { crmChatActionsApi } from "@/lib/features/growth/crm-chat-actions-api";
import { renderChatEntities } from "./crm-chat-entities";
import type { CrmChatCapabilities } from "@telegram-system/shared";
import type { TranslationFunction } from "@/providers/i18n-provider";
import { salesStatusLabel } from "./crm-sales-copy";
import type { ChatCapabilities, ChatConversation, ChatMessage } from "@/components/chat/types";
import { renderTelegramPreviewInlineMarkup, telegramPreviewPlainText } from "@/components/features/telegram/telegram/telegram-post-preview-markup";

export function crmChatCapabilities(canSend: boolean, server?: CrmChatCapabilities): ChatCapabilities {
  return { canSend, canReply: canSend && !!server?.canReply, canEdit: canSend && !!server?.canEdit,
    canDelete: canSend && !!server?.canDelete, canReact: canSend && !!server?.canReact,
    canForward: canSend && !!server?.canForward, canUpload: canSend && !!server?.canUpload,
    canSendVoice: canSend && !!server?.canSendVoice, canFormatText: canSend };
}

export function crmConversationTitle(item: Pick<CrmInboxConversationItem, "contact" | "peer">) {
  return item.contact?.displayName || [item.peer.firstName, item.peer.lastName].filter(Boolean).join(" ") ||
    (item.peer.username ? `@${item.peer.username}` : item.peer.telegramUserId);
}

export function toChatConversation(item: CrmInboxConversationItem, t?: TranslationFunction): ChatConversation {
  const attention = item.attentionStatus !== undefined ? item.attentionStatus : deriveCrmSalesAttention({ state: item.state, archivedAt: item.contact?.archivedAt, manualStatus: item.contact?.manualSalesStatus, nextContactAt: item.contact?.nextContactAt ?? null, lastInboundAt: item.lastInboundAt, lastOutboundAt: item.lastOutboundAt });
  return { id: item.id, title: crmConversationTitle(item), subtitle: `Telegram · ${item.account.username ? `@${item.account.username}` : item.account.label}`,
    preview: item.lastMessage?.origin === "MANUAL" ? telegramPreviewPlainText(item.lastMessage.text ?? "") : item.lastMessage?.text ?? "No messages yet",
    lastActivityAt: item.lastMessageAt ?? undefined, unreadCount: item.unreadCount, folders: item.folders?.filter((folder) => !folder.excludeRead || item.unreadCount > 0),
    status: item.state === "ARCHIVED" ? "Archived" : t ? salesStatusLabel(attention, t) : attention?.replaceAll("_", " ") ?? "New contact",
    avatarPresentation: item.peer.photoUrl ? { type: "image", id: item.peer.id, url: item.peer.photoUrl, name: crmConversationTitle(item) } : null };
}

export function toChatMessage(message: CrmMessageListItem, history: CrmMessageListItem[] | Map<number | string, CrmMessageListItem> = [], readOutboxMax?: number | null): ChatMessage {
  const meta = message.contentMetadata;
  const media = meta?.media as { kind?: string; fileName?: string; size?: number } | undefined;
  const reference = meta?.replyToTelegramMessageId ?? meta?.replyToMessageId;
  const original = reference !== undefined ? history instanceof Map ? history.get(reference as number | string) : history.find((item) => item.telegramMessageIdNumeric === reference || item.id === reference) : undefined;
  const text = message.text ?? "";
  const entities = meta?.entities;
  const reactions = Array.isArray(meta?.reactions) ? meta.reactions.filter((item): item is { emoji: string; count: number; chosen?: boolean; displayEmoji?: string } => !!item && typeof item.emoji === "string" && typeof item.count === "number") : undefined;
  const forwarded = meta?.forwarded as { author?: string; date?: string } | undefined;
  const deleted = !!message.deletedAt;
  return { id: message.id, text, direction: message.direction === "OUTBOUND" ? "outgoing" : "incoming", sentAt: message.sentAt,
    editedAt: message.editedAt ?? undefined, deleted,
    status: message.deliveryState === "PENDING" ? "sending" : message.deliveryState !== "FAILED" && message.direction === "OUTBOUND" && (message.readState === "READ" || (message.telegramMessageIdNumeric != null && readOutboxMax != null && message.telegramMessageIdNumeric <= readOutboxMax)) ? "read" : message.deliveryState === "UNKNOWN" && message.telegramMessageIdNumeric != null && message.direction === "OUTBOUND" ? "sent" : message.deliveryState.toLowerCase() as ChatMessage["status"],
    replyTo: meta?.replyToTelegramMessageId || meta?.replyToMessageId ? { id: original?.id ?? `unavailable:${meta.replyToTelegramMessageId}`, text: original?.deletedAt ? "Original message deleted" : original?.text ?? "Original message is outside loaded history" } : null,
    forwarded: forwarded ? forwarded.author ?? "message" : undefined,
    reactions,
    actionCapabilities: { canEdit: !deleted && message.direction === "OUTBOUND" && !media && !meta?.aiDraftId, canDelete: !deleted, canReply: !deleted, canReact: !deleted, canForward: !deleted && !meta?.protectedContent },
    attachments: !deleted && media?.kind && ["image", "audio", "video", "file"].includes(media.kind) ? [{ id: message.id, kind: media.kind as "image" | "audio" | "video" | "file", name: media.fileName ?? "Telegram attachment", sizeLabel: media.size ? `${(media.size / 1024).toFixed(1)} KB` : undefined, load: (signal) => crmChatActionsApi.download(message.conversationId, message.id, signal) }] : undefined,
    content: deleted ? undefined : Array.isArray(entities) ? renderChatEntities(text, entities) : message.origin === "MANUAL" && !meta?.telegramText ? <span dangerouslySetInnerHTML={{ __html: renderTelegramPreviewInlineMarkup(text) }} /> : undefined };
}
