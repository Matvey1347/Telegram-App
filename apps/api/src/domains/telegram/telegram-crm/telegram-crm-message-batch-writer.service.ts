import { Injectable, Optional } from '@nestjs/common';
import {
  Prisma,
  TelegramCrmMessageOrigin,
  TelegramCrmReadState,
} from '@prisma/client';
import type { TelegramCrmMtprotoMessage } from '../../../telegram/shared/telegram-crm-mtproto.types';
import { OperationsNotificationPublisherService } from '../../operations/notifications/operations-notification-publisher.service';
import { ResponseCacheService } from '../../../common/response-cache.service';
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
    peer?: {
      telegramUserId: string;
      username: string | null;
      firstName: string | null;
      lastName: string | null;
      photoUrl: string | null;
    };
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
    @Optional() responseCache?: ResponseCacheService,
  ) {
    this.afterCommit = new TelegramCrmMessageAfterCommitPublisher(
      events,
      notifications,
      responseCache,
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
    await this.updateCompacts(tx, context.workspaceId, insertedInputs, mode);
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

  removeIncomingNotificationGroups(
    tx: Prisma.TransactionClient,
    workspaceId: string,
    conversationIds: readonly string[],
  ) {
    return (
      this.projector?.removeConversationGroups(
        tx,
        workspaceId,
        conversationIds,
      ) ?? Promise.resolve([])
    );
  }

  reconcileIncomingNotificationGroups(
    tx: Prisma.TransactionClient,
    workspaceId: string,
    reads: readonly {
      conversationId: string;
      contactId: string | null;
      unreadCount: number;
    }[],
  ) {
    return (
      this.projector?.reconcileConversationGroups(tx, workspaceId, reads) ??
      Promise.resolve([])
    );
  }

  emitNotificationInvalidationsAfterCommit(
    workspaceId: string,
    recipientMemberIds: readonly string[],
  ) {
    this.afterCommit.notificationInvalidations(workspaceId, recipientMemberIds);
  }

  invalidateContactReadCache(workspaceId: string) {
    this.afterCommit.contactsChanged(workspaceId);
  }

  private async updateCompacts(
    tx: Prisma.TransactionClient,
    workspaceId: string,
    fresh: CrmMessageBatchInput[],
    mode: CrmMessageBatchMode,
  ) {
    if (!fresh.length) return;
    const groups = this.messageGroups(fresh);
    await tx.$executeRaw(Prisma.sql`
      UPDATE "TelegramCrmConversation" AS conversation
      SET
        "inboundMessageCount" = conversation."inboundMessageCount" + incoming."inboundCount",
        "outboundMessageCount" = conversation."outboundMessageCount" + incoming."outboundCount",
        "lastMessageAt" = CASE
          WHEN ${mode === 'history'} THEN conversation."lastMessageAt"
          WHEN conversation."lastMessageAt" IS NULL OR incoming."lastMessageAt" > conversation."lastMessageAt"
            THEN incoming."lastMessageAt"
          ELSE conversation."lastMessageAt"
        END,
        "lastInboundAt" = CASE
          WHEN ${mode === 'history'} OR incoming."lastInboundAt" IS NULL THEN conversation."lastInboundAt"
          WHEN conversation."lastInboundAt" IS NULL OR incoming."lastInboundAt" > conversation."lastInboundAt"
            THEN incoming."lastInboundAt"
          ELSE conversation."lastInboundAt"
        END,
        "lastOutboundAt" = CASE
          WHEN ${mode === 'history'} OR incoming."lastOutboundAt" IS NULL THEN conversation."lastOutboundAt"
          WHEN conversation."lastOutboundAt" IS NULL OR incoming."lastOutboundAt" > conversation."lastOutboundAt"
            THEN incoming."lastOutboundAt"
          ELSE conversation."lastOutboundAt"
        END,
        "unreadCount" = conversation."unreadCount" + incoming."unreadIncrement",
        "readState" = CASE
          WHEN incoming."unreadIncrement" > 0 THEN ${TelegramCrmReadState.UNREAD}::"TelegramCrmReadState"
          ELSE conversation."readState"
        END,
        "lastMeaningfulSyncAt" = CASE
          WHEN ${mode === 'history'} THEN conversation."lastMeaningfulSyncAt"
          ELSE NOW()
        END,
        "updatedAt" = NOW()
      FROM (
        VALUES ${Prisma.join(
          groups.map(
            (group) => Prisma.sql`(
              CAST(${group.conversationId} AS TEXT),
              CAST(${group.inboundCount} AS INTEGER),
              CAST(${group.outboundCount} AS INTEGER),
              CAST(${group.lastMessageAt} AS TIMESTAMPTZ),
              CAST(${group.lastInboundAt} AS TIMESTAMPTZ),
              CAST(${group.lastOutboundAt} AS TIMESTAMPTZ),
              CAST(${mode === 'live' ? group.inboundCount : 0} AS INTEGER)
            )`,
          ),
        )}
      ) AS incoming(
        "conversationId",
        "inboundCount",
        "outboundCount",
        "lastMessageAt",
        "lastInboundAt",
        "lastOutboundAt",
        "unreadIncrement"
      )
      WHERE conversation."id" = incoming."conversationId"
        AND conversation."workspaceId" = ${workspaceId}
    `);
    if (mode === 'history') return;
    const contacts = this.contactGroups(fresh);
    if (!contacts.length) return;
    await tx.$executeRaw(Prisma.sql`
      UPDATE "TelegramAdvertiser" AS contact
      SET
        "lastContactAt" = CASE
          WHEN contact."lastContactAt" IS NULL OR incoming."lastMessageAt" > contact."lastContactAt"
            THEN incoming."lastMessageAt"
          ELSE contact."lastContactAt"
        END,
        "lastInboundAt" = CASE
          WHEN incoming."lastInboundAt" IS NULL THEN contact."lastInboundAt"
          WHEN contact."lastInboundAt" IS NULL OR incoming."lastInboundAt" > contact."lastInboundAt"
            THEN incoming."lastInboundAt"
          ELSE contact."lastInboundAt"
        END,
        "lastOutboundAt" = CASE
          WHEN incoming."lastOutboundAt" IS NULL THEN contact."lastOutboundAt"
          WHEN contact."lastOutboundAt" IS NULL OR incoming."lastOutboundAt" > contact."lastOutboundAt"
            THEN incoming."lastOutboundAt"
          ELSE contact."lastOutboundAt"
        END,
        "updatedAt" = NOW()
      FROM (
        VALUES ${Prisma.join(
          contacts.map(
            (group) => Prisma.sql`(
              CAST(${group.contactId} AS TEXT),
              CAST(${group.lastMessageAt} AS TIMESTAMPTZ),
              CAST(${group.lastInboundAt} AS TIMESTAMPTZ),
              CAST(${group.lastOutboundAt} AS TIMESTAMPTZ)
            )`,
          ),
        )}
      ) AS incoming(
        "contactId",
        "lastMessageAt",
        "lastInboundAt",
        "lastOutboundAt"
      )
      WHERE contact."id" = incoming."contactId"
        AND contact."workspaceId" = ${workspaceId}
    `);
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

  private messageGroups(inputs: CrmMessageBatchInput[]) {
    const grouped = new Map<string, CrmMessageBatchInput[]>();
    for (const input of inputs) {
      const values = grouped.get(input.conversation.id) ?? [];
      values.push(input);
      grouped.set(input.conversation.id, values);
    }
    return [...grouped].map(([conversationId, values]) => ({
      conversationId,
      inboundCount: values.filter(
        (input) => input.message.direction === 'INBOUND',
      ).length,
      outboundCount: values.filter(
        (input) => input.message.direction === 'OUTBOUND',
      ).length,
      lastMessageAt: values.reduce(
        (latest, input) =>
          input.message.sentAt > latest ? input.message.sentAt : latest,
        values[0].message.sentAt,
      ),
      lastInboundAt: this.newest(values, 'INBOUND'),
      lastOutboundAt: this.newest(values, 'OUTBOUND'),
    }));
  }

  private contactGroups(inputs: CrmMessageBatchInput[]) {
    const grouped = new Map<string, CrmMessageBatchInput[]>();
    for (const input of inputs) {
      if (!input.conversation.contactId) continue;
      const values = grouped.get(input.conversation.contactId) ?? [];
      values.push(input);
      grouped.set(input.conversation.contactId, values);
    }
    return [...grouped].map(([contactId, values]) => ({
      contactId,
      lastMessageAt: values.reduce(
        (latest, input) =>
          input.message.sentAt > latest ? input.message.sentAt : latest,
        values[0].message.sentAt,
      ),
      lastInboundAt: this.newest(values, 'INBOUND'),
      lastOutboundAt: this.newest(values, 'OUTBOUND'),
    }));
  }
}
