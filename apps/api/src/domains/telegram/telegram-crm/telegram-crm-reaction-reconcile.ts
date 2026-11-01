import { reconcileCrmDeletionHints } from './telegram-crm-deletion-reconcile';
import type { PrismaService } from '../../../prisma/prisma.service';
import type {
  TelegramCrmMtprotoHandle,
  TelegramCrmMtprotoUpdate,
} from '@api/telegram/shared/mtproto/telegram-crm-mtproto.types';

/** Unversioned reaction events are hints; persist a current targeted read, never stale counts. */
export async function reconcileCrmReactionHints(
  prisma: PrismaService,
  account: { id: string; workspaceId: string },
  handle: TelegramCrmMtprotoHandle,
  rawUpdates: TelegramCrmMtprotoUpdate[],
): Promise<TelegramCrmMtprotoUpdate[]> {
  const updates = await reconcileCrmDeletionHints(
    prisma,
    account,
    handle,
    rawUpdates,
  );
  const hints = updates.flatMap((update) =>
    update.type === 'message.reactions'
      ? [update]
      : update.type === 'message.edited'
        ? [
            {
              type: 'message.reactions' as const,
              telegramUserId: update.message.telegramUserId,
              telegramMessageId: update.message.telegramMessageId,
              reactions: [],
            },
          ]
        : [],
  );
  if (!hints.length) return updates;
  if (!handle.chatActions)
    throw new Error('Telegram reaction reconciliation unavailable');
  const unique = new Map(
    hints.map((hint) => [
      `${hint.telegramUserId}:${hint.telegramMessageId}`,
      hint,
    ]),
  );
  const conversations = await prisma.telegramCrmConversation.findMany({
    where: {
      workspaceId: account.workspaceId,
      mtprotoAccountId: account.id,
      peer: {
        telegramUserId: {
          in: [...new Set(hints.map((hint) => hint.telegramUserId))],
        },
      },
    },
    select: {
      telegramAccessHash: true,
      peer: { select: { telegramUserId: true } },
    },
  });
  const byUser = new Map(
    conversations.map((row) => [row.peer.telegramUserId, row]),
  );
  const result = updates.filter(
    (update) =>
      update.type !== 'message.reactions' && update.type !== 'message.edited',
  );
  // Existing account batch serializes these bounded reads; no timer or unbounded task queue.
  for (const hint of unique.values()) {
    const conversation = byUser.get(hint.telegramUserId);
    if (!conversation) continue;
    const peer = conversation.telegramAccessHash
      ? {
          telegramUserId: hint.telegramUserId,
          telegramAccessHash: conversation.telegramAccessHash,
        }
      : await handle.resolvePrivatePeer({
          telegramUserId: hint.telegramUserId,
        });
    const message = await handle.chatActions.getMessage({
      ...peer,
      telegramMessageId: hint.telegramMessageId,
    });
    if (message) result.push({ type: 'message.edited', message });
  }
  return result;
}
