import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';

const eligibleConversationSelect = {
  id: true,
  workspaceId: true,
  mtprotoAccountId: true,
  telegramCrmPeerId: true,
  contactId: true,
  unreadCount: true,
  lastReadInboxTelegramMessageId: true,
} satisfies Prisma.TelegramCrmConversationSelect;

export type CrmNotificationConversation =
  Prisma.TelegramCrmConversationGetPayload<{
    select: typeof eligibleConversationSelect;
  }>;

@Injectable()
export class TelegramCrmNotificationEligibilityService {
  async load(
    tx: Prisma.TransactionClient,
    workspaceId: string,
    conversationIds: readonly string[],
  ) {
    const ids = [...new Set(conversationIds)];
    if (!ids.length) return new Map<string, CrmNotificationConversation>();
    const rows = await tx.telegramCrmConversation.findMany({
      where: {
        workspaceId,
        id: { in: ids },
        state: 'ACTIVE',
        unreadCount: { gt: 0 },
        mtprotoAccount: {
          workspaceId,
          isActive: true,
          status: 'connected',
          crmSyncEnabled: true,
        },
        OR: [{ contactId: null }, { contact: { archivedAt: null } }],
      },
      select: eligibleConversationSelect,
    });
    return new Map(rows.map((row) => [row.id, row]));
  }

  unreadMessage(
    conversation: CrmNotificationConversation,
    accountId: string,
    numericId: number | null,
  ) {
    return (
      conversation.mtprotoAccountId === accountId &&
      numericId !== null &&
      numericId > (conversation.lastReadInboxTelegramMessageId ?? 0)
    );
  }
}
