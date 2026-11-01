import { Injectable } from '@nestjs/common';
import { OperationsNotificationType, Prisma } from '@prisma/client';

export const crmConversationNotificationKey = (
  accountId: string,
  conversationId: string,
) => `account:${accountId}:conversation:${conversationId}`;

type ReadFact = {
  conversationId: string;
  contactId: string | null;
  unreadCount: number;
};

@Injectable()
export class TelegramCrmNotificationGroups {
  async reconcile(
    tx: Prisma.TransactionClient,
    workspaceId: string,
    reads: readonly ReadFact[],
  ) {
    const ids = [...new Set(reads.map((read) => read.conversationId))];
    if (!ids.length) return [];
    const conversations = await tx.telegramCrmConversation.findMany({
      where: { workspaceId, id: { in: ids } },
      select: { id: true, mtprotoAccountId: true, contactId: true },
    });
    const byId = new Map(
      conversations.map((conversation) => [conversation.id, conversation]),
    );
    const exhausted = new Set<string>();
    const remaining = new Map<string, number>();
    for (const read of reads) {
      const conversation = byId.get(read.conversationId);
      exhausted.add(`conversation:${read.conversationId}`);
      if (conversation?.contactId)
        exhausted.add(`contact:${conversation.contactId}`);
      if (!conversation) continue;
      const key = crmConversationNotificationKey(
        conversation.mtprotoAccountId,
        conversation.id,
      );
      if (read.unreadCount <= 0) exhausted.add(key);
      else remaining.set(key, read.unreadCount);
    }
    const sourceKeys = [...new Set([...exhausted, ...remaining.keys()])];
    const where = {
      workspaceId,
      type: OperationsNotificationType.CRM_MESSAGE_RECEIVED,
      sourceKey: { in: sourceKeys },
    };
    const recipients = await tx.operationsNotification.findMany({
      where,
      distinct: ['recipientMemberId'],
      select: { recipientMemberId: true },
    });
    if (!recipients.length) return [];
    if (exhausted.size)
      await tx.operationsNotification.deleteMany({
        where: { ...where, sourceKey: { in: [...exhausted] } },
      });
    if (remaining.size)
      await tx.$executeRaw(Prisma.sql`
      UPDATE "OperationsNotification" AS notification
      SET "metadata" = jsonb_set(COALESCE(notification."metadata"::jsonb, '{}'::jsonb),
        '{messageCount}', to_jsonb(incoming."unreadCount"), true)
      FROM (VALUES ${Prisma.join(
        [...remaining].map(
          ([key, count]) => Prisma.sql`(
        CAST(${key} AS TEXT), CAST(${count} AS INTEGER)
      )`,
        ),
      )}) AS incoming("sourceKey", "unreadCount")
      WHERE notification."workspaceId" = ${workspaceId}
        AND notification."type" = ${OperationsNotificationType.CRM_MESSAGE_RECEIVED}::"OperationsNotificationType"
        AND notification."sourceKey" = incoming."sourceKey"
        AND notification."metadata"::jsonb->'messageCount' IS DISTINCT FROM to_jsonb(incoming."unreadCount")
    `);
    return recipients.map((row) => row.recipientMemberId);
  }
}
