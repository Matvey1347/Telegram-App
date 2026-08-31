import { Injectable } from '@nestjs/common';
import {
  Prisma,
  TelegramCrmMessageOrigin,
  TelegramCrmReadState,
} from '@prisma/client';
import type { TelegramCrmMtprotoMessage } from '../../../telegram/shared/telegram-crm-mtproto.types';
import { TelegramCrmEventHub } from './telegram-crm-event-hub.service';
import { crmMessageSelect, mapCrmMessage } from './telegram-crm-message.mapper';

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
  constructor(private readonly events: TelegramCrmEventHub) {}

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
    if (fresh.length) {
      await tx.telegramCrmMessage.createMany({
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
      });
    }
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
      await this.updateCompacts(tx, fresh, mode);
    }
    const created = fresh.length
      ? await tx.telegramCrmMessage.findMany({
          where: {
            OR: fresh.map(({ conversation, message }) => ({
              conversationId: conversation.id,
              telegramMessageId: String(message.telegramMessageId),
            })),
          },
          select: crmMessageSelect,
        })
      : [];
    return { created, edited, inputs: [...fresh, ...editedInputs] };
  }

  emitAfterCommit(
    workspaceId: string,
    stored: {
      created: MessageRow[];
      edited: number;
      inputs: CrmMessageBatchInput[];
    },
    mode: CrmMessageBatchMode,
  ) {
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
          message,
        });
      }
    }
    for (const input of this.touchedConversations(stored.inputs)) {
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
      if (input.conversation.contactId) {
        this.events.emit({
          type: 'contact.updated',
          workspaceId,
          occurredAt: new Date().toISOString(),
          contactId: input.conversation.contactId,
          ownerMemberId: input.conversation.contact?.ownerMemberId ?? null,
        });
      } else {
        this.events.emit({
          type: 'inbox.updated',
          workspaceId,
          occurredAt: new Date().toISOString(),
          peerId:
            input.conversation.telegramCrmPeerId ??
            input.message.telegramUserId,
          contactId: null,
          ownerMemberId: null,
          conversation: null,
        });
      }
    }
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

  emitPeerMetadataAfterCommit(
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
