import { Injectable } from '@nestjs/common';
import {
  OperationsNotificationPriority,
  OperationsNotificationType,
  Prisma,
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
    const now = new Date();
    const rows = inbound.flatMap(({ message, input }) => {
      const contact = snapshot.contact(input.conversation.contactId);
      const recipient = snapshot.recipient(contact);
      if (!recipient) return [];
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
          sourceKey: `message:${message.id}`,
          copyKey: 'crm.notification.messageReceived',
          title: contact
            ? `New message from ${contact.displayName}`
            : 'New CRM inbox message',
          body: this.preview(message.text),
          metadata: {
            messageId: message.id,
            conversationId: message.conversationId,
            contactId: contact?.id ?? null,
            peerId:
              input.conversation.telegramCrmPeerId ??
              input.message.telegramUserId,
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
    return this.notifications.insertMany(tx, rows);
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
