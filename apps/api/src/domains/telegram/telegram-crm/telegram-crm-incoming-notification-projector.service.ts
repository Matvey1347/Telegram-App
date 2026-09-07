import { Injectable } from '@nestjs/common';
import {
  OperationsNotificationType,
  Prisma,
  TelegramCrmConversationState,
  TelegramCrmMessageDirection,
} from '@prisma/client';
import { OperationsNotificationStoreService } from '../../operations/notifications/operations-notification-store.service';
import type {
  CrmMessageBatchInput,
  CrmMessageBatchMode,
} from './telegram-crm-message-batch-writer.service';
import type { CrmMessageRow } from './telegram-crm-message.mapper';
import { TelegramCrmNotificationRecipientService } from './telegram-crm-notification-recipient.service';
import { crmContactNotificationVisibilityKey } from './telegram-crm-notification-visibility';

@Injectable()
export class TelegramCrmIncomingNotificationProjector {
  constructor(
    private readonly recipients: TelegramCrmNotificationRecipientService,
    private readonly notifications: OperationsNotificationStoreService,
  ) {}

  async project(
    tx: Prisma.TransactionClient,
    workspaceId: string,
    mode: CrmMessageBatchMode,
    inputs: readonly CrmMessageBatchInput[],
    created: readonly CrmMessageRow[],
  ) {
    if (mode !== 'live' || !created.length) return [];
    const inputByKey = new Map(
      inputs.map((input) => [
        `${input.conversation.id}:${input.message.telegramMessageId}`,
        input,
      ]),
    );
    const inbound = created.flatMap((message) => {
      if (message.direction !== TelegramCrmMessageDirection.INBOUND) return [];
      const input = inputByKey.get(
        `${message.conversationId}:${message.telegramMessageId}`,
      );
      return input && !input.edited ? [{ message, input }] : [];
    });
    if (!inbound.length) return [];
    const snapshot = await this.recipients.load(
      tx,
      workspaceId,
      inbound.flatMap(({ input }) =>
        input.conversation.contactId ? [input.conversation.contactId] : [],
      ),
    );
    const contactIds = [
      ...new Set(
        inbound.flatMap(({ input }) =>
          input.conversation.contactId ? [input.conversation.contactId] : [],
        ),
      ),
    ];
    const contactUnreadRows = contactIds.length
      ? await tx.telegramCrmConversation.groupBy({
          by: ['contactId'],
          where: {
            workspaceId,
            state: TelegramCrmConversationState.ACTIVE,
            contactId: { in: contactIds },
          },
          _sum: { unreadCount: true },
        })
      : [];
    const unreadByContact = new Map(
      contactUnreadRows.flatMap((row) =>
        row.contactId ? [[row.contactId, row._sum.unreadCount ?? 0]] : [],
      ),
    );
    const now = new Date();
    const groups = new Map<string, typeof inbound>();
    for (const item of inbound) {
      const key = item.input.conversation.contactId
        ? `contact:${item.input.conversation.contactId}`
        : `conversation:${item.message.conversationId}`;
      const values = groups.get(key) ?? [];
      values.push(item);
      groups.set(key, values);
    }
    const rows = [...groups].flatMap(([sourceKey, group]) => {
      const { message, input } = group.reduce((latest, item) =>
        item.message.sentAt > latest.message.sentAt ? item : latest,
      );
      const contact = snapshot.contact(input.conversation.contactId);
      const recipient = snapshot.recipient(contact);
      if (!recipient) return [];
      const senderName =
        contact?.displayName ||
        [input.conversation.peer?.firstName, input.conversation.peer?.lastName]
          .filter(Boolean)
          .join(' ')
          .trim() ||
        (input.conversation.peer?.username
          ? `@${input.conversation.peer.username}`
          : 'Telegram user');
      const messageCount = contact
        ? (unreadByContact.get(contact.id) ?? group.length)
        : Math.max(0, input.conversation.unreadCount ?? 0) + group.length;
      const targetUrl = contact
        ? this.contactTarget(workspaceId, contact.id, message.conversationId)
        : this.inboxTarget(
            workspaceId,
            message.conversationId,
            input.conversation.telegramCrmPeerId ??
              input.message.telegramUserId,
          );
      return [
        {
          workspaceId,
          recipientMemberId: recipient.id,
          type: OperationsNotificationType.CRM_MESSAGE_RECEIVED,
          priority: snapshot.priority(contact, now),
          sourceKey,
          copyKey: 'crm.notification.messageReceived',
          title: `New message from ${senderName}`,
          body: this.preview(message.text),
          metadata: {
            messageId: message.id,
            conversationId: message.conversationId,
            contactId: contact?.id ?? null,
            peerId:
              input.conversation.telegramCrmPeerId ??
              input.message.telegramUserId,
            presentationKind: 'crm-message',
            senderName,
            avatarUrl: input.conversation.peer?.photoUrl ?? null,
            messageCount,
          },
          targetUrl,
          publishedAt: now,
          requiredPermissionKey: 'adSales.crm.view',
          ownPermissionKey: 'adSales.crm.viewOwn',
          anyPermissionKey: 'adSales.crm.viewAny',
          visibilityMemberId: contact?.ownerMemberId ?? null,
          visibilityResourceKey: contact
            ? crmContactNotificationVisibilityKey(contact.id)
            : null,
        },
      ];
    });
    const legacyByRecipient = new Map<string, Set<string>>();
    for (const [sourceKey, group] of groups) {
      if (!sourceKey.startsWith('contact:')) continue;
      const contact = snapshot.contact(group[0].input.conversation.contactId);
      const recipient = snapshot.recipient(contact);
      if (!recipient) continue;
      const keys = legacyByRecipient.get(recipient.id) ?? new Set<string>();
      for (const item of group) {
        keys.add(`conversation:${item.message.conversationId}`);
      }
      legacyByRecipient.set(recipient.id, keys);
    }
    if (legacyByRecipient.size) {
      await tx.operationsNotification.deleteMany({
        where: {
          workspaceId,
          type: OperationsNotificationType.CRM_MESSAGE_RECEIVED,
          OR: [...legacyByRecipient].map(([recipientMemberId, sourceKeys]) => ({
            recipientMemberId,
            sourceKey: { in: [...sourceKeys] },
          })),
        },
      });
    }
    return this.notifications.upsertMany(tx, rows);
  }

  async removeConversationGroup(
    tx: Prisma.TransactionClient,
    workspaceId: string,
    conversationId: string,
  ) {
    return this.removeConversationGroups(tx, workspaceId, [conversationId]);
  }

  async removeConversationGroups(
    tx: Prisma.TransactionClient,
    workspaceId: string,
    conversationIds: readonly string[],
  ) {
    const sourceKeys = [...new Set(conversationIds)].map(
      (conversationId) => `conversation:${conversationId}`,
    );
    if (!sourceKeys.length) return [];
    const where = {
      workspaceId,
      type: OperationsNotificationType.CRM_MESSAGE_RECEIVED,
      sourceKey: { in: sourceKeys },
    } as const;
    const recipients = await tx.operationsNotification.findMany({
      where,
      distinct: ['recipientMemberId'],
      select: { recipientMemberId: true },
    });
    if (recipients.length) {
      await tx.operationsNotification.deleteMany({ where });
    }
    return recipients.map((row) => row.recipientMemberId);
  }

  async reconcileConversationGroups(
    tx: Prisma.TransactionClient,
    workspaceId: string,
    reads: readonly {
      conversationId: string;
      contactId: string | null;
      unreadCount: number;
    }[],
  ) {
    const contactIds = [
      ...new Set(
        reads.flatMap((read) => (read.contactId ? [read.contactId] : [])),
      ),
    ];
    const contactUnreadRows = contactIds.length
      ? await tx.telegramCrmConversation.groupBy({
          by: ['contactId'],
          where: {
            workspaceId,
            state: TelegramCrmConversationState.ACTIVE,
            contactId: { in: contactIds },
          },
          _sum: { unreadCount: true },
        })
      : [];
    const unreadByContact = new Map(
      contactUnreadRows.flatMap((row) =>
        row.contactId ? [[row.contactId, row._sum.unreadCount ?? 0]] : [],
      ),
    );
    const bySource = new Map(
      reads.map((read) => [
        read.contactId
          ? `contact:${read.contactId}`
          : `conversation:${read.conversationId}`,
        read.contactId
          ? (unreadByContact.get(read.contactId) ?? 0)
          : Math.max(0, read.unreadCount),
      ]),
    );
    if (!bySource.size) return [];
    const legacyConversationKeys = reads.flatMap((read) =>
      read.contactId ? [`conversation:${read.conversationId}`] : [],
    );
    const sourceKeys = [...new Set([...bySource.keys(), ...legacyConversationKeys])];
    const where = {
      workspaceId,
      type: OperationsNotificationType.CRM_MESSAGE_RECEIVED,
      sourceKey: { in: sourceKeys },
    } as const;
    const recipients = await tx.operationsNotification.findMany({
      where,
      distinct: ['recipientMemberId'],
      select: { recipientMemberId: true },
    });
    const exhaustedKeys = [...bySource]
      .filter(([, unreadCount]) => unreadCount === 0)
      .map(([sourceKey]) => sourceKey)
      .concat(legacyConversationKeys);
    if (exhaustedKeys.length) {
      await tx.operationsNotification.deleteMany({
        where: { ...where, sourceKey: { in: exhaustedKeys } },
      });
    }
    const remaining = [...bySource]
      .filter(([, unreadCount]) => unreadCount > 0)
      .map(([sourceKey, unreadCount]) => ({ sourceKey, unreadCount }));
    if (remaining.length) {
      await tx.$executeRaw(Prisma.sql`
        UPDATE "OperationsNotification" AS notification
        SET
          "metadata" = jsonb_set(
            COALESCE(notification."metadata"::jsonb, '{}'::jsonb),
            '{messageCount}',
            to_jsonb(incoming."unreadCount"),
            true
          )
        FROM (
          VALUES ${Prisma.join(
            remaining.map(
              (item) => Prisma.sql`(
                CAST(${item.sourceKey} AS TEXT),
                CAST(${item.unreadCount} AS INTEGER)
              )`,
            ),
          )}
        ) AS incoming("sourceKey", "unreadCount")
        WHERE notification."workspaceId" = ${workspaceId}
          AND notification."type" = ${OperationsNotificationType.CRM_MESSAGE_RECEIVED}::"OperationsNotificationType"
          AND notification."sourceKey" = incoming."sourceKey"
      `);
    }
    return recipients.map((row) => row.recipientMemberId);
  }

  private contactTarget(
    workspaceId: string,
    contactId: string,
    conversationId: string,
  ) {
    return `/ad-sales/contacts/${encodeURIComponent(contactId)}/conversations/${encodeURIComponent(conversationId)}?workspaceId=${encodeURIComponent(workspaceId)}`;
  }

  private inboxTarget(
    workspaceId: string,
    conversationId: string,
    peerId: string,
  ) {
    const query = new URLSearchParams({ conversationId, peerId, workspaceId });
    return `/ad-sales/inbox?${query.toString()}`;
  }

  private preview(text: string | null) {
    const value = text?.trim().replace(/\s+/g, ' ') || 'New inbound message';
    return value.slice(0, 240);
  }
}
