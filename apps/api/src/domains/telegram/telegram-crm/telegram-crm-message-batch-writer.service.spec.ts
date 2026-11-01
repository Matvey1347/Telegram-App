const containing = (value: Record<string, unknown>): unknown =>
  expect.objectContaining(value);
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
const editQueries = (mock: { mock: { calls: unknown[][] } }) =>
  mock.mock.calls.flatMap(([query]) =>
    isRecord(query) &&
    typeof query.sql === 'string' &&
    query.sql.includes('UPDATE "TelegramCrmMessage"') &&
    Array.isArray(query.values)
      ? [{ sql: query.sql, values: query.values as unknown[] }]
      : [],
  );

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
      $queryRaw: jest.fn().mockResolvedValue([]),
      telegramCrmDeletedMessage: { findMany: jest.fn().mockResolvedValue([]) },
      $executeRaw: jest.fn().mockResolvedValue(1),
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
      containing({
        data: [
          containing({
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
    expect(tx.$executeRaw).toHaveBeenCalledTimes(1);
    expect(events.emit).toHaveBeenCalledWith(
      containing({ type: 'message.received' }),
    );
    expect(events.emit).toHaveBeenCalledWith(
      containing({
        type: 'conversation.unreadChanged',
        unreadCount: 5,
      }),
    );
  });

  it('does not mutate compact or unread state during lazy history import', async () => {
    const tx = {
      $queryRaw: jest.fn().mockResolvedValue([]),
      telegramCrmDeletedMessage: { findMany: jest.fn().mockResolvedValue([]) },
      $executeRaw: jest.fn().mockResolvedValue(1),
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

    expect(tx.$executeRaw).toHaveBeenCalledTimes(1);
    expect(events.emit).not.toHaveBeenCalled();
  });

  it('stores an external outgoing message as TELEGRAM_SYNC without fictional Member attribution', async () => {
    const outboundRow = {
      ...row,
      direction: TelegramCrmMessageDirection.OUTBOUND,
      readState: TelegramCrmReadState.UNKNOWN,
    };
    const tx = {
      $queryRaw: jest.fn().mockResolvedValue([]),
      telegramCrmDeletedMessage: { findMany: jest.fn().mockResolvedValue([]) },
      $executeRaw: jest.fn().mockResolvedValue(1),
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
    expect(tx.$executeRaw).toHaveBeenCalledTimes(1);
    expect(events.emit).toHaveBeenCalledWith(
      containing({ type: 'message.sent' }),
    );
    expect(events.emit).not.toHaveBeenCalledWith(
      containing({ type: 'conversation.unreadChanged' }),
    );
  });

  it('updates an edited Telegram message without inserting a duplicate and emits its authoritative content', async () => {
    const editedAt = new Date('2026-08-31T11:00:00.000Z');
    const tx = {
      $queryRaw: jest.fn().mockResolvedValue([{ id: row.id }]),
      telegramCrmDeletedMessage: { findMany: jest.fn().mockResolvedValue([]) },
      $executeRaw: jest.fn().mockResolvedValue(1),
      telegramCrmMessage: {
        findMany: jest
          .fn()
          .mockResolvedValueOnce([
            {
              id: 'message-1',
              conversationId: 'conversation-1',
              telegramMessageId: '501',
              text: 'Old',
              editedAt: null,
            },
          ])
          .mockResolvedValue([
            {
              ...row,
              text: 'Edited',
              editedAt,
              contentMetadata: { telegramText: true },
            },
          ]),
        createManyAndReturn: jest.fn(),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        findUniqueOrThrow: jest
          .fn()
          .mockResolvedValue({ ...row, text: 'Edited', editedAt }),
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
    expect(editQueries(tx.$queryRaw)).toEqual([
      containing({
        values: [
          row.id,
          null,
          'Edited',
          editedAt,
          JSON.stringify({ telegramText: true }),
          context.workspaceId,
          context.accountId,
        ],
      }),
    ]);
    expect(tx.telegramCrmConversation.update).not.toHaveBeenCalled();
    expect(events.emit).toHaveBeenCalledWith(
      containing({ type: 'inbox.updated', peerId: 'peer-1' }),
    );
    expect(events.emit).toHaveBeenCalledWith(
      containing({
        type: 'message.updated',
        workspaceId: context.workspaceId,
        conversationId: row.conversationId,
        message: containing({
          id: row.id,
          text: 'Edited',
          editedAt: editedAt.toISOString(),
        }),
      }),
    );
    expect(tx.telegramCrmMessage.findMany).toHaveBeenCalledTimes(2);
    expect(events.emit).not.toHaveBeenCalledWith(
      containing({ type: 'conversation.unreadChanged' }),
    );
  });

  it('updates snapshot compacts without incrementing dialog unread', async () => {
    const tx = {
      $queryRaw: jest.fn().mockResolvedValue([]),
      telegramCrmDeletedMessage: { findMany: jest.fn().mockResolvedValue([]) },
      $executeRaw: jest.fn().mockResolvedValue(1),
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

    expect(tx.$executeRaw).toHaveBeenCalledTimes(1);
    expect(events.emit).not.toHaveBeenCalledWith(
      containing({ type: 'message.received' }),
    );
    expect(events.emit).not.toHaveBeenCalledWith(
      containing({ type: 'message.sent' }),
    );
    expect(events.emit).toHaveBeenCalledWith(
      containing({ type: 'inbox.updated', peerId: 'peer-1' }),
    );
    expect(events.emit).toHaveBeenCalledWith(
      containing({
        type: 'contact.updated',
        contactId: 'contact-1',
      }),
    );
  });

  it('publishes exactly one same-transaction notification only after the live batch commits', async () => {
    const tx = {
      $queryRaw: jest.fn().mockResolvedValue([]),
      telegramCrmDeletedMessage: { findMany: jest.fn().mockResolvedValue([]) },
      $executeRaw: jest.fn().mockResolvedValue(1),
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
    const responseCache = { clearWorkspacePath: jest.fn() };
    const projector = {
      project: jest.fn().mockResolvedValue([{ id: 'notification-1' }]),
    };
    const writer = new TelegramCrmMessageBatchWriter(
      events as never,
      publisher as never,
      projector as never,
      responseCache as never,
    );

    const stored = await writer.store(tx as never, context, [input()], 'live');
    expect(stored.notificationIds).toEqual(['notification-1']);
    expect(publisher.publish).not.toHaveBeenCalled();

    writer.emitAfterCommit(context.workspaceId, stored, 'live');
    expect(publisher.publish).toHaveBeenCalledTimes(1);
    expect(publisher.publish).toHaveBeenCalledWith(['notification-1']);
    expect(responseCache.clearWorkspacePath).toHaveBeenCalledWith(
      'workspace-1',
      '/telegram-crm/conversations/conversation-1/messages',
    );

    const duplicateTx = {
      $queryRaw: jest.fn().mockResolvedValue([]),
      telegramCrmDeletedMessage: { findMany: jest.fn().mockResolvedValue([]) },
      $executeRaw: jest.fn().mockResolvedValue(1),
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

describe('Chat action event ordering regressions', () => {
  const fixture = (existing: unknown[] = [], tombstones: unknown[] = []) => {
    const tx = {
      $queryRaw: jest.fn().mockResolvedValue([{ id: row.id }]),
      $executeRaw: jest.fn(),
      telegramCrmDeletedMessage: {
        findMany: jest.fn().mockResolvedValue(tombstones),
      },
      telegramCrmMessage: {
        findMany: jest
          .fn()
          .mockResolvedValueOnce(existing)
          .mockResolvedValue([row]),
        createManyAndReturn: jest.fn().mockResolvedValue([
          {
            id: row.id,
            conversationId: row.conversationId,
            telegramMessageId: row.telegramMessageId,
          },
        ]),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        findUniqueOrThrow: jest.fn().mockResolvedValue(row),
      },
    };
    const events = { emit: jest.fn<void, [{ type: string }]>() };
    return {
      tx,
      events,
      writer: new TelegramCrmMessageBatchWriter(events as never),
    };
  };
  it('edit before original emits an update without unread, compact or incoming notification work', async () => {
    const f = fixture();
    const stored = await f.writer.store(
      f.tx as never,
      context,
      [input({ edited: true })],
      'live',
    );
    f.writer.emitAfterCommit(context.workspaceId, stored, 'live');
    expect(stored.created).toEqual([]);
    expect(stored.edited).toBe(1);
    expect(f.tx.$executeRaw).not.toHaveBeenCalled();
    expect(f.events.emit.mock.calls.map(([event]) => event.type)).not.toContain(
      'message.received',
    );
    expect(f.events.emit.mock.calls.map(([event]) => event.type)).not.toContain(
      'conversation.unreadChanged',
    );
  });
  it('account-scoped deletion identity blocks delayed history and new messages', async () => {
    const f = fixture([], [{ telegramMessageId: 501 }]);
    const stored = await f.writer.store(
      f.tx as never,
      context,
      [input()],
      'live',
    );
    expect(stored.created).toEqual([]);
    expect(f.tx.telegramCrmMessage.createManyAndReturn).not.toHaveBeenCalled();
    expect(f.tx.$executeRaw).not.toHaveBeenCalled();
    expect(f.tx.telegramCrmDeletedMessage.findMany).toHaveBeenCalledWith(
      containing({
        where: containing({
          workspaceId: context.workspaceId,
          mtprotoAccountId: context.accountId,
        }),
      }),
    );
  });
  it('older edit cannot overwrite a newer edit', async () => {
    const f = fixture([{ ...row, editedAt: new Date('2026-09-02') }]);
    const stored = await f.writer.store(
      f.tx as never,
      context,
      [
        input({
          edited: true,
          message: {
            ...input().message,
            text: 'old',
            editedAt: new Date('2026-09-01'),
          },
        }),
      ],
      'live',
    );
    expect(stored.edited).toBe(0);
    expect(editQueries(f.tx.$queryRaw)).toEqual([]);
  });
  it('unchanged entity snapshots do not write despite JSON key ordering', async () => {
    const f = fixture([
      { ...row, contentMetadata: { telegramText: true, entities: [] } },
    ]);
    const stored = await f.writer.store(
      f.tx as never,
      context,
      [
        input({
          edited: true,
          message: {
            ...input().message,
            contentMetadata: { entities: [], telegramText: true },
          },
        }),
      ],
      'live',
    );
    expect(stored.edited).toBe(0);
    expect(editQueries(f.tx.$queryRaw)).toEqual([]);
  });
  it('entity-only edits persist without changing compact message/unread facts', async () => {
    const f = fixture([{ ...row, contentMetadata: { telegramText: true } }]);
    const stored = await f.writer.store(
      f.tx as never,
      context,
      [
        input({
          edited: true,
          message: {
            ...input().message,
            contentMetadata: {
              entities: [{ type: 'bold', offset: 0, length: 5 }],
            },
          },
        }),
      ],
      'live',
    );
    expect(stored.edited).toBe(1);
    expect(f.tx.$executeRaw).not.toHaveBeenCalled();
    expect(editQueries(f.tx.$queryRaw)[0].values).toContain(
      JSON.stringify({
        entities: [{ type: 'bold', offset: 0, length: 5 }],
        telegramText: true,
      }),
    );
  });
  it('a complete empty snapshot clears the final reaction and formatting while retaining only receipt identity', async () => {
    const f = fixture([
      {
        ...row,
        contentMetadata: {
          reactions: [{ emoji: '👍', count: 1 }],
          entities: [{ type: 'bold', offset: 0, length: 5 }],
          manualRequestHash: 'receipt',
        },
      },
    ]);
    await f.writer.store(
      f.tx as never,
      context,
      [input({ edited: true })],
      'live',
    );
    expect(editQueries(f.tx.$queryRaw)[0].values).toContain(
      JSON.stringify({ manualRequestHash: 'receipt', telegramText: true }),
    );
  });
});
