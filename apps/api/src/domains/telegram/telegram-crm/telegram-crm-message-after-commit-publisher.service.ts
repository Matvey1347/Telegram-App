import type { OperationsNotificationPublisherService } from '../../operations/notifications/operations-notification-publisher.service';
import type {
  CrmMessageBatchInput,
  CrmMessageBatchMode,
} from './telegram-crm-message-batch-writer.service';
import { TelegramCrmEventHub } from './telegram-crm-event-hub.service';
import {
  mapCrmMessage,
  type CrmMessageRow,
} from './telegram-crm-message.mapper';

export type StoredCrmMessageBatch = {
  created: CrmMessageRow[];
  edited: number;
  inputs: CrmMessageBatchInput[];
  notificationIds?: string[];
};

export class TelegramCrmMessageAfterCommitPublisher {
  constructor(
    private readonly events: TelegramCrmEventHub,
    private readonly notifications?: OperationsNotificationPublisherService,
  ) {}

  messages(
    workspaceId: string,
    stored: StoredCrmMessageBatch,
    mode: CrmMessageBatchMode,
  ) {
    if (stored.notificationIds?.length) {
      void this.notifications
        ?.publish(stored.notificationIds)
        .catch(() => undefined);
    }
    if (mode === 'history') return;
    const inputByConversation = new Map(
      stored.inputs.map((input) => [input.conversation.id, input]),
    );
    if (mode === 'live') {
      for (const row of stored.created) {
        const message = mapCrmMessage(row);
        const input = inputByConversation.get(message.conversationId);
        this.events.emit({
          type:
            message.direction === 'INBOUND'
              ? 'message.received'
              : 'message.sent',
          workspaceId,
          occurredAt: new Date().toISOString(),
          conversationId: message.conversationId,
          contactId: input?.conversation.contactId ?? null,
          ownerMemberId: input?.conversation.contact?.ownerMemberId ?? null,
          message: { ...message, sentByMember: null },
        });
      }
    }
    for (const input of this.touched(stored.inputs)) {
      if (mode === 'live') {
        const inboundCount = stored.inputs.filter(
          (item) =>
            item.conversation.id === input.conversation.id &&
            item.message.direction === 'INBOUND' &&
            !item.edited,
        ).length;
        if (inboundCount > 0) {
          this.events.emit({
            type: 'conversation.unreadChanged',
            workspaceId,
            occurredAt: new Date().toISOString(),
            conversationId: input.conversation.id,
            contactId: input.conversation.contactId,
            ownerMemberId: input.conversation.contact?.ownerMemberId ?? null,
            unreadCount: (input.conversation.unreadCount ?? 0) + inboundCount,
          });
        }
      }
      this.events.emit(
        input.conversation.contactId
          ? {
              type: 'contact.updated',
              workspaceId,
              occurredAt: new Date().toISOString(),
              contactId: input.conversation.contactId,
              ownerMemberId: input.conversation.contact?.ownerMemberId ?? null,
            }
          : {
              type: 'inbox.updated',
              workspaceId,
              occurredAt: new Date().toISOString(),
              peerId:
                input.conversation.telegramCrmPeerId ??
                input.message.telegramUserId,
              contactId: null,
              ownerMemberId: null,
              conversation: null,
            },
      );
    }
  }

  reads(
    workspaceId: string,
    reads: Array<{
      conversationId: string;
      peerId: string;
      contactId: string | null;
      ownerMemberId: string | null;
      unreadCount: number;
      unreadChanged: boolean;
    }>,
  ) {
    for (const read of reads) {
      this.events.emit({
        type: 'readChanged',
        workspaceId,
        occurredAt: new Date().toISOString(),
        conversationId: read.conversationId,
        contactId: read.contactId,
        ownerMemberId: read.ownerMemberId,
        unreadCount: read.unreadCount,
      });
      if (read.unreadChanged) {
        this.events.emit({
          type: 'conversation.unreadChanged',
          workspaceId,
          occurredAt: new Date().toISOString(),
          conversationId: read.conversationId,
          contactId: read.contactId,
          ownerMemberId: read.ownerMemberId,
          unreadCount: read.unreadCount,
        });
      }
      if (!read.contactId) {
        this.events.emit({
          type: 'inbox.updated',
          workspaceId,
          occurredAt: new Date().toISOString(),
          peerId: read.peerId,
          contactId: null,
          ownerMemberId: null,
          conversation: null,
        });
      }
    }
  }

  peers(
    workspaceId: string,
    peers: Array<{
      id: string;
      contactId: string | null;
      ownerMemberId: string | null;
    }>,
  ) {
    for (const peer of peers) {
      this.events.emit(
        peer.contactId
          ? {
              type: 'contact.updated',
              workspaceId,
              occurredAt: new Date().toISOString(),
              contactId: peer.contactId,
              ownerMemberId: peer.ownerMemberId,
            }
          : {
              type: 'inbox.updated',
              workspaceId,
              occurredAt: new Date().toISOString(),
              peerId: peer.id,
              contactId: null,
              ownerMemberId: null,
              conversation: null,
            },
      );
    }
  }

  private touched(inputs: CrmMessageBatchInput[]) {
    const result = new Map<string, CrmMessageBatchInput>();
    for (const input of inputs) result.set(input.conversation.id, input);
    return [...result.values()];
  }
}
