import { isDeepStrictEqual } from 'node:util';
import { Prisma } from '@prisma/client';
import { acquirePostgresTransactionLock } from '../../../prisma/postgres-advisory-lock';
import type {
  TelegramCrmMtprotoDialog,
  TelegramCrmMtprotoDialogFolder,
} from '../../../telegram/shared/mtproto/telegram-crm-mtproto.types';
import { telegramFolderTagDefinition } from './telegram-crm-system-tags.service';

export const crmFolderSelect = {
  id: true,
  workspaceId: true,
  mtprotoAccountId: true,
  telegramFolderId: true,
  name: true,
  color: true,
  emojiPresentation: true,
  excludeRead: true,
  isActive: true,
} satisfies Prisma.TelegramCrmFolderSelect;

/** Canonical membership is independent of contact promotion and selected import tags. */
export async function syncCrmDialogFolders(
  tx: Prisma.TransactionClient,
  input: {
    workspaceId: string;
    accountId: string;
    folders?: TelegramCrmMtprotoDialogFolder[];
    dialogs: TelegramCrmMtprotoDialog[];
    isCurrent?: () => boolean;
  },
  conversationIdByUserId: Map<string, string>,
) {
  const snapshots = input.dialogs.flatMap((dialog) => {
    const folderIds = dialog.folderMembershipIds ?? dialog.folderIds;
    const conversationId = conversationIdByUserId.get(
      dialog.peer.telegramUserId,
    );
    return Array.isArray(folderIds) && conversationId
      ? [{ conversationId, folderIds: [...new Set(folderIds)] }]
      : [];
  });
  if (input.folders === undefined && !snapshots.length) return;
  await acquirePostgresTransactionLock(
    tx,
    `crm-folders:${input.workspaceId}:${input.accountId}`,
  );
  if (input.isCurrent && !input.isCurrent()) return;
  const scope = {
    workspaceId: input.workspaceId,
    mtprotoAccountId: input.accountId,
  };
  let folders = await tx.telegramCrmFolder.findMany({
    where: scope,
    select: crmFolderSelect,
  });
  if (input.folders !== undefined) {
    const definitions = [
      ...new Map(input.folders.map((folder) => [folder.id, folder])).values(),
    ].map((folder) => ({
      telegramFolderId: folder.id,
      name: folder.title,
      color: telegramFolderTagDefinition(input.accountId, folder).color,
      emojiPresentation:
        folder.emojiPresentation ??
        (folder.emoticon
          ? { type: 'unicode' as const, value: folder.emoticon }
          : null),
      excludeRead: folder.excludeRead ?? false,
    }));
    const byNative = new Map(
      folders.map((folder) => [folder.telegramFolderId, folder]),
    );
    const missing = definitions.filter(
      (folder) => !byNative.has(folder.telegramFolderId),
    );
    if (missing.length) {
      const tags = await tx.telegramAdvertiserTag.findMany({
        where: {
          workspaceId: input.workspaceId,
          systemKey: {
            in: missing.map(
              (folder) =>
                `TELEGRAM_FOLDER:${input.accountId}:${folder.telegramFolderId}`,
            ),
          },
        },
        select: { id: true, systemKey: true },
      });
      const tagIds = new Map(
        tags.map((tag) => [Number(tag.systemKey?.split(':').at(-1)), tag.id]),
      );
      await tx.telegramCrmFolder.createMany({
        data: missing.map((folder) => ({
          ...scope,
          ...folder,
          id: tagIds.get(folder.telegramFolderId),
          emojiPresentation: folder.emojiPresentation ?? Prisma.DbNull,
        })),
        skipDuplicates: true,
      });
    }
    const changed = definitions.filter((definition) => {
      const current = byNative.get(definition.telegramFolderId);
      return (
        current &&
        (!current.isActive ||
          current.name !== definition.name ||
          current.color !== definition.color ||
          current.excludeRead !== definition.excludeRead ||
          !isDeepStrictEqual(
            current.emojiPresentation,
            definition.emojiPresentation,
          ))
      );
    });
    if (changed.length)
      await tx.$executeRaw(Prisma.sql`
      UPDATE "TelegramCrmFolder" AS folder
      SET "name" = incoming."name", "color" = incoming."color", "emojiPresentation" = incoming."emoji", "excludeRead" = incoming."excludeRead", "isActive" = true, "updatedAt" = NOW()
      FROM (VALUES ${Prisma.join(changed.map((folder) => Prisma.sql`(${folder.telegramFolderId}::integer, ${folder.name}::text, ${folder.color}::text, ${folder.emojiPresentation === null ? null : JSON.stringify(folder.emojiPresentation)}::jsonb, ${folder.excludeRead}::boolean)`))}) AS incoming("nativeId", "name", "color", "emoji", "excludeRead")
      WHERE folder."workspaceId" = ${input.workspaceId} AND folder."mtprotoAccountId" = ${input.accountId} AND folder."telegramFolderId" = incoming."nativeId"
    `);
    const removed = folders.filter(
      (folder) =>
        folder.isActive &&
        !definitions.some(
          (definition) =>
            definition.telegramFolderId === folder.telegramFolderId,
        ),
    );
    if (removed.length)
      await tx.telegramCrmConversationFolder.deleteMany({
        where: {
          ...scope,
          folderId: { in: removed.map((folder) => folder.id) },
        },
      });
    if (removed.length)
      await tx.telegramCrmFolder.updateMany({
        where: {
          ...scope,
          id: { in: removed.map((folder) => folder.id) },
          isActive: true,
        },
        data: { isActive: false },
      });
    if (missing.length || changed.length || removed.length)
      folders = await tx.telegramCrmFolder.findMany({
        where: scope,
        select: crmFolderSelect,
      });
  }
  const byNative = new Map(
    folders.map((folder) => [folder.telegramFolderId, folder.id]),
  );
  // Incomplete metadata cannot justify deleting a previously known membership.
  const valid = snapshots.filter((snapshot) =>
    snapshot.folderIds.every((id) => byNative.has(id)),
  );
  if (!valid.length) return;
  const current = await tx.telegramCrmConversationFolder.findMany({
    where: {
      ...scope,
      conversationId: { in: valid.map((snapshot) => snapshot.conversationId) },
    },
    select: { conversationId: true, folderId: true },
  });
  const desired = valid.flatMap((snapshot) =>
    snapshot.folderIds.map((id) => ({
      ...scope,
      conversationId: snapshot.conversationId,
      folderId: byNative.get(id)!,
    })),
  );
  const key = (row: { conversationId: string; folderId: string }) =>
    `${row.conversationId}:${row.folderId}`;
  const desiredKeys = new Set(desired.map(key)),
    currentKeys = new Set(current.map(key));
  const stale = current.filter((row) => !desiredKeys.has(key(row)));
  const added = desired.filter((row) => !currentKeys.has(key(row)));
  for (let offset = 0; offset < stale.length; offset += 1000)
    await tx.telegramCrmConversationFolder.deleteMany({
      where: {
        ...scope,
        OR: stale
          .slice(offset, offset + 1000)
          .map(({ conversationId, folderId }) => ({
            conversationId,
            folderId,
          })),
      },
    });
  for (let offset = 0; offset < added.length; offset += 1000)
    await tx.telegramCrmConversationFolder.createMany({
      data: added.slice(offset, offset + 1000),
      skipDuplicates: true,
    });
}
