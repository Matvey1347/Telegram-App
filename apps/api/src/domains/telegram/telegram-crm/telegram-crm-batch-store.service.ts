import { Injectable } from '@nestjs/common';
import {
  Prisma,
  TelegramCrmMessageDirection,
  TelegramCrmReadState,
} from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';
import type {
  TelegramCrmMtprotoCheckpoint,
  TelegramCrmMtprotoDialog,
  TelegramCrmMtprotoMessage,
  TelegramCrmMtprotoUpdate,
} from '../../../telegram/shared/telegram-crm-mtproto.types';
import { TelegramCrmDialogBatchWriter } from './telegram-crm-dialog-batch-writer.service';
import { TelegramCrmMessageBatchWriter } from './telegram-crm-message-batch-writer.service';

type BatchContext = { workspaceId: string; accountId: string };
const serializeCheckpoint = (value: TelegramCrmMtprotoCheckpoint) =>
  JSON.stringify(value);

@Injectable()
export class TelegramCrmBatchStoreService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly dialogs: TelegramCrmDialogBatchWriter,
    private readonly messages: TelegramCrmMessageBatchWriter,
  ) {}

  importDialogs(
    context: BatchContext & {
      dialogs: TelegramCrmMtprotoDialog[];
      checkpoint?: TelegramCrmMtprotoCheckpoint;
      preserveUnread?: boolean;
    },
  ) {
    return this.dialogs.store({
      ...context,
      advanceCheckpoint: (tx, value) =>
        this.advanceCheckpoint(tx, context, value),
    });
  }

  async applyUpdates(
    context: BatchContext & {
      updates: TelegramCrmMtprotoUpdate[];
      checkpoint?: TelegramCrmMtprotoCheckpoint;
    },
  ) {
    if (context.updates.some((update) => update.type === 'sync.gap')) {
      return { changed: 0, needsRecovery: true };
    }
    const result = await this.prisma.$transaction(async (tx) => {
      const userIds = [
        ...new Set(
          context.updates.flatMap((update) =>
            update.type === 'message.new' || update.type === 'message.edited'
              ? [update.message.telegramUserId]
              : 'telegramUserId' in update
                ? [update.telegramUserId]
                : [],
          ),
        ),
      ];
      const conversations = await tx.telegramCrmConversation.findMany({
        where: {
          workspaceId: context.workspaceId,
          mtprotoAccountId: context.accountId,
          peer: { telegramUserId: { in: userIds } },
        },
        select: {
          id: true,
          telegramCrmPeerId: true,
          contactId: true,
          unreadCount: true,
          lastInboundAt: true,
          lastOutboundAt: true,
          lastMessageAt: true,
          lastReadInboxTelegramMessageId: true,
          lastReadOutboxTelegramMessageId: true,
          peer: { select: { telegramUserId: true } },
          contact: { select: { ownerMemberId: true } },
        },
      });
      const byUserId = new Map(
        conversations.map((conversation) => [
          conversation.peer.telegramUserId,
          conversation,
        ]),
      );
      const metadataUpdates = context.updates.filter(
        (update) => update.type === 'peer.metadata',
      );
      const metadataPeers = metadataUpdates.length
        ? await tx.telegramCrmPeer.findMany({
            where: {
              workspaceId: context.workspaceId,
              telegramUserId: {
                in: metadataUpdates.map((update) => update.telegramUserId),
              },
            },
            select: {
              id: true,
              telegramUserId: true,
              username: true,
              firstName: true,
              lastName: true,
              contactId: true,
              contact: { select: { ownerMemberId: true } },
            },
          })
        : [];
      const metadataByUserId = new Map(
        metadataPeers.map((peer) => [peer.telegramUserId, peer]),
      );
      const messageInputs = context.updates.flatMap((update) => {
        if (update.type !== 'message.new' && update.type !== 'message.edited') {
          return [];
        }
        const conversation = byUserId.get(update.message.telegramUserId);
        return conversation
          ? [
              {
                conversation,
                message: update.message,
                edited: update.type === 'message.edited',
              },
            ]
          : [];
      });
      const unresolved = context.updates.some(
        (update) =>
          (update.type === 'message.new' || update.type === 'message.edited') &&
          !byUserId.has(update.message.telegramUserId),
      );
      const stored = await this.messages.store(
        tx,
        context,
        messageInputs,
        'live',
      );
      const readEvents = [] as Array<{
        conversationId: string;
        peerId: string;
        contactId: string | null;
        ownerMemberId: string | null;
        unreadCount: number;
        unreadChanged: boolean;
      }>;
      const changedPeers = new Map<
        string,
        {
          id: string;
          contactId: string | null;
          ownerMemberId: string | null;
        }
      >();
      for (const update of context.updates) {
        if (update.type === 'peer.metadata') {
          const peer = metadataByUserId.get(update.telegramUserId);
          if (!peer) continue;
          const data = {
            ...(update.username !== undefined &&
            update.username !== peer.username
              ? { username: update.username }
              : {}),
            ...(update.firstName !== undefined &&
            update.firstName !== peer.firstName
              ? { firstName: update.firstName }
              : {}),
            ...(update.lastName !== undefined &&
            update.lastName !== peer.lastName
              ? { lastName: update.lastName }
              : {}),
          };
          if (Object.keys(data).length) {
            await tx.telegramCrmPeer.update({
              where: { id: peer.id },
              data,
            });
            changedPeers.set(peer.id, {
              id: peer.id,
              contactId: peer.contactId,
              ownerMemberId: peer.contact?.ownerMemberId ?? null,
            });
          }
        }
        if (
          update.type !== 'history.inboxRead' &&
          update.type !== 'history.outboxRead'
        ) {
          continue;
        }
        const conversation = byUserId.get(update.telegramUserId);
        if (!conversation) continue;
        const previous =
          update.type === 'history.inboxRead'
            ? conversation.lastReadInboxTelegramMessageId
            : conversation.lastReadOutboxTelegramMessageId;
        if (previous != null && previous >= update.maxTelegramMessageId)
          continue;
        const inbox = update.type === 'history.inboxRead';
        const unreadCount = inbox
          ? Math.max(0, update.stillUnreadCount ?? 0)
          : conversation.unreadCount;
        await tx.telegramCrmConversation.update({
          where: { id: conversation.id },
          data: inbox
            ? {
                lastReadInboxTelegramMessageId: update.maxTelegramMessageId,
                lastReadTelegramMessageId: String(update.maxTelegramMessageId),
                lastReadAt: new Date(),
                unreadCount,
                readState:
                  unreadCount > 0
                    ? TelegramCrmReadState.UNREAD
                    : TelegramCrmReadState.READ,
              }
            : { lastReadOutboxTelegramMessageId: update.maxTelegramMessageId },
        });
        await tx.telegramCrmMessage.updateMany({
          where: {
            conversationId: conversation.id,
            direction: inbox
              ? TelegramCrmMessageDirection.INBOUND
              : TelegramCrmMessageDirection.OUTBOUND,
            telegramMessageIdNumeric: { lte: update.maxTelegramMessageId },
            readState: { not: TelegramCrmReadState.READ },
          },
          data: { readState: TelegramCrmReadState.READ },
        });
        readEvents.push({
          conversationId: conversation.id,
          peerId: conversation.telegramCrmPeerId,
          contactId: conversation.contactId,
          ownerMemberId: conversation.contact?.ownerMemberId ?? null,
          unreadCount,
          unreadChanged: inbox && unreadCount !== conversation.unreadCount,
        });
      }
      if (!unresolved) {
        await this.advanceCheckpoint(tx, context, context.checkpoint);
      }
      return {
        stored,
        readEvents,
        changedPeers: [...changedPeers.values()],
        unresolved,
      };
    });
    this.messages.emitAfterCommit(context.workspaceId, result.stored, 'live');
    this.messages.emitReadsAfterCommit(context.workspaceId, result.readEvents);
    this.messages.emitPeerMetadataAfterCommit(
      context.workspaceId,
      result.changedPeers,
    );
    return {
      changed:
        result.stored.created.length +
        result.stored.edited +
        result.readEvents.length,
      needsRecovery: result.unresolved,
    };
  }

  async importHistory(
    input: BatchContext & {
      conversation: { id: string; contactId: string | null };
      messages: TelegramCrmMtprotoMessage[];
      nextBeforeTelegramMessageId: number | null;
      exhausted: boolean;
    },
  ) {
    const result = await this.prisma.$transaction(async (tx) => {
      const stored = await this.messages.store(
        tx,
        input,
        input.messages.map((message) => ({
          conversation: input.conversation,
          message,
        })),
        'history',
      );
      const conversation = await tx.telegramCrmConversation.findUnique({
        where: { id: input.conversation.id },
        select: {
          historyCursorTelegramMessageId: true,
          historyExhausted: true,
        },
      });
      const cursorAdvanced =
        input.nextBeforeTelegramMessageId != null &&
        (conversation?.historyCursorTelegramMessageId == null ||
          input.nextBeforeTelegramMessageId <
            conversation.historyCursorTelegramMessageId);
      if (
        cursorAdvanced ||
        conversation?.historyExhausted !== input.exhausted
      ) {
        await tx.telegramCrmConversation.update({
          where: { id: input.conversation.id },
          data: {
            ...(cursorAdvanced
              ? {
                  historyCursorTelegramMessageId:
                    input.nextBeforeTelegramMessageId,
                }
              : {}),
            historyExhausted: input.exhausted,
          },
        });
      }
      return stored;
    });
    return { imported: result.created.length, edited: result.edited };
  }

  private async advanceCheckpoint(
    tx: Prisma.TransactionClient,
    context: BatchContext,
    value?: TelegramCrmMtprotoCheckpoint,
  ) {
    if (!value) return;
    const serialized = serializeCheckpoint(value);
    const existing = await tx.telegramCrmAccountSyncState.findUnique({
      where: { mtprotoAccountId: context.accountId },
      select: {
        incrementalCheckpoint: true,
        recoveryCheckpoint: true,
        status: true,
        lastErrorCode: true,
        lastErrorMessage: true,
      },
    });
    if (
      existing?.incrementalCheckpoint === serialized &&
      existing.recoveryCheckpoint == null &&
      existing.status === 'IDLE' &&
      existing.lastErrorCode == null &&
      existing.lastErrorMessage == null
    ) {
      return;
    }
    await tx.telegramCrmAccountSyncState.upsert({
      where: { mtprotoAccountId: context.accountId },
      create: {
        mtprotoAccountId: context.accountId,
        workspaceId: context.workspaceId,
        incrementalCheckpoint: serialized,
        status: 'IDLE',
        lastMeaningfulSyncAt: new Date(),
      },
      update: {
        incrementalCheckpoint: serialized,
        recoveryCheckpoint: null,
        status: 'IDLE',
        lastErrorCode: null,
        lastErrorMessage: null,
        lastMeaningfulSyncAt: new Date(),
      },
    });
  }
}
