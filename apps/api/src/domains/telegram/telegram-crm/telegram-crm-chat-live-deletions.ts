import { Prisma } from '@prisma/client';
import type { TelegramCrmMtprotoUpdate } from '@api/telegram/shared/mtproto/telegram-crm-mtproto.types';
import {
  applyCrmChatDeletion,
  applyCrmReadSnapshot,
  type ChatDeletionConversation,
  type ChatDeletionResult,
} from './telegram-crm-chat-store.service';

/** Private delete IDs belong to the account, never to a guessed peer. */
export async function applyCrmLiveDeletions(
  tx: Prisma.TransactionClient,
  context: {
    workspaceId: string;
    accountId: string;
    updates: TelegramCrmMtprotoUpdate[];
  },
) {
  const ids = [
    ...new Set(
      context.updates.flatMap((event) =>
        event.type === 'message.deleted' ? event.telegramMessageIds : [],
      ),
    ),
  ];
  if (!ids.length) return [];
  await tx.telegramCrmDeletedMessage.createMany({
    data: ids.map((telegramMessageId) => ({
      workspaceId: context.workspaceId,
      mtprotoAccountId: context.accountId,
      telegramMessageId,
    })),
    skipDuplicates: true,
  });
  const conversations = await tx.telegramCrmConversation.findMany({
    where: {
      workspaceId: context.workspaceId,
      mtprotoAccountId: context.accountId,
      messages: {
        some: { telegramMessageIdNumeric: { in: ids }, deletedAt: null },
      },
    },
    select: {
      id: true,
      workspaceId: true,
      mtprotoAccountId: true,
      contactId: true,
      contact: { select: { ownerMemberId: true } },
      peer: { select: { telegramUserId: true } },
    },
    orderBy: { id: 'asc' },
  });
  const results: Array<{
    conversation: ChatDeletionConversation & {
      peer: { telegramUserId: string };
    };
    result: ChatDeletionResult | null;
  }> = [];
  for (const conversation of conversations)
    results.push({
      conversation,
      result: await applyCrmChatDeletion(tx, conversation, ids),
    });
  return results;
}

/** Applied after the batch writer so snapshot-covered incoming messages are not counted twice. */
export async function reconcileCrmDeletionSnapshots(
  tx: Prisma.TransactionClient,
  updates: TelegramCrmMtprotoUpdate[],
  deletions: Awaited<ReturnType<typeof applyCrmLiveDeletions>>,
) {
  const states = updates.flatMap((event) =>
    event.type === 'message.deleted' ? (event.readStates ?? []) : [],
  );
  for (const deletion of deletions) {
    const state = states.find(
      (item) =>
        item.telegramUserId === deletion.conversation.peer.telegramUserId,
    );
    if (!state || !deletion.result) continue;
    const snapshot = await applyCrmReadSnapshot(
      tx,
      deletion.conversation,
      state,
    );
    deletion.result.unreadCount = snapshot.unreadCount;
  }
}
