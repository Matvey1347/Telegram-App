import type { PrismaService } from '../../../prisma/prisma.service';
import type {
  TelegramCrmMtprotoHandle,
  TelegramCrmMtprotoUpdate,
} from '@api/telegram/shared/mtproto/telegram-crm-mtproto.types';

/** Account-scoped delete hints map only to known local conversations; no guessed peer or full scan. */
export async function reconcileCrmDeletionHints(
  prisma: PrismaService,
  account: { id: string; workspaceId: string },
  handle: TelegramCrmMtprotoHandle,
  updates: TelegramCrmMtprotoUpdate[],
): Promise<TelegramCrmMtprotoUpdate[]> {
  const ids = [
    ...new Set(
      updates.flatMap((event) =>
        event.type === 'message.deleted' ? event.telegramMessageIds : [],
      ),
    ),
  ];
  if (!ids.length) return updates;
  if (!handle.chatActions?.getReadState)
    throw new Error('CHAT_DELETE_READ_STATE_UNAVAILABLE');
  const conversations = await prisma.telegramCrmConversation.findMany({
    where: {
      workspaceId: account.workspaceId,
      mtprotoAccountId: account.id,
      messages: {
        some: { telegramMessageIdNumeric: { in: ids }, deletedAt: null },
      },
    },
    select: {
      telegramAccessHash: true,
      peer: { select: { telegramUserId: true } },
    },
  });
  const readStates: Array<{
    telegramUserId: string;
    unreadCount: number;
    readInboxMaxId: number;
    pts: number;
    topMessageId: number;
  }> = [];
  for (const conversation of conversations) {
    const peer = conversation.telegramAccessHash
      ? {
          telegramUserId: conversation.peer.telegramUserId,
          telegramAccessHash: conversation.telegramAccessHash,
        }
      : await handle.resolvePrivatePeer({
          telegramUserId: conversation.peer.telegramUserId,
        });
    readStates.push({
      ...(await handle.chatActions.getReadState(peer)),
      telegramUserId: peer.telegramUserId,
    });
  }
  return updates.map((event) =>
    event.type === 'message.deleted' ? { ...event, readStates } : event,
  );
}
