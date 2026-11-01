import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { OperationsNotificationType, type Prisma } from '@prisma/client';
import {
  OperationsNotificationDeliveryPolicyService,
  type OperationsNotificationDeliveryFact,
} from '../../operations/notifications/operations-notification-delivery-policy.service';
import { TelegramCrmNotificationEligibilityService } from './telegram-crm-notification-eligibility.service';
import { TelegramCrmNotificationRecipientService } from './telegram-crm-notification-recipient.service';

@Injectable()
export class TelegramCrmNotificationDeliveryPolicy
  implements OnModuleInit, OnModuleDestroy
{
  private unregister?: () => void;

  constructor(
    private readonly policies: OperationsNotificationDeliveryPolicyService,
    private readonly eligibility: TelegramCrmNotificationEligibilityService,
    private readonly recipients: TelegramCrmNotificationRecipientService,
  ) {}

  onModuleInit() {
    this.unregister = this.policies.register(
      OperationsNotificationType.CRM_MESSAGE_RECEIVED,
      (tx, facts) => this.allowed(tx, facts),
    );
  }

  onModuleDestroy() {
    this.unregister?.();
  }

  async allowed(
    tx: Prisma.TransactionClient,
    facts: readonly OperationsNotificationDeliveryFact[],
  ) {
    const byWorkspace = new Map<string, typeof facts>();
    for (const fact of facts)
      byWorkspace.set(fact.workspaceId, [
        ...(byWorkspace.get(fact.workspaceId) ?? []),
        fact,
      ]);
    const allowed: string[] = [];
    for (const [workspaceId, group] of byWorkspace) {
      const metadata = (fact: OperationsNotificationDeliveryFact) => {
        const value = fact.metadata;
        return value && typeof value === 'object' && !Array.isArray(value)
          ? value
          : {};
      };
      const ids = group.flatMap((fact) =>
        typeof metadata(fact).conversationId === 'string'
          ? [metadata(fact).conversationId as string]
          : [],
      );
      const conversations = await this.eligibility.load(tx, workspaceId, ids);
      if (!conversations.size) continue;
      const messageIds = group.flatMap((fact) =>
        typeof metadata(fact).messageId === 'string'
          ? [metadata(fact).messageId as string]
          : [],
      );
      const messages = messageIds.length
        ? await tx.telegramCrmMessage.findMany({
            where: {
              workspaceId,
              id: { in: messageIds },
              deletedAt: null,
              direction: 'INBOUND',
            },
            select: {
              id: true,
              conversationId: true,
              mtprotoAccountId: true,
              telegramMessageIdNumeric: true,
            },
          })
        : [];
      const currentMessages = new Map(
        messages.map((message) => [message.id, message]),
      );
      if (!currentMessages.size) continue;
      const snapshot = await this.recipients.load(
        tx,
        workspaceId,
        [...conversations.values()].flatMap((conversation) =>
          conversation.contactId ? [conversation.contactId] : [],
        ),
      );
      for (const fact of group) {
        const data = metadata(fact);
        if (
          typeof data.messageId !== 'string' ||
          typeof data.conversationId !== 'string' ||
          typeof data.accountId !== 'string' ||
          typeof data.telegramMessageId !== 'number'
        )
          continue;
        const message = currentMessages.get(data.messageId);
        if (
          !message ||
          message.conversationId !== data.conversationId ||
          message.mtprotoAccountId !== data.accountId ||
          message.telegramMessageIdNumeric !== data.telegramMessageId
        )
          continue;
        const conversation = conversations.get(data.conversationId);
        if (
          !conversation ||
          !this.eligibility.unreadMessage(
            conversation,
            data.accountId,
            data.telegramMessageId,
          )
        )
          continue;
        const recipient = snapshot.recipient(
          snapshot.contact(conversation.contactId),
        );
        if (
          recipient?.id === fact.recipientMemberId &&
          snapshot.incomingEnabled(recipient)
        )
          allowed.push(fact.id);
      }
    }
    return allowed;
  }
}
