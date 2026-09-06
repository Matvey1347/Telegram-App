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
    const result = await this.prisma.$transaction(async (tx) => {
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
      await Promise.all(
        context.dialogs.flatMap(({ peer }) => {
          const current = existingByTelegramId.get(peer.telegramUserId);
          if (
            !current ||
            (current.username === peer.username &&
              current.firstName === peer.firstName &&
              current.lastName === peer.lastName &&
              current.photoUrl === peer.photoUrl)
          ) {
            return [];
          }
          return [
            tx.telegramCrmPeer.update({
              where: {
                workspaceId_telegramUserId: {
                  workspaceId: context.workspaceId,
                  telegramUserId: peer.telegramUserId,
                },
              },
              data: {
                username: peer.username,
                firstName: peer.firstName,
                lastName: peer.lastName,
                photoUrl: peer.photoUrl,
              },
            }),
          ];
        }),
      );
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
          context.dialogs.map((dialog) => [dialog.peer.telegramUserId, dialog]),
        );
        const contactIdByPeerId = new Map(
          unlinkedPeers.map((peer) => [peer.id, randomUUID()]),
        );
        await tx.telegramAdvertiser.createMany({
          data: unlinkedPeers.map((peer) => {
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
        await Promise.all(
          unlinkedPeers.map((peer) =>
            tx.telegramCrmPeer.updateMany({
              where: {
                id: peer.id,
                workspaceId: context.workspaceId,
                contactId: null,
              },
              data: { contactId: contactIdByPeerId.get(peer.id)! },
            }),
          ),
        );
        peers = peers.map((peer) => ({
          ...peer,
          contactId: peer.contactId ?? contactIdByPeerId.get(peer.id) ?? null,
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
      await Promise.all(
        context.dialogs.flatMap((dialog) => {
          const peer = peerByTelegramId.get(dialog.peer.telegramUserId)!;
          const conversation = conversationByPeerId.get(peer.id)!;
          const data: Prisma.TelegramCrmConversationUpdateInput = {};
          if (conversation.contactId !== peer.contactId) {
            data.contact = peer.contactId
              ? { connect: { id: peer.contactId } }
              : { disconnect: true };
          }
          if (
            conversation.telegramAccessHash !== dialog.peer.telegramAccessHash
          ) {
            data.telegramAccessHash = dialog.peer.telegramAccessHash;
          }
          if (
            !context.preserveUnread &&
            conversation.unreadCount !== dialog.unreadCount
          ) {
            data.unreadCount = dialog.unreadCount;
            data.readState =
              dialog.unreadCount > 0
                ? TelegramCrmReadState.UNREAD
                : TelegramCrmReadState.READ;
          }
          return Object.keys(data).length
            ? [
                tx.telegramCrmConversation.update({
                  where: { id: conversation.id },
                  data,
                }),
              ]
            : [];
        }),
      );
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
      await context.advanceCheckpoint(tx, context.checkpoint);
      return { importedPeers, importedConversations, stored };
    });
    this.messages.emitAfterCommit(
      context.workspaceId,
      result.stored,
      'snapshot',
    );
    return {
      importedPeers: result.importedPeers,
      importedConversations: result.importedConversations,
      importedMessages: result.stored.created.length,
    };
  }
}
