import {
  TelegramCrmDeliveryState,
  TelegramCrmMessageDirection,
  TelegramCrmMessageOrigin,
  TelegramCrmReadState,
} from '@prisma/client';
import type { CrmMessageBatchInput } from './telegram-crm-message-batch-writer.service';
import { TelegramCrmMessageBatchWriter } from './telegram-crm-message-batch-writer.service';

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;
const callArgument = (mock: { mock: { calls: unknown[][] } }): unknown =>
  mock.mock.calls[0]?.[0];

const sentAt = new Date('2026-08-31T10:00:00.000Z');
const input = (
  overrides: Partial<CrmMessageBatchInput> = {},
): CrmMessageBatchInput => ({
  conversation: {
    id: 'conversation-1',
    telegramCrmPeerId: 'peer-1',
    contactId: null,
    unreadCount: 4,
    lastInboundAt: null,
    lastOutboundAt: null,
    lastMessageAt: null,
    contact: null,
  },
  message: {
    telegramMessageId: 501,
    telegramUserId: '42',
    direction: 'INBOUND',
    text: 'Hello',
    sentAt,
    editedAt: null,
    contentMetadata: null,
  },
  ...overrides,
});

const row = {
  id: 'message-1',
  workspaceId: 'workspace-1',
  conversationId: 'conversation-1',
  telegramMessageId: '501',
  telegramMessageIdNumeric: 501,
  clientIdempotencyKey: null,
  mtprotoAccountId: 'account-1',
  direction: TelegramCrmMessageDirection.INBOUND,
  origin: TelegramCrmMessageOrigin.TELEGRAM_SYNC,
  sentByMemberId: null,
  text: 'Hello',
  contentMetadata: null,
  sentAt,
  editedAt: null,
  readState: TelegramCrmReadState.UNREAD,
  deliveryState: TelegramCrmDeliveryState.UNKNOWN,
  createdAt: sentAt,
};

const context = { workspaceId: 'workspace-1', accountId: 'account-1' };

describe('TelegramCrmMessageBatchWriter', () => {
  it('deduplicates a live batch, stores TELEGRAM_SYNC attribution, and increments unread exactly once', async () => {
    const tx = {
      telegramCrmMessage: {
        findMany: jest
          .fn()
          .mockResolvedValueOnce([])
          .mockResolvedValueOnce([row]),
        createManyAndReturn: jest.fn().mockResolvedValue([
          {
            id: row.id,
            conversationId: row.conversationId,
            telegramMessageId: row.telegramMessageId,
          },
        ]),
        update: jest.fn(),
      },
      telegramCrmConversation: { update: jest.fn() },
      telegramAdvertiser: { findUnique: jest.fn(), update: jest.fn() },
    };
    const events = { emit: jest.fn() };
    const writer = new TelegramCrmMessageBatchWriter(events as never);
    const duplicate = input();

    const stored = await writer.store(
      tx as never,
      context,
      [duplicate, duplicate],
      'live',
    );
    writer.emitAfterCommit(context.workspaceId, stored, 'live');

    expect(tx.telegramCrmMessage.createManyAndReturn).toHaveBeenCalledWith(
      expect.objectContaining({
        data: [
          expect.objectContaining({
            origin: TelegramCrmMessageOrigin.TELEGRAM_SYNC,
            direction: TelegramCrmMessageDirection.INBOUND,
            readState: TelegramCrmReadState.UNREAD,
          }),
        ],
      }),
    );
    const createCall = callArgument(tx.telegramCrmMessage.createManyAndReturn);
    if (!isRecord(createCall) || !Array.isArray(createCall.data)) {
      throw new Error('Expected a typed Message createMany call');
    }
    const createdData: unknown = createCall.data[0];
    expect(createdData).not.toHaveProperty('sentByMemberId');
    const conversationUpdateCall = callArgument(
      tx.telegramCrmConversation.update,
    );
    expect(conversationUpdateCall).toMatchObject({
      data: {
        unreadCount: { increment: 1 },
        readState: TelegramCrmReadState.UNREAD,
      },
    });
    expect(events.emit).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'message.received' }),
    );
    expect(events.emit).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'conversation.unreadChanged',
        unreadCount: 5,
      }),
    );
  });

  it('does not mutate compact or unread state during lazy history import', async () => {
    const tx = {
      telegramCrmMessage: {
        findMany: jest
          .fn()
          .mockResolvedValueOnce([])
          .mockResolvedValueOnce([row]),
        createManyAndReturn: jest.fn().mockResolvedValue([
          {
            id: row.id,
            conversationId: row.conversationId,
            telegramMessageId: row.telegramMessageId,
          },
        ]),
        update: jest.fn(),
      },
      telegramCrmConversation: { update: jest.fn() },
      telegramAdvertiser: { findUnique: jest.fn(), update: jest.fn() },
    };
    const events = { emit: jest.fn() };
    const writer = new TelegramCrmMessageBatchWriter(events as never);

    const stored = await writer.store(
      tx as never,
      context,
      [input()],
      'history',
    );
    writer.emitAfterCommit(context.workspaceId, stored, 'history');

    expect(tx.telegramCrmConversation.update).not.toHaveBeenCalled();
    expect(events.emit).not.toHaveBeenCalled();
  });

  it('stores an external outgoing message as TELEGRAM_SYNC without fictional Member attribution', async () => {
    const outboundRow = {
      ...row,
      direction: TelegramCrmMessageDirection.OUTBOUND,
      readState: TelegramCrmReadState.UNKNOWN,
    };
    const tx = {
      telegramCrmMessage: {
        findMany: jest
          .fn()
          .mockResolvedValueOnce([])
          .mockResolvedValueOnce([outboundRow]),
        createManyAndReturn: jest.fn().mockResolvedValue([
          {
            id: row.id,
            conversationId: row.conversationId,
            telegramMessageId: row.telegramMessageId,
          },
        ]),
        update: jest.fn(),
      },
      telegramCrmConversation: { update: jest.fn() },
      telegramAdvertiser: { findUnique: jest.fn(), update: jest.fn() },
    };
    const events = { emit: jest.fn() };
    const writer = new TelegramCrmMessageBatchWriter(events as never);
    const outbound = input({
      message: { ...input().message, direction: 'OUTBOUND' },
    });

    const stored = await writer.store(tx as never, context, [outbound], 'live');
    writer.emitAfterCommit(context.workspaceId, stored, 'live');

    const createCall = callArgument(tx.telegramCrmMessage.createManyAndReturn);
    if (!isRecord(createCall) || !Array.isArray(createCall.data)) {
      throw new Error('Expected a typed Message createMany call');
    }
    const data: unknown = createCall.data[0];
    expect(data).toMatchObject({
      direction: TelegramCrmMessageDirection.OUTBOUND,
      origin: TelegramCrmMessageOrigin.TELEGRAM_SYNC,
    });
    expect(data).not.toHaveProperty('sentByMemberId');
    const conversationUpdateCall = callArgument(
      tx.telegramCrmConversation.update,
    );
    if (!isRecord(conversationUpdateCall)) {
      throw new Error('Expected a typed Conversation update call');
    }
    expect(conversationUpdateCall.data).not.toHaveProperty('unreadCount');
    expect(events.emit).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'message.sent' }),
    );
    expect(events.emit).not.toHaveBeenCalledWith(
      expect.objectContaining({ type: 'conversation.unreadChanged' }),
    );
  });

  it('updates an edited Telegram message without inserting a duplicate and emits a compact invalidation', async () => {
    const editedAt = new Date('2026-08-31T11:00:00.000Z');
    const tx = {
      telegramCrmMessage: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'message-1',
            conversationId: 'conversation-1',
            telegramMessageId: '501',
            text: 'Old',
            editedAt: null,
          },
        ]),
        createManyAndReturn: jest.fn(),
        update: jest.fn(),
      },
      telegramCrmConversation: { update: jest.fn() },
      telegramAdvertiser: { findUnique: jest.fn(), update: jest.fn() },
    };
    const events = { emit: jest.fn() };
    const writer = new TelegramCrmMessageBatchWriter(events as never);
    const edited = input({
      edited: true,
      message: { ...input().message, text: 'Edited', editedAt },
    });

    const stored = await writer.store(tx as never, context, [edited], 'live');
    writer.emitAfterCommit(context.workspaceId, stored, 'live');

    expect(stored).toMatchObject({ created: [], edited: 1 });
    expect(tx.telegramCrmMessage.createManyAndReturn).not.toHaveBeenCalled();
    expect(tx.telegramCrmMessage.update).toHaveBeenCalledWith({
      where: { id: 'message-1' },
      data: { text: 'Edited', editedAt },
    });
    expect(tx.telegramCrmConversation.update).not.toHaveBeenCalled();
    expect(events.emit).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'inbox.updated', peerId: 'peer-1' }),
    );
    expect(events.emit).not.toHaveBeenCalledWith(
      expect.objectContaining({ type: 'conversation.unreadChanged' }),
    );
  });

  it('updates snapshot compacts without incrementing dialog unread', async () => {
    const tx = {
      telegramCrmMessage: {
        findMany: jest
          .fn()
          .mockResolvedValueOnce([])
          .mockResolvedValueOnce([row]),
        createManyAndReturn: jest.fn().mockResolvedValue([
          {
            id: row.id,
            conversationId: row.conversationId,
            telegramMessageId: row.telegramMessageId,
          },
        ]),
        update: jest.fn(),
      },
      telegramCrmConversation: { update: jest.fn() },
      telegramAdvertiser: { findUnique: jest.fn(), update: jest.fn() },
    };
    const events = { emit: jest.fn() };
    const writer = new TelegramCrmMessageBatchWriter(events as never);

    const stored = await writer.store(
      tx as never,
      context,
      [input()],
      'snapshot',
    );
    writer.emitAfterCommit(context.workspaceId, stored, 'snapshot');
    writer.emitAfterCommit(
      context.workspaceId,
      {
        created: [],
        edited: 0,
        inputs: [
          input({
            conversation: {
              ...input().conversation,
              id: 'conversation-linked',
              contactId: 'contact-1',
              contact: { ownerMemberId: 'member-1' },
            },
          }),
        ],
      },
      'snapshot',
    );

    const conversationUpdateCall = callArgument(
      tx.telegramCrmConversation.update,
    );
    if (!isRecord(conversationUpdateCall)) {
      throw new Error('Expected a typed Conversation update call');
    }
    expect(conversationUpdateCall.data).not.toHaveProperty('unreadCount');
    expect(conversationUpdateCall.data).not.toHaveProperty('readState');
    expect(events.emit).not.toHaveBeenCalledWith(
      expect.objectContaining({ type: 'message.received' }),
    );
    expect(events.emit).not.toHaveBeenCalledWith(
      expect.objectContaining({ type: 'message.sent' }),
    );
    expect(events.emit).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'inbox.updated', peerId: 'peer-1' }),
    );
    expect(events.emit).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'contact.updated',
        contactId: 'contact-1',
      }),
    );
  });

  it('publishes exactly one same-transaction notification only after the live batch commits', async () => {
    const tx = {
      telegramCrmMessage: {
        findMany: jest
          .fn()
          .mockResolvedValueOnce([])
          .mockResolvedValueOnce([row]),
        createManyAndReturn: jest.fn().mockResolvedValue([
          {
            id: row.id,
            conversationId: row.conversationId,
            telegramMessageId: row.telegramMessageId,
          },
        ]),
        update: jest.fn(),
      },
      telegramCrmConversation: { update: jest.fn() },
      telegramAdvertiser: { findUnique: jest.fn(), update: jest.fn() },
    };
    const events = { emit: jest.fn() };
    const publisher = { publish: jest.fn().mockResolvedValue(undefined) };
    const projector = {
      project: jest.fn().mockResolvedValue([{ id: 'notification-1' }]),
    };
    const writer = new TelegramCrmMessageBatchWriter(
      events as never,
      publisher as never,
      projector as never,
    );

    const stored = await writer.store(tx as never, context, [input()], 'live');
    expect(stored.notificationIds).toEqual(['notification-1']);
    expect(publisher.publish).not.toHaveBeenCalled();

    writer.emitAfterCommit(context.workspaceId, stored, 'live');
    expect(publisher.publish).toHaveBeenCalledTimes(1);
    expect(publisher.publish).toHaveBeenCalledWith(['notification-1']);

    const duplicateTx = {
      telegramCrmMessage: {
        findMany: jest.fn().mockResolvedValue([]),
        createManyAndReturn: jest.fn().mockResolvedValue([]),
        update: jest.fn(),
      },
      telegramCrmConversation: { update: jest.fn() },
      telegramAdvertiser: { findUnique: jest.fn(), update: jest.fn() },
    };
    const duplicate = await writer.store(
      duplicateTx as never,
      context,
      [input()],
      'live',
    );
    writer.emitAfterCommit(context.workspaceId, duplicate, 'live');
    expect(publisher.publish).toHaveBeenCalledTimes(1);
  });
});
