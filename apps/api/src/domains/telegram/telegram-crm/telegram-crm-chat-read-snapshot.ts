import { Prisma } from '@prisma/client';
export type CrmChatReadSnapshot = {
  pts?: number;
  unreadCount: number;
  readInboxMaxId: number;
  topMessageId: number;
};
/** Snapshot is remote peer-specific. Rows committed after its top ID remain unread. */
export async function applyCrmReadSnapshot(
  tx: Prisma.TransactionClient,
  conversation: { id: string; workspaceId: string },
  snapshot: CrmChatReadSnapshot,
  observedDeletedIds: readonly number[] = [],
) {
  if (
    ![
      snapshot.pts ?? 0,
      snapshot.unreadCount,
      snapshot.readInboxMaxId,
      snapshot.topMessageId,
    ].every((value) => Number.isInteger(value) && value >= 0)
  )
    throw new Error('CRM_READ_SNAPSHOT_INVALID');
  await tx.$queryRaw(
    Prisma.sql`SELECT id FROM "TelegramCrmConversation" WHERE id=${conversation.id} AND "workspaceId"=${conversation.workspaceId} FOR UPDATE`,
  );
  const current = await tx.telegramCrmConversation.findFirst({
    where: { id: conversation.id, workspaceId: conversation.workspaceId },
    select: {
      unreadCount: true,
      lastReadInboxTelegramMessageId: true,
      unreadSnapshotPts: true,
      unreadSnapshotTopMessageId: true,
    },
  });
  if (!current) throw new Error('CRM_READ_SNAPSHOT_CONVERSATION_MISSING');
  if ((snapshot.pts ?? 0) < (current.unreadSnapshotPts ?? 0))
    return { unreadCount: current.unreadCount, changed: false };
  if (snapshot.readInboxMaxId < (current.lastReadInboxTelegramMessageId ?? 0))
    return { unreadCount: current.unreadCount, changed: false };
  const tail = await tx.telegramCrmMessage.count({
    where: {
      workspaceId: conversation.workspaceId,
      conversationId: conversation.id,
      deletedAt: null,
      direction: 'INBOUND',
      readState: 'UNREAD',
      telegramMessageIdNumeric: {
        gt: Math.max(snapshot.topMessageId, snapshot.readInboxMaxId),
      },
    },
  });
  const unreadCount = snapshot.unreadCount + tail;
  const watermark = Math.max(
    current.unreadSnapshotTopMessageId ?? 0,
    snapshot.topMessageId,
    ...observedDeletedIds,
  );
  const readAdvanced =
    snapshot.readInboxMaxId > (current.lastReadInboxTelegramMessageId ?? 0);
  if (readAdvanced)
    await tx.telegramCrmMessage.updateMany({
      where: {
        workspaceId: conversation.workspaceId,
        conversationId: conversation.id,
        direction: 'INBOUND',
        deletedAt: null,
        readState: { not: 'READ' },
        telegramMessageIdNumeric: { lte: snapshot.readInboxMaxId },
      },
      data: { readState: 'READ' },
    });
  if (
    unreadCount === current.unreadCount &&
    !readAdvanced &&
    watermark === (current.unreadSnapshotTopMessageId ?? 0) &&
    (snapshot.pts ?? 0) === (current.unreadSnapshotPts ?? 0)
  )
    return { unreadCount, changed: false };
  await tx.telegramCrmConversation.updateMany({
    where: { id: conversation.id, workspaceId: conversation.workspaceId },
    data: {
      unreadCount,
      readState: unreadCount ? 'UNREAD' : 'READ',
      lastReadInboxTelegramMessageId: snapshot.readInboxMaxId,
      unreadSnapshotPts: snapshot.pts ?? 0,
      unreadSnapshotTopMessageId: watermark,
    },
  });
  return { unreadCount, changed: true };
}
