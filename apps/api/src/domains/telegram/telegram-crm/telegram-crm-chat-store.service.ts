import { OperationsNotificationPublisherService } from '../../operations/notifications/operations-notification-publisher.service';
import { TelegramCrmNotificationGroups } from './telegram-crm-notification-groups';
import {
  applyCrmReadSnapshot,
  type CrmChatReadSnapshot,
} from './telegram-crm-chat-read-snapshot';
export {
  applyCrmReadSnapshot,
  type CrmChatReadSnapshot,
} from './telegram-crm-chat-read-snapshot';
import { isDeepStrictEqual } from 'node:util';
import { Injectable, Optional } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { CrmMessageListItem } from '@telegram-system/shared';
import type { TelegramCrmMtprotoMessage } from '@api/telegram/shared/mtproto/telegram-crm-mtproto.types';
import { PrismaService } from '../../../prisma/prisma.service';
import { ResponseCacheService } from '../../../common/response-cache.service';
import { TelegramCrmEventHub } from './telegram-crm-event-hub.service';
import { crmMessageSelect, mapCrmMessage } from './telegram-crm-message.mapper';
import { advanceCrmManualSendCompact } from './telegram-crm-manual-send-compact';
import type { ChatConversation } from './telegram-crm-chat-access.service';

@Injectable()
export class TelegramCrmChatStore {
  constructor(
    private readonly prisma: PrismaService,
    private readonly events: TelegramCrmEventHub,
    @Optional() private readonly cache?: ResponseCacheService,
    @Optional()
    private readonly notifications?: OperationsNotificationPublisherService,
  ) {}
  async confirmed(
    conversation: ChatConversation,
    remote: TelegramCrmMtprotoMessage,
    memberId: string,
    outgoing = false,
  ): Promise<CrmMessageListItem> {
    let changed = false;
    const row = await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw(
        Prisma.sql`SELECT id FROM "TelegramCrmConversation" WHERE id=${conversation.id} AND "workspaceId"=${conversation.workspaceId} FOR UPDATE`,
      );
      const tombstone = await tx.telegramCrmDeletedMessage.findUnique({
        where: {
          mtprotoAccountId_telegramMessageId: {
            mtprotoAccountId: conversation.mtprotoAccountId,
            telegramMessageId: remote.telegramMessageId,
          },
        },
      });
      if (tombstone) throw new Error('CHAT_REMOTE_RESULT_ALREADY_DELETED');
      const existing = await tx.telegramCrmMessage.findUnique({
        where: {
          conversationId_telegramMessageId: {
            conversationId: conversation.id,
            telegramMessageId: String(remote.telegramMessageId),
          },
        },
        select: crmMessageSelect,
      });
      // An old command response must not resurrect a tombstone or a newer edit.
      if (
        existing?.deletedAt ||
        (existing?.editedAt &&
          (!remote.editedAt || existing.editedAt > remote.editedAt))
      )
        return existing;
      const metadata = {
        ...(remote.contentMetadata ?? {}),
        ...manualReceiptMetadata(existing?.contentMetadata),
        telegramText: true,
      };
      const data = {
        text: remote.text,
        editedAt: remote.editedAt,
        contentMetadata: metadata as Prisma.InputJsonValue,
        ...(outgoing
          ? { direction: 'OUTBOUND' as const, deliveryState: 'SENT' as const }
          : {}),
      };
      if (
        existing &&
        existing.text === remote.text &&
        existing.editedAt?.getTime() === remote.editedAt?.getTime() &&
        isDeepStrictEqual(existing.contentMetadata, metadata)
      )
        return existing;
      const stored = existing
        ? await tx.telegramCrmMessage.update({
            where: { id: existing.id },
            data,
            select: crmMessageSelect,
          })
        : await tx.telegramCrmMessage.create({
            data: {
              ...data,
              workspaceId: conversation.workspaceId,
              conversationId: conversation.id,
              mtprotoAccountId: conversation.mtprotoAccountId,
              telegramMessageId: String(remote.telegramMessageId),
              telegramMessageIdNumeric: remote.telegramMessageId,
              sentAt: remote.sentAt,
              direction: remote.direction,
              origin: outgoing ? 'MANUAL' : 'TELEGRAM_SYNC',
              sentByMemberId: outgoing ? memberId : null,
            },
            select: crmMessageSelect,
          });
      if (outgoing && !existing)
        await advanceCrmManualSendCompact(tx, {
          workspaceId: conversation.workspaceId,
          conversationId: conversation.id,
          contactId: conversation.contactId,
          sentAt: remote.sentAt,
          increment: true,
        });
      changed = true;
      return stored;
    });
    const message = { ...mapCrmMessage(row), sentByMember: null };
    if (!changed) return message;
    this.cache?.clearWorkspacePath(
      conversation.workspaceId,
      `/telegram-crm/conversations/${conversation.id}/messages`,
    );
    this.events.emit({
      type: outgoing ? 'message.sent' : 'message.updated',
      workspaceId: conversation.workspaceId,
      occurredAt: new Date().toISOString(),
      conversationId: conversation.id,
      contactId: conversation.contactId,
      ownerMemberId: conversation.contact?.ownerMemberId ?? null,
      message,
    });
    return message;
  }
  async deleted(
    conversation: ChatDeletionConversation,
    telegramMessageIds: number[],
    readSnapshot?: CrmChatReadSnapshot,
  ) {
    const result = await this.prisma.$transaction((tx) =>
      applyCrmChatDeletion(tx, conversation, telegramMessageIds, readSnapshot),
    );
    this.publishDeletion(conversation, result);
    return result?.ids ?? [];
  }
  publishDeletion(
    conversation: ChatDeletionConversation,
    result: ChatDeletionResult | null,
  ) {
    if (!result) return;
    if (result.notificationRecipientIds?.length)
      this.notifications?.invalidate(
        conversation.workspaceId,
        result.notificationRecipientIds,
      );
    this.cache?.clearWorkspacePath(
      conversation.workspaceId,
      `/telegram-crm/conversations/${conversation.id}/messages`,
    );
    this.events.emit({
      type: 'message.deleted',
      workspaceId: conversation.workspaceId,
      occurredAt: new Date().toISOString(),
      conversationId: conversation.id,
      contactId: conversation.contactId,
      ownerMemberId: conversation.contact?.ownerMemberId ?? null,
      messageIds: result.ids,
      unreadCount: result.unreadCount,
      lastMessage: result.lastMessage,
      lastMessageAt: result.lastMessage?.sentAt ?? null,
    });
  }
}

export type ChatDeletionConversation = Pick<
  ChatConversation,
  'id' | 'workspaceId' | 'mtprotoAccountId' | 'contactId'
> & { contact: { ownerMemberId: string | null } | null };
export type ChatDeletionResult = {
  ids: string[];
  lastMessage: CrmMessageListItem | null;
  unreadCount: number;
  notificationRecipientIds?: string[];
};
export async function applyCrmChatDeletion(
  tx: Prisma.TransactionClient,
  conversation: ChatDeletionConversation,
  telegramMessageIds: number[],
  readSnapshot?: CrmChatReadSnapshot,
): Promise<ChatDeletionResult | null> {
  await tx.$queryRaw(
    Prisma.sql`SELECT id FROM "TelegramCrmConversation" WHERE id=${conversation.id} AND "workspaceId"=${conversation.workspaceId} FOR UPDATE`,
  );
  const existingTombstones = await tx.telegramCrmDeletedMessage.findMany({
    where: {
      workspaceId: conversation.workspaceId,
      mtprotoAccountId: conversation.mtprotoAccountId,
      telegramMessageId: { in: telegramMessageIds },
    },
    select: { telegramMessageId: true },
  });
  const known = new Set(existingTombstones.map((row) => row.telegramMessageId));
  const missing = telegramMessageIds.filter((id) => !known.has(id));
  if (missing.length)
    await tx.telegramCrmDeletedMessage.createMany({
      data: missing.map((telegramMessageId) => ({
        workspaceId: conversation.workspaceId,
        mtprotoAccountId: conversation.mtprotoAccountId,
        telegramMessageId,
      })),
      skipDuplicates: true,
    });
  const rows = await tx.telegramCrmMessage.findMany({
    where: {
      workspaceId: conversation.workspaceId,
      conversationId: conversation.id,
      telegramMessageIdNumeric: { in: telegramMessageIds },
      deletedAt: null,
    },
    select: {
      id: true,
      direction: true,
      readState: true,
      contentMetadata: true,
      telegramMessageIdNumeric: true,
    },
  });
  if (!rows.length) {
    const snapshotResult = readSnapshot
      ? await applyCrmReadSnapshot(tx, conversation, readSnapshot)
      : null;
    if (!snapshotResult?.changed) return null;
    const latest = await tx.telegramCrmMessage.findFirst({
      where: {
        workspaceId: conversation.workspaceId,
        conversationId: conversation.id,
        deletedAt: null,
      },
      orderBy: [{ sentAt: 'desc' }, { id: 'desc' }],
      select: crmMessageSelect,
    });
    return {
      ids: [],
      lastMessage: latest
        ? { ...mapCrmMessage(latest), sentByMember: null }
        : null,
      unreadCount: snapshotResult.unreadCount,
      notificationRecipientIds: [],
    };
  }
  await tx.$executeRaw(Prisma.sql`
    UPDATE "TelegramCrmMessage" SET "deletedAt"=NOW(), text=NULL,
      "contentMetadata"=jsonb_strip_nulls(jsonb_build_object(
        'aiDraftId', "contentMetadata"->'aiDraftId',
        'aiDraftRevision', "contentMetadata"->'aiDraftRevision',
        'manualRequestHash', "contentMetadata"->'manualRequestHash',
        'requestReplyToMessageId', "contentMetadata"->'requestReplyToMessageId'))
    WHERE "workspaceId"=${conversation.workspaceId} AND "conversationId"=${conversation.id}
      AND id IN (${Prisma.join(rows.map((row) => row.id))}) AND "deletedAt" IS NULL
  `);
  const latest = await tx.telegramCrmMessage.findFirst({
    where: {
      workspaceId: conversation.workspaceId,
      conversationId: conversation.id,
      deletedAt: null,
    },
    orderBy: [{ sentAt: 'desc' }, { id: 'desc' }],
    select: crmMessageSelect,
  });
  // A deleted grouped preview must never be pushed again, even if other unread rows remain.
  const notificationRecipientIds =
    await new TelegramCrmNotificationGroups().reconcile(
      tx,
      conversation.workspaceId,
      [
        {
          conversationId: conversation.id,
          contactId: conversation.contactId,
          unreadCount: 0,
        },
      ],
    );
  const unreadRemoved = rows.filter(
    (r) => r.direction === 'INBOUND' && r.readState === 'UNREAD',
  ).length;
  const updated = await tx.$queryRaw<Array<{ unreadCount: number }>>(Prisma.sql`
        UPDATE "TelegramCrmConversation" SET "lastMessageAt"=${latest?.sentAt ?? null},
        "unreadCount"=GREATEST(0,"unreadCount"-${unreadRemoved}),
        "readState"=CASE WHEN GREATEST(0,"unreadCount"-${unreadRemoved})=0 THEN 'READ'::"TelegramCrmReadState" ELSE "readState" END,
        "updatedAt"=NOW() WHERE id=${conversation.id} AND "workspaceId"=${conversation.workspaceId} RETURNING "unreadCount"
      `);
  const snapshotResult = readSnapshot
    ? await applyCrmReadSnapshot(
        tx,
        conversation,
        readSnapshot,
        rows.flatMap((row) =>
          row.telegramMessageIdNumeric ? [row.telegramMessageIdNumeric] : [],
        ),
      )
    : null;
  return {
    notificationRecipientIds,
    ids: rows.map((r) => r.id),
    lastMessage: latest
      ? { ...mapCrmMessage(latest), sentByMember: null }
      : null,
    unreadCount: snapshotResult?.unreadCount ?? updated[0]?.unreadCount ?? 0,
  };
}

export function manualReceiptMetadata(
  input: Prisma.JsonValue | undefined,
): Prisma.InputJsonObject {
  const data =
    input && typeof input === 'object' && !Array.isArray(input) ? input : {};
  return Object.fromEntries(
    [
      'aiDraftId',
      'aiDraftRevision',
      'manualRequestHash',
      'requestReplyToMessageId',
    ]
      .filter((key) => data[key] !== undefined)
      .map((key) => [key, data[key]]),
  );
}
