import { Injectable } from '@nestjs/common';
import { OperationsNotificationType, Prisma } from '@prisma/client';
import { OperationsNotificationStoreService } from '../../operations/notifications/operations-notification-store.service';
import type {
  CrmMessageBatchInput,
  CrmMessageBatchMode,
} from './telegram-crm-message-batch-writer.service';
import type { CrmMessageRow } from './telegram-crm-message.mapper';
import { TelegramCrmNotificationRecipientService } from './telegram-crm-notification-recipient.service';
import { crmContactNotificationVisibilityKey } from './telegram-crm-notification-visibility';
import { TelegramCrmNotificationEligibilityService } from './telegram-crm-notification-eligibility.service';
import {
  TelegramCrmNotificationGroups,
  crmConversationNotificationKey,
} from './telegram-crm-notification-groups';

@Injectable()
export class TelegramCrmIncomingNotificationProjector {
  constructor(
    private readonly recipients: TelegramCrmNotificationRecipientService,
    private readonly notifications: OperationsNotificationStoreService,
    private readonly eligibility: TelegramCrmNotificationEligibilityService,
    private readonly groups: TelegramCrmNotificationGroups,
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
      if (
        message.workspaceId !== workspaceId ||
        message.direction !== 'INBOUND' ||
        message.readState !== 'UNREAD'
      )
        return [];
      const input = inputByKey.get(
        `${message.conversationId}:${message.telegramMessageId}`,
      );
      return input && !input.edited ? [{ message, input }] : [];
    });
    if (!inbound.length) return [];
    const eligible = await this.eligibility.load(
      tx,
      workspaceId,
      inbound.map(({ message }) => message.conversationId),
    );
    const allowed = inbound.filter(({ message }) => {
      const conversation = eligible.get(message.conversationId);
      return (
        conversation &&
        this.eligibility.unreadMessage(
          conversation,
          message.mtprotoAccountId,
          message.telegramMessageIdNumeric,
        )
      );
    });
    if (!allowed.length) return [];
    const snapshot = await this.recipients.load(
      tx,
      workspaceId,
      [...eligible.values()].flatMap((conversation) =>
        conversation.contactId ? [conversation.contactId] : [],
      ),
    );
    const grouped = new Map<string, typeof allowed>();
    for (const item of allowed) {
      const key = crmConversationNotificationKey(
        item.message.mtprotoAccountId,
        item.message.conversationId,
      );
      grouped.set(key, [...(grouped.get(key) ?? []), item]);
    }
    const now = new Date();
    const rows = [...grouped].flatMap(([sourceKey, group]) => {
      const { message, input } = group.reduce((latest, item) =>
        item.message.sentAt > latest.message.sentAt ||
        (item.message.sentAt.getTime() === latest.message.sentAt.getTime() &&
          (item.message.telegramMessageIdNumeric ?? 0) >
            (latest.message.telegramMessageIdNumeric ?? 0))
          ? item
          : latest,
      );
      const conversation = eligible.get(message.conversationId)!;
      const contact = snapshot.contact(conversation.contactId);
      const recipient = snapshot.recipient(contact);
      if (!recipient || !snapshot.incomingEnabled(recipient)) return [];
      const senderName =
        contact?.displayName ||
        [input.conversation.peer?.firstName, input.conversation.peer?.lastName]
          .filter(Boolean)
          .join(' ')
          .trim() ||
        (input.conversation.peer?.username
          ? `@${input.conversation.peer.username}`
          : 'Telegram user');
      const awaitingReply = Boolean(
        input.conversation.lastOutboundAt &&
        (!input.conversation.lastInboundAt ||
          input.conversation.lastOutboundAt >=
            input.conversation.lastInboundAt),
      );
      return [
        {
          workspaceId,
          recipientMemberId: recipient.id,
          type: OperationsNotificationType.CRM_MESSAGE_RECEIVED,
          priority: snapshot.priority(contact, now, awaitingReply),
          sourceKey,
          copyKey: 'crm.notification.messageReceived',
          title: `New message from ${senderName}`,
          body: snapshot.previewEnabled(recipient)
            ? (
                message.text?.trim().replace(/\s+/g, ' ') ||
                'New inbound message'
              ).slice(0, 240)
            : 'Open Inbox to read the new message.',
          metadata: {
            messageId: message.id,
            telegramMessageId: message.telegramMessageIdNumeric,
            messageSentAt: message.sentAt.toISOString(),
            accountId: message.mtprotoAccountId,
            conversationId: message.conversationId,
            contactId: conversation.contactId,
            peerId: conversation.telegramCrmPeerId,
            presentationKind: 'crm-message',
            senderName,
            avatarUrl: input.conversation.peer?.photoUrl ?? null,
            messageCount: conversation.unreadCount,
          },
          targetUrl: `/ad-sales/inbox?${new URLSearchParams({ conversationId: message.conversationId, workspaceId, peerId: conversation.telegramCrmPeerId }).toString()}`,
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
    return rows.length ? this.notifications.upsertMany(tx, rows) : [];
  }

  removeConversationGroup(
    tx: Prisma.TransactionClient,
    workspaceId: string,
    conversationId: string,
  ) {
    return this.removeConversationGroups(tx, workspaceId, [conversationId]);
  }

  removeConversationGroups(
    tx: Prisma.TransactionClient,
    workspaceId: string,
    conversationIds: readonly string[],
  ) {
    return this.groups.reconcile(
      tx,
      workspaceId,
      conversationIds.map((conversationId) => ({
        conversationId,
        contactId: null,
        unreadCount: 0,
      })),
    );
  }

  reconcileConversationGroups(
    tx: Prisma.TransactionClient,
    workspaceId: string,
    reads: readonly {
      conversationId: string;
      contactId: string | null;
      unreadCount: number;
    }[],
  ) {
    return this.groups.reconcile(tx, workspaceId, reads);
  }
}
