import { Injectable, Optional } from '@nestjs/common';
import {
  Prisma,
  TelegramCrmMessageOrigin,
  TelegramCrmReadState,
} from '@prisma/client';
import type { TelegramCrmMtprotoMessage } from '../../../telegram/shared/telegram-crm-mtproto.types';
import { OperationsNotificationPublisherService } from '../../operations/notifications/operations-notification-publisher.service';
import { TelegramCrmEventHub } from './telegram-crm-event-hub.service';
import { TelegramCrmIncomingNotificationProjector } from './telegram-crm-incoming-notification-projector.service';
import { TelegramCrmMessageAfterCommitPublisher } from './telegram-crm-message-after-commit-publisher.service';
import { crmMessageSelect } from './telegram-crm-message.mapper';

export type CrmMessageBatchMode = 'snapshot' | 'live' | 'history';
export type CrmMessageBatchInput = {
  conversation: {
    id: string;
    telegramCrmPeerId?: string;
    contactId: string | null;
    unreadCount?: number;
    lastInboundAt?: Date | null;
    lastOutboundAt?: Date | null;
    lastMessageAt?: Date | null;
    contact?: { ownerMemberId: string | null } | null;
  };
  message: TelegramCrmMtprotoMessage;
  edited?: boolean;
};

type Context = { workspaceId: string; accountId: string };
type MessageRow = Prisma.TelegramCrmMessageGetPayload<{
  select: typeof crmMessageSelect;
}>;

@Injectable()
export class TelegramCrmMessageBatchWriter {
  private readonly afterCommit: TelegramCrmMessageAfterCommitPublisher;

  constructor(
    events: TelegramCrmEventHub,
    @Optional() notifications?: OperationsNotificationPublisherService,
    @Optional()
    private readonly projector?: TelegramCrmIncomingNotificationProjector,
  ) {
    this.afterCommit = new TelegramCrmMessageAfterCommitPublisher(
      events,
      notifications,
    );
  }

  async store(
    tx: Prisma.TransactionClient,
    context: Context,
    rawInputs: CrmMessageBatchInput[],
    mode: CrmMessageBatchMode,
  ) {
    const inputs = this.dedupe(rawInputs);
    if (!inputs.length)
      return { created: [] as MessageRow[], edited: 0, inputs };
    const existing = await tx.telegramCrmMessage.findMany({
      where: {
        OR: inputs.map(({ conversation, message }) => ({
          conversationId: conversation.id,
          telegramMessageId: String(message.telegramMessageId),
        })),
      },
      select: {
        id: true,
        conversationId: true,
        telegramMessageId: true,
        text: true,
        editedAt: true,
      },
    });
    const existingByKey = new Map(
      existing.map((message) => [
        `${message.conversationId}:${message.telegramMessageId}`,
        message,
      ]),
    );
    const fresh = inputs.filter(
      ({ conversation, message }) =>
        !existingByKey.has(`${conversation.id}:${message.telegramMessageId}`),
    );
    const inserted = fresh.length
      ? await tx.telegramCrmMessage.createManyAndReturn({
          data: fresh.map(({ conversation, message }) => ({
            workspaceId: context.workspaceId,
            conversationId: conversation.id,
            telegramMessageId: String(message.telegramMessageId),
            telegramMessageIdNumeric: message.telegramMessageId,
            mtprotoAccountId: context.accountId,
            direction: message.direction,
            origin: TelegramCrmMessageOrigin.TELEGRAM_SYNC,
            text: message.text,
            contentMetadata:
              (message.contentMetadata as Prisma.InputJsonValue | null) ??
              Prisma.JsonNull,
            sentAt: message.sentAt,
            editedAt: message.editedAt,
            readState:
              message.direction === 'INBOUND' && mode === 'live'
                ? TelegramCrmReadState.UNREAD
                : TelegramCrmReadState.UNKNOWN,
          })),
          skipDuplicates: true,
          select: { id: true, conversationId: true, telegramMessageId: true },
        })
      : [];
    const insertedKeys = new Set(
      inserted.map(
        (message) => `${message.conversationId}:${message.telegramMessageId}`,
      ),
    );
    const insertedInputs = fresh.filter(({ conversation, message }) =>
      insertedKeys.has(`${conversation.id}:${message.telegramMessageId}`),
    );
    let edited = 0;
    const editedInputs: CrmMessageBatchInput[] = [];
    for (const input of inputs) {
      const current = existingByKey.get(
        `${input.conversation.id}:${input.message.telegramMessageId}`,
      );
      if (
        !current ||
        (!input.edited && !input.message.editedAt) ||
        (current.text === input.message.text &&
          current.editedAt?.getTime() === input.message.editedAt?.getTime())
      ) {
        continue;
      }
      await tx.telegramCrmMessage.update({
        where: { id: current.id },
        data: { text: input.message.text, editedAt: input.message.editedAt },
      });
      edited += 1;
      editedInputs.push(input);
    }
    if (mode !== 'history') {
      await this.updateCompacts(tx, insertedInputs, mode);
    }
    const created = inserted.length
      ? await tx.telegramCrmMessage.findMany({
          where: { id: { in: inserted.map((message) => message.id) } },
          select: crmMessageSelect,
        })
      : [];
    const notificationIds =
      this.projector && created.length
        ? (
            await this.projector.project(
              tx,
              context.workspaceId,
              mode,
              insertedInputs,
              created,
            )
          ).map((item) => item.id)
        : [];
    return {
      created,
      edited,
      inputs: [...insertedInputs, ...editedInputs],
      notificationIds,
    };
  }

  emitAfterCommit(
    workspaceId: string,
    stored: {
      created: MessageRow[];
      edited: number;
      inputs: CrmMessageBatchInput[];
      notificationIds?: string[];
    },
    mode: CrmMessageBatchMode,
  ) {
    this.afterCommit.messages(workspaceId, stored, mode);
  }

  emitReadsAfterCommit(
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
    this.afterCommit.reads(workspaceId, reads);
  }

  emitPeerMetadataAfterCommit(
    workspaceId: string,
    peers: Array<{
      id: string;
      contactId: string | null;
      ownerMemberId: string | null;
    }>,
  ) {
    this.afterCommit.peers(workspaceId, peers);
  }

  private async updateCompacts(
    tx: Prisma.TransactionClient,
    fresh: CrmMessageBatchInput[],
    mode: Exclude<CrmMessageBatchMode, 'history'>,
  ) {
    for (const input of this.touchedConversations(fresh)) {
      const group = fresh.filter(
        (item) => item.conversation.id === input.conversation.id,
      );
      const newestInbound = this.newest(group, 'INBOUND');
      const newestOutbound = this.newest(group, 'OUTBOUND');
      const newest = group.reduce(
        (result, item) =>
          item.message.sentAt > result ? item.message.sentAt : result,
        group[0].message.sentAt,
      );
      const data: Prisma.TelegramCrmConversationUpdateInput = {
        ...(!input.conversation.lastMessageAt ||
        newest > input.conversation.lastMessageAt
          ? { lastMessageAt: newest }
          : {}),
        ...(newestInbound &&
        (!input.conversation.lastInboundAt ||
          newestInbound > input.conversation.lastInboundAt)
          ? { lastInboundAt: newestInbound }
          : {}),
        ...(newestOutbound &&
        (!input.conversation.lastOutboundAt ||
          newestOutbound > input.conversation.lastOutboundAt)
          ? { lastOutboundAt: newestOutbound }
          : {}),
        ...(mode === 'live' && newestInbound
          ? {
              unreadCount: {
                increment: group.filter(
                  (item) => item.message.direction === 'INBOUND',
                ).length,
              },
              readState: TelegramCrmReadState.UNREAD,
            }
          : {}),
        lastMeaningfulSyncAt: new Date(),
      };
      await tx.telegramCrmConversation.update({
        where: { id: input.conversation.id },
        data,
      });
      if (input.conversation.contactId) {
        const contact = await tx.telegramAdvertiser.findUnique({
          where: { id: input.conversation.contactId },
          select: {
            lastContactAt: true,
            lastInboundAt: true,
            lastOutboundAt: true,
          },
        });
        if (contact) {
          const contactData: Prisma.TelegramAdvertiserUpdateInput = {};
          if (!contact.lastContactAt || newest > contact.lastContactAt) {
            contactData.lastContactAt = newest;
          }
          if (
            newestInbound &&
            (!contact.lastInboundAt || newestInbound > contact.lastInboundAt)
          ) {
            contactData.lastInboundAt = newestInbound;
          }
          if (
            newestOutbound &&
            (!contact.lastOutboundAt || newestOutbound > contact.lastOutboundAt)
          ) {
            contactData.lastOutboundAt = newestOutbound;
          }
          if (Object.keys(contactData).length) {
            await tx.telegramAdvertiser.update({
              where: { id: input.conversation.contactId },
              data: contactData,
            });
          }
        }
      }
    }
  }

  private dedupe(inputs: CrmMessageBatchInput[]) {
    const result = new Map<string, CrmMessageBatchInput>();
    for (const input of inputs) {
      const key = `${input.conversation.id}:${input.message.telegramMessageId}`;
      const current = result.get(key);
      if (!current || (input.message.editedAt && !current.message.editedAt)) {
        result.set(key, input);
      }
    }
    return [...result.values()];
  }

  private touchedConversations(inputs: CrmMessageBatchInput[]) {
    const result = new Map<string, CrmMessageBatchInput>();
    for (const input of inputs) result.set(input.conversation.id, input);
    return [...result.values()];
  }

  private newest(
    inputs: CrmMessageBatchInput[],
    direction: 'INBOUND' | 'OUTBOUND',
  ) {
    return inputs
      .filter((input) => input.message.direction === direction)
      .reduce<Date | null>(
        (value, input) =>
          !value || input.message.sentAt > value ? input.message.sentAt : value,
        null,
      );
  }
}
