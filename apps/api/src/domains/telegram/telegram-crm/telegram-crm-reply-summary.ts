import { TelegramCrmConversationState } from '@prisma/client';
import type { CrmReplySummary, CrmReplyStatus } from '@telegram-system/shared';
import type { PrismaService } from '../../../prisma/prisma.service';

type ReplyContact = {
  id: string;
  replyAlertMutedAt: Date | null;
};

type ReplyConversation = {
  contactId: string | null;
  inboundMessageCount: number;
  outboundMessageCount: number;
  historyExhausted: boolean;
  lastInboundAt: Date | null;
  lastOutboundAt: Date | null;
  unreadCount: number;
};

const EMPTY_REPLY_SUMMARY: CrmReplySummary = {
  status: 'NONE',
  inboundMessageCount: 0,
  outboundMessageCount: 0,
  countsComplete: false,
  unreadCount: 0,
  muted: false,
};

/** One bounded query for the Conversations belonging to the current Contact page. */
export async function loadCrmReplySummaries(
  prisma: Pick<PrismaService, 'telegramCrmConversation'>,
  workspaceId: string,
  contacts: readonly ReplyContact[],
) {
  if (!contacts.length) return new Map<string, CrmReplySummary>();
  const contactById = new Map(contacts.map((contact) => [contact.id, contact]));
  const rows = await prisma.telegramCrmConversation.findMany({
    where: {
      workspaceId,
      contactId: { in: contacts.map((contact) => contact.id) },
      state: TelegramCrmConversationState.ACTIVE,
    },
    select: {
      contactId: true,
      inboundMessageCount: true,
      outboundMessageCount: true,
      historyExhausted: true,
      lastInboundAt: true,
      lastOutboundAt: true,
      unreadCount: true,
    },
  });
  const grouped = new Map<string, ReplyConversation[]>();
  for (const row of rows) {
    if (!row.contactId || !contactById.has(row.contactId)) continue;
    const values = grouped.get(row.contactId) ?? [];
    values.push(row);
    grouped.set(row.contactId, values);
  }
  return new Map(
    contacts.map((contact) => [
      contact.id,
      summarizeReply(contact, grouped.get(contact.id) ?? []),
    ]),
  );
}

export function summarizeReply(
  contact: ReplyContact,
  conversations: readonly ReplyConversation[],
): CrmReplySummary {
  if (!conversations.length) return { ...EMPTY_REPLY_SUMMARY };
  const inboundMessageCount = conversations.reduce(
    (sum, conversation) => sum + conversation.inboundMessageCount,
    0,
  );
  const outboundMessageCount = conversations.reduce(
    (sum, conversation) => sum + conversation.outboundMessageCount,
    0,
  );
  const unreadCount = conversations.reduce(
    (sum, conversation) => sum + conversation.unreadCount,
    0,
  );
  const latestInbound = newestUnansweredInbound(conversations);
  const unanswered = Boolean(latestInbound?.lastInboundAt);
  const latestUnread = unanswered && (latestInbound?.unreadCount ?? 0) > 0;
  const countsComplete = conversations.every(
    (conversation) => conversation.historyExhausted,
  );
  const firstInbound =
    unanswered &&
    countsComplete &&
    inboundMessageCount === 1 &&
    outboundMessageCount === 0;
  const status: CrmReplyStatus = !unanswered
    ? outboundMessageCount > 0
      ? 'WAITING_FOR_CLIENT'
      : 'NONE'
    : firstInbound
      ? latestUnread
        ? 'FIRST_INBOUND_UNREAD'
        : 'FIRST_INBOUND_READ'
      : latestUnread
        ? 'CONVERSATION_UNANSWERED_UNREAD'
        : 'CONVERSATION_UNANSWERED_READ';
  return {
    status,
    inboundMessageCount,
    outboundMessageCount,
    countsComplete,
    unreadCount,
    muted: Boolean(
      status !== 'NONE' &&
      contact.replyAlertMutedAt &&
      latestInbound?.lastInboundAt &&
      contact.replyAlertMutedAt >= latestInbound.lastInboundAt,
    ),
  };
}

function newestUnansweredInbound(conversations: readonly ReplyConversation[]) {
  return conversations.reduce<ReplyConversation | null>(
    (value, conversation) => {
      if (
        !conversation.lastInboundAt ||
        (conversation.lastOutboundAt &&
          conversation.lastOutboundAt >= conversation.lastInboundAt)
      ) {
        return value;
      }
      if (
        !value?.lastInboundAt ||
        conversation.lastInboundAt > value.lastInboundAt
      ) {
        return conversation;
      }
      return value;
    },
    null,
  );
}
