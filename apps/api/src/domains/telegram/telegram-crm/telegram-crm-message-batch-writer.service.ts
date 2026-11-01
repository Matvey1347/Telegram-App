import { applyCrmMessageEdits } from './telegram-crm-message-edits';
import { Injectable, Optional } from '@nestjs/common';
import {
  Prisma,
  TelegramCrmMessageOrigin,
  TelegramCrmReadState,
} from '@prisma/client';
import type { TelegramCrmMtprotoMessage } from '@api/telegram/shared/mtproto/telegram-crm-mtproto.types';
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
    unreadCountOverride?: number;
    lastReadInboxTelegramMessageId?: number | null;
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
  metadataOnly?: boolean;
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
    let inputs = this.dedupe(rawInputs);
    if (!inputs.length)
      return { created: [] as MessageRow[], edited: 0, inputs };
    await tx.$queryRaw(
      Prisma.sql`SELECT id FROM "TelegramCrmConversation" WHERE "workspaceId"=${context.workspaceId} AND id IN (${Prisma.join([...new Set(inputs.map((input) => input.conversation.id))].sort())}) ORDER BY id FOR UPDATE`,
    );
    const tombstones = await tx.telegramCrmDeletedMessage.findMany({
      where: {
        workspaceId: context.workspaceId,
        mtprotoAccountId: context.accountId,
        telegramMessageId: {
          in: inputs.map((input) => input.message.telegramMessageId),
        },
      },
      select: { telegramMessageId: true },
    });
    const deletedIds = new Set(tombstones.map((row) => row.telegramMessageId));
    inputs = inputs.filter(
      (input) => !deletedIds.has(input.message.telegramMessageId),
    );
    const existing = await tx.telegramCrmMessage.findMany({
      where: {
        workspaceId: context.workspaceId,
        mtprotoAccountId: context.accountId,
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
        deletedAt: true,
        contentMetadata: true,
        origin: true,
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
              message.direction === 'INBOUND' &&
              message.telegramMessageId <=
                (fresh.find((entry) => entry.message === message)?.conversation
                  .lastReadInboxTelegramMessageId ?? 0)
                ? TelegramCrmReadState.READ
                : !fresh.find((entry) => entry.message === message)?.edited &&
                    message.direction === 'INBOUND' &&
                    mode === 'live'
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
    const { edited, editedMessages, editedInputs } = await applyCrmMessageEdits(
      tx,
      inputs,
      existingByKey,
      mode,
    );
    const newInputs = insertedInputs.filter(
      (input) => !input.edited && !input.metadataOnly,
    );
    await this.updateCompacts(tx, context.workspaceId, newInputs, mode);
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
              newInputs,
              created.filter((row) =>
                newInputs.some(
                  (input) =>
                    String(input.message.telegramMessageId) ===
                      row.telegramMessageId &&
                    input.conversation.id === row.conversationId,
                ),
              ),
            )
          ).map((item) => item.id)
        : [];
    return {
      created: created.filter((row) =>
        newInputs.some(
          (input) =>
            String(input.message.telegramMessageId) === row.telegramMessageId &&
            input.conversation.id === row.conversationId,
        ),
      ),
      edited: edited + insertedInputs.length - newInputs.length,
      editedMessages: [
        ...editedMessages,
        ...created.filter(
          (row) =>
            !newInputs.some(
              (input) =>
                String(input.message.telegramMessageId) ===
                  row.telegramMessageId &&
                input.conversation.id === row.conversationId,
            ),
        ),
      ],
      inputs: [...insertedInputs, ...editedInputs],
      notificationIds,
    };
  }

  emitAfterCommit(
    workspaceId: string,
    stored: {
      created: MessageRow[];
      edited: number;
      editedMessages?: MessageRow[];
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
    const unreadIncrement = Prisma.sql`(SELECT COUNT(*)::INTEGER FROM jsonb_array_elements_text(incoming."inboundIds") AS ids(value) WHERE ids.value::INTEGER > COALESCE(conversation."unreadSnapshotTopMessageId",0) AND ids.value::INTEGER > COALESCE(conversation."lastReadInboxTelegramMessageId",0))`;
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
        "unreadCount" = conversation."unreadCount" + ${unreadIncrement},
        "readState" = CASE
          WHEN ${unreadIncrement} > 0 THEN ${TelegramCrmReadState.UNREAD}::"TelegramCrmReadState"
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
              CAST(${JSON.stringify(mode === 'live' ? group.inboundIds : [])} AS JSONB)
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
        "inboundIds"
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
      if (
        !current ||
        (input.message.editedAt?.getTime() ?? 0) >=
          (current.message.editedAt?.getTime() ?? 0)
      ) {
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
      inboundIds: values
        .filter((input) => input.message.direction === 'INBOUND')
        .map((input) => input.message.telegramMessageId),
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
