import type { OperationsNotification } from '@prisma/client';

type CrmConversationPresentation = {
  id: string;
  contactId: string | null;
  unreadCount: number;
  contact: { displayName: string } | null;
  peer: {
    id: string;
    username: string | null;
    firstName: string | null;
    lastName: string | null;
    photoUrl: string | null;
  };
};

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function string(value: unknown) {
  return typeof value === 'string' && value.trim() ? value : null;
}

function senderName(conversation: CrmConversationPresentation) {
  return (
    conversation.contact?.displayName ||
    [conversation.peer.firstName, conversation.peer.lastName]
      .filter(Boolean)
      .join(' ')
      .trim() ||
    (conversation.peer.username ? `@${conversation.peer.username}` : null) ||
    'Telegram user'
  );
}

export function groupCrmNotificationRows(
  rows: OperationsNotification[],
  conversations: CrmConversationPresentation[],
) {
  const conversationById = new Map(
    conversations.map((conversation) => [conversation.id, conversation]),
  );
  const groups = new Map<
    string,
    {
      row: OperationsNotification;
      ids: string[];
      storedCount: number;
      conversation?: CrmConversationPresentation;
    }
  >();

  for (const row of rows) {
    const metadata = record(row.metadata);
    const conversationId = string(metadata.conversationId);
    const conversation = conversationId
      ? conversationById.get(conversationId)
      : undefined;
    const isCrmMessage = row.type === 'CRM_MESSAGE_RECEIVED' && conversationId;
    const groupKey = isCrmMessage
      ? `crm:${string(metadata.contactId) || conversation?.contactId || string(metadata.peerId) || conversation?.peer.id || conversationId}`
      : `notification:${row.id}`;
    const current = groups.get(groupKey);
    const storedCount =
      typeof metadata.messageCount === 'number' ? metadata.messageCount : 1;
    if (current) {
      current.ids.push(row.id);
      current.storedCount = Math.max(current.storedCount, storedCount);
      if (!row.readAt) current.row = { ...current.row, readAt: null };
      continue;
    }
    groups.set(groupKey, {
      row,
      ids: [row.id],
      storedCount,
      conversation,
    });
  }

  return [...groups.values()].map(({ row, ids, storedCount, conversation }) => {
    if (row.type !== 'CRM_MESSAGE_RECEIVED' || !conversation) return row;
    const metadata = record(row.metadata);
    const name = senderName(conversation);
    return {
      ...row,
      title: `New message from ${name}`,
      metadata: {
        ...metadata,
        presentationKind: 'crm-message',
        conversationId: conversation.id,
        contactId: conversation.contactId,
        senderName: name,
        avatarUrl: conversation.peer.photoUrl,
        messageCount: Math.max(
          storedCount,
          ids.length,
          conversation.unreadCount,
        ),
        notificationIds: ids.join(','),
      },
    };
  });
}

export function notificationConversationIds(rows: OperationsNotification[]) {
  return [
    ...new Set(
      rows.flatMap((row) => {
        if (row.type !== 'CRM_MESSAGE_RECEIVED') return [];
        const conversationId = string(record(row.metadata).conversationId);
        return conversationId ? [conversationId] : [];
      }),
    ),
  ];
}
