import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { Prisma, TelegramCrmReadState } from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';
import type {
  TelegramCrmMtprotoCheckpoint,
  TelegramCrmMtprotoDialog,
} from '../../../telegram/shared/telegram-crm-mtproto.types';
import { TelegramCrmMessageBatchWriter } from './telegram-crm-message-batch-writer.service';

@Injectable()
export class TelegramCrmDialogBatchWriter {
  constructor(
    private readonly prisma: PrismaService,
    private readonly messages: TelegramCrmMessageBatchWriter,
  ) {}

  async store(context: {
    workspaceId: string;
    accountId: string;
    dialogs: TelegramCrmMtprotoDialog[];
    checkpoint?: TelegramCrmMtprotoCheckpoint;
    preserveUnread?: boolean;
    autoContact?: { ownerMemberId: string | null; createdByUserId: string };
    advanceCheckpoint: (
      tx: Prisma.TransactionClient,
      value?: TelegramCrmMtprotoCheckpoint,
    ) => Promise<void>;
  }) {
    const result = await this.prisma.$transaction(
      async (tx) => {
        let importedPeers = 0;
        const telegramUserIds = [
          ...new Set(context.dialogs.map((item) => item.peer.telegramUserId)),
        ];
        const existingPeers = await tx.telegramCrmPeer.findMany({
          where: {
            workspaceId: context.workspaceId,
            telegramUserId: { in: telegramUserIds },
          },
          select: {
            telegramUserId: true,
            username: true,
            firstName: true,
            lastName: true,
            photoUrl: true,
          },
        });
        const existingByTelegramId = new Map(
          existingPeers.map((peer) => [peer.telegramUserId, peer]),
        );
        const missing = context.dialogs.filter(
          (item) => !existingByTelegramId.has(item.peer.telegramUserId),
        );
        if (missing.length) {
          importedPeers = (
            await tx.telegramCrmPeer.createMany({
              data: missing.map(({ peer }) => ({
                workspaceId: context.workspaceId,
                telegramUserId: peer.telegramUserId,
                username: peer.username,
                firstName: peer.firstName,
                lastName: peer.lastName,
                photoUrl: peer.photoUrl,
              })),
              skipDuplicates: true,
            })
          ).count;
        }
        const changedPeerDialogs = context.dialogs.filter(({ peer }) => {
          const current = existingByTelegramId.get(peer.telegramUserId);
          return Boolean(
            current &&
            !(
              current.username === peer.username &&
              current.firstName === peer.firstName &&
              current.lastName === peer.lastName &&
              current.photoUrl === peer.photoUrl
            ),
          );
        });
        if (changedPeerDialogs.length) {
          await tx.$executeRaw(Prisma.sql`
            UPDATE "TelegramCrmPeer" AS peer
            SET
              "username" = incoming."username",
              "firstName" = incoming."firstName",
              "lastName" = incoming."lastName",
              "photoUrl" = incoming."photoUrl",
              "updatedAt" = NOW()
            FROM (
              VALUES ${Prisma.join(
                changedPeerDialogs.map(
                  ({ peer }) =>
                    Prisma.sql`(
                    CAST(${peer.telegramUserId} AS TEXT),
                    CAST(${peer.username} AS TEXT),
                    CAST(${peer.firstName} AS TEXT),
                    CAST(${peer.lastName} AS TEXT),
                    CAST(${peer.photoUrl} AS TEXT)
                  )`,
                ),
              )}
            ) AS incoming("telegramUserId", "username", "firstName", "lastName", "photoUrl")
            WHERE peer."workspaceId" = ${context.workspaceId}
              AND peer."telegramUserId" = incoming."telegramUserId"
          `);
        }
        let peers = await tx.telegramCrmPeer.findMany({
          where: {
            workspaceId: context.workspaceId,
            telegramUserId: { in: telegramUserIds },
          },
          select: { id: true, telegramUserId: true, contactId: true },
        });
        const unlinkedPeers = context.autoContact
          ? peers.filter((peer) => !peer.contactId)
          : [];
        if (unlinkedPeers.length && context.autoContact) {
          const dialogByUserId = new Map(
            context.dialogs.map((dialog) => [
              dialog.peer.telegramUserId,
              dialog,
            ]),
          );
          const normalizedUsername = (value: string | null | undefined) =>
            value?.trim().replace(/^@+/, '').toLowerCase() || null;
          const usernames = [
            ...new Set(
              unlinkedPeers.flatMap((peer) => {
                const username = normalizedUsername(
                  dialogByUserId.get(peer.telegramUserId)?.peer.username,
                );
                return username ? [username] : [];
              }),
            ),
          ];
          const matchingContacts = usernames.length
            ? await tx.telegramAdvertiser.findMany({
                where: {
                  workspaceId: context.workspaceId,
                  OR: usernames.flatMap((username) => [
                    {
                      telegramUsername: {
                        equals: username,
                        mode: 'insensitive',
                      },
                    },
                    {
                      telegramUsername: {
                        equals: `@${username}`,
                        mode: 'insensitive',
                      },
                    },
                  ]),
                },
                select: { id: true, telegramUsername: true },
              })
            : [];
          const contactIdByUsername = new Map<string, string>();
          const ambiguousUsernames = new Set<string>();
          for (const contact of matchingContacts) {
            const username = normalizedUsername(contact.telegramUsername);
            if (!username) continue;
            const existingContactId = contactIdByUsername.get(username);
            if (existingContactId && existingContactId !== contact.id) {
              ambiguousUsernames.add(username);
              contactIdByUsername.delete(username);
            } else if (!ambiguousUsernames.has(username)) {
              contactIdByUsername.set(username, contact.id);
            }
          }
          const matchedContactIdByPeerId = new Map<string, string>();
          for (const peer of unlinkedPeers) {
            const username = normalizedUsername(
              dialogByUserId.get(peer.telegramUserId)?.peer.username,
            );
            const contactId = username
              ? contactIdByUsername.get(username)
              : undefined;
            if (contactId) matchedContactIdByPeerId.set(peer.id, contactId);
          }
          const peersNeedingContact = unlinkedPeers.filter(
            (peer) => !matchedContactIdByPeerId.has(peer.id),
          );
          const contactIdByPeerId = new Map(
            peersNeedingContact.map((peer) => [peer.id, randomUUID()]),
          );
          if (peersNeedingContact.length) {
            await tx.telegramAdvertiser.createMany({
              data: peersNeedingContact.map((peer) => {
                const dialog = dialogByUserId.get(peer.telegramUserId)!;
                const displayName =
                  [dialog.peer.firstName, dialog.peer.lastName]
                    .filter(Boolean)
                    .join(' ')
                    .trim() ||
                  (dialog.peer.username ? `@${dialog.peer.username}` : null) ||
                  `Telegram ${dialog.peer.telegramUserId}`;
                return {
                  id: contactIdByPeerId.get(peer.id)!,
                  workspaceId: context.workspaceId,
                  displayName,
                  telegramUsername: dialog.peer.username,
                  source: 'TELEGRAM_MTPROTO_IMPORT',
                  ownerMemberId: context.autoContact!.ownerMemberId,
                  createdByUserId: context.autoContact!.createdByUserId,
                };
              }),
            });
          }
          const peerContactLinks = [
            ...matchedContactIdByPeerId,
            ...contactIdByPeerId,
          ];
          if (peerContactLinks.length) {
            await tx.$executeRaw(Prisma.sql`
            UPDATE "TelegramCrmPeer" AS peer
            SET "contactId" = links."contactId", "updatedAt" = NOW()
            FROM (
              VALUES ${Prisma.join(
                peerContactLinks.map(
                  ([peerId, contactId]) =>
                    Prisma.sql`(${peerId}, ${contactId})`,
                ),
              )}
            ) AS links("id", "contactId")
            WHERE peer."id" = links."id"
              AND peer."workspaceId" = ${context.workspaceId}
              AND peer."contactId" IS NULL
          `);
          }
          peers = peers.map((peer) => ({
            ...peer,
            contactId:
              peer.contactId ??
              matchedContactIdByPeerId.get(peer.id) ??
              contactIdByPeerId.get(peer.id) ??
              null,
          }));
        }
        const peerByTelegramId = new Map(
          peers.map((peer) => [peer.telegramUserId, peer]),
        );
        const importedConversations = (
          await tx.telegramCrmConversation.createMany({
            data: context.dialogs.map((dialog) => {
              const peer = peerByTelegramId.get(dialog.peer.telegramUserId)!;
              return {
                workspaceId: context.workspaceId,
                telegramCrmPeerId: peer.id,
                contactId: peer.contactId,
                mtprotoAccountId: context.accountId,
                telegramDialogId: dialog.telegramDialogId,
                telegramAccessHash: dialog.peer.telegramAccessHash,
                unreadCount: context.preserveUnread ? 0 : dialog.unreadCount,
                readState:
                  !context.preserveUnread && dialog.unreadCount > 0
                    ? TelegramCrmReadState.UNREAD
                    : TelegramCrmReadState.READ,
              };
            }),
            skipDuplicates: true,
          })
        ).count;
        const conversations = await tx.telegramCrmConversation.findMany({
          where: {
            workspaceId: context.workspaceId,
            mtprotoAccountId: context.accountId,
            telegramCrmPeerId: { in: peers.map((peer) => peer.id) },
          },
          select: {
            id: true,
            telegramCrmPeerId: true,
            telegramAccessHash: true,
            unreadCount: true,
            contactId: true,
            lastMessageAt: true,
            lastInboundAt: true,
            lastOutboundAt: true,
            contact: { select: { ownerMemberId: true } },
          },
        });
        const conversationByPeerId = new Map(
          conversations.map((conversation) => [
            conversation.telegramCrmPeerId,
            conversation,
          ]),
        );
        const changedConversations = context.dialogs.flatMap((dialog) => {
          const peer = peerByTelegramId.get(dialog.peer.telegramUserId)!;
          const conversation = conversationByPeerId.get(peer.id)!;
          const updateContact = conversation.contactId !== peer.contactId;
          const updateAccessHash =
            conversation.telegramAccessHash !== dialog.peer.telegramAccessHash;
          const updateUnread =
            !context.preserveUnread &&
            conversation.unreadCount !== dialog.unreadCount;
          if (!updateContact && !updateAccessHash && !updateUnread) return [];
          if (updateContact) conversation.contactId = peer.contactId;
          if (updateAccessHash) {
            conversation.telegramAccessHash = dialog.peer.telegramAccessHash;
          }
          if (updateUnread) conversation.unreadCount = dialog.unreadCount;
          return [
            {
              id: conversation.id,
              contactId: peer.contactId,
              accessHash: dialog.peer.telegramAccessHash,
              unreadCount: dialog.unreadCount,
              updateContact,
              updateAccessHash,
              updateUnread,
            },
          ];
        });
        if (changedConversations.length) {
          await tx.$executeRaw(Prisma.sql`
            UPDATE "TelegramCrmConversation" AS conversation
            SET
              "contactId" = CASE WHEN incoming."updateContact" THEN incoming."contactId" ELSE conversation."contactId" END,
              "telegramAccessHash" = CASE WHEN incoming."updateAccessHash" THEN incoming."accessHash" ELSE conversation."telegramAccessHash" END,
              "unreadCount" = CASE WHEN incoming."updateUnread" THEN incoming."unreadCount" ELSE conversation."unreadCount" END,
              "readState" = CASE
                WHEN NOT incoming."updateUnread" THEN conversation."readState"
                WHEN incoming."unreadCount" > 0 THEN 'UNREAD'::"TelegramCrmReadState"
                ELSE 'READ'::"TelegramCrmReadState"
              END,
              "updatedAt" = NOW()
            FROM (
              VALUES ${Prisma.join(
                changedConversations.map(
                  (item) =>
                    Prisma.sql`(
                    CAST(${item.id} AS TEXT),
                    CAST(${item.contactId} AS TEXT),
                    CAST(${item.accessHash} AS TEXT),
                    CAST(${item.unreadCount} AS INTEGER),
                    CAST(${item.updateContact} AS BOOLEAN),
                    CAST(${item.updateAccessHash} AS BOOLEAN),
                    CAST(${item.updateUnread} AS BOOLEAN)
                  )`,
                ),
              )}
            ) AS incoming("id", "contactId", "accessHash", "unreadCount", "updateContact", "updateAccessHash", "updateUnread")
            WHERE conversation."id" = incoming."id"
              AND conversation."workspaceId" = ${context.workspaceId}
          `);
        }
        const stored = await this.messages.store(
          tx,
          context,
          context.dialogs.flatMap((dialog) => {
            if (!dialog.lastMessage) return [];
            const peer = peerByTelegramId.get(dialog.peer.telegramUserId)!;
            return [
              {
                conversation: conversationByPeerId.get(peer.id)!,
                message: dialog.lastMessage,
              },
            ];
          }),
          'snapshot',
        );
        const invalidatedNotificationMemberIds = context.preserveUnread
          ? []
          : await this.messages.reconcileIncomingNotificationGroups(
              tx,
              context.workspaceId,
              context.dialogs.map((dialog) => {
                const peer = peerByTelegramId.get(dialog.peer.telegramUserId)!;
                const conversation = conversationByPeerId.get(peer.id)!;
                return {
                  conversationId: conversation.id,
                  contactId: conversation.contactId,
                  unreadCount: dialog.unreadCount,
                };
              }),
            );
        await context.advanceCheckpoint(tx, context.checkpoint);
        return {
          importedPeers,
          importedConversations,
          stored,
          invalidatedNotificationMemberIds,
        };
      },
      { timeout: 30_000 },
    );
    this.messages.emitAfterCommit(
      context.workspaceId,
      result.stored,
      'snapshot',
    );
    this.messages.invalidateContactReadCache(context.workspaceId);
    this.messages.emitNotificationInvalidationsAfterCommit(
      context.workspaceId,
      result.invalidatedNotificationMemberIds,
    );
    return {
      importedPeers: result.importedPeers,
      importedConversations: result.importedConversations,
      importedMessages: result.stored.created.length,
    };
  }
}
