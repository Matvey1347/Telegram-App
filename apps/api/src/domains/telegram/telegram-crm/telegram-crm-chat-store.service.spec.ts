const containing = (value: Record<string, unknown>): unknown =>
  expect.objectContaining(value);
import {
  TelegramCrmChatStore,
  applyCrmChatDeletion,
} from './telegram-crm-chat-store.service';
const conversation = {
  id: 'conversation',
  workspaceId: 'workspace',
  mtprotoAccountId: 'account',
  contactId: null,
  contact: null,
};
const sentAt = new Date('2026-10-31T12:00:00Z');
const row = {
  id: 'message',
  workspaceId: 'workspace',
  conversationId: 'conversation',
  mtprotoAccountId: 'account',
  telegramMessageId: '20',
  telegramMessageIdNumeric: 20,
  clientIdempotencyKey: null,
  direction: 'OUTBOUND',
  origin: 'MANUAL',
  sentByMemberId: 'member',
  text: 'hello',
  contentMetadata: { telegramText: true },
  sentAt,
  editedAt: null,
  deletedAt: null,
  readState: 'READ',
  deliveryState: 'SENT',
  createdAt: sentAt,
};
const remote = {
  telegramUserId: '42',
  telegramMessageId: 20,
  direction: 'OUTBOUND' as const,
  text: 'hello',
  contentMetadata: null,
  sentAt,
  editedAt: null,
};
function setup() {
  const tx = {
    telegramCrmConversation: {
      findMany: jest
        .fn()
        .mockResolvedValue([
          { id: 'conversation', mtprotoAccountId: 'account', contactId: null },
        ]),
    },
    operationsNotification: {
      findMany: jest.fn().mockResolvedValue([{ recipientMemberId: 'member' }]),
      deleteMany: jest.fn(),
    },
    telegramCrmDeletedMessage: {
      findUnique: jest.fn().mockResolvedValue(null),
      findMany: jest.fn().mockResolvedValue([]),
      createMany: jest.fn(),
    },
    telegramCrmMessage: {
      findUnique: jest.fn().mockResolvedValue(row),
      findMany: jest.fn().mockResolvedValue([]),
      findFirst: jest.fn().mockResolvedValue(null),
      update: jest.fn().mockImplementation(({ data }: { data: object }) => ({
        ...row,
        ...data,
      })),
      create: jest.fn(),
    },
    $queryRaw: jest.fn().mockResolvedValue([{ unreadCount: 2 }]),
    $executeRaw: jest.fn(),
  };
  const prisma = {
    $transaction: jest.fn((fn: (value: typeof tx) => unknown) => fn(tx)),
  };
  const events = { emit: jest.fn() };
  return {
    tx,
    events,
    service: new TelegramCrmChatStore(prisma as never, events as never),
  };
}
describe('TelegramCrmChatStore', () => {
  it('does no projection write for unchanged metadata/text', async () => {
    const x = setup();
    await x.service.confirmed(conversation as never, remote, 'member');
    expect(x.tx.telegramCrmMessage.update).not.toHaveBeenCalled();
    expect(x.tx.telegramCrmMessage.create).not.toHaveBeenCalled();
  });
  it('preserves receipt hash/AI identity during reaction projection', async () => {
    const x = setup();
    x.tx.telegramCrmMessage.findUnique.mockResolvedValue({
      ...row,
      contentMetadata: {
        manualRequestHash: 'hash',
        aiDraftId: 'draft',
        aiDraftRevision: 2,
        requestReplyToMessageId: 'reply',
      },
    });
    await x.service.confirmed(
      conversation as never,
      {
        ...remote,
        contentMetadata: {
          reactions: [{ emoji: '👍', count: 1, chosen: true }],
        },
      },
      'member',
    );
    expect(x.tx.telegramCrmMessage.update).toHaveBeenCalledWith(
      containing({
        data: containing({
          contentMetadata: containing({
            manualRequestHash: 'hash',
            aiDraftId: 'draft',
            reactions: [{ emoji: '👍', count: 1, chosen: true }],
          }),
        }),
      }),
    );
  });
  it('does not resurrect account tombstone following deletion', async () => {
    const x = setup();
    x.tx.telegramCrmDeletedMessage.findUnique.mockResolvedValue({
      telegramMessageId: 20,
    });
    await expect(
      x.service.confirmed(conversation as never, remote, 'member'),
    ).rejects.toThrow('ALREADY_DELETED');
    expect(x.tx.telegramCrmMessage.create).not.toHaveBeenCalled();
  });
  it('ignores an older edit response', async () => {
    const x = setup();
    x.tx.telegramCrmMessage.findUnique.mockResolvedValue({
      ...row,
      editedAt: new Date('2026-10-31T12:05:00Z'),
    });
    await x.service.confirmed(
      conversation as never,
      { ...remote, editedAt: new Date('2026-10-31T12:02:00Z') },
      'member',
    );
    expect(x.tx.telegramCrmMessage.update).not.toHaveBeenCalled();
  });
  it('records unknown local IDs without fake message rows', async () => {
    const x = setup();
    expect(
      await applyCrmChatDeletion(x.tx as never, conversation, [20, 21]),
    ).toBeNull();
    expect(x.tx.telegramCrmDeletedMessage.createMany).toHaveBeenCalledWith({
      data: [
        {
          workspaceId: 'workspace',
          mtprotoAccountId: 'account',
          telegramMessageId: 20,
        },
        {
          workspaceId: 'workspace',
          mtprotoAccountId: 'account',
          telegramMessageId: 21,
        },
      ],
      skipDuplicates: true,
    });
    expect(x.tx.telegramCrmMessage.create).not.toHaveBeenCalled();
  });
  it('skips repeated tombstone inserts and unchanged compacts', async () => {
    const x = setup();
    x.tx.telegramCrmDeletedMessage.findMany.mockResolvedValue([
      { telegramMessageId: 20 },
    ] as never);
    await applyCrmChatDeletion(x.tx as never, conversation, [20]);
    expect(x.tx.telegramCrmDeletedMessage.createMany).not.toHaveBeenCalled();
    expect(x.tx.$executeRaw).not.toHaveBeenCalled();
  });
  it('bulk strips deleted body and emits only deletion after commit', async () => {
    const x = setup();
    x.tx.telegramCrmMessage.findMany.mockResolvedValue([
      {
        id: 'message',
        direction: 'INBOUND',
        readState: 'UNREAD',
        contentMetadata: {},
      },
    ] as never);
    await x.service.deleted(conversation, [20]);
    expect(x.tx.$executeRaw).toHaveBeenCalledTimes(1);
    expect(x.events.emit).toHaveBeenCalledWith(
      containing({
        type: 'message.deleted',
        messageIds: ['message'],
        unreadCount: 2,
        lastMessage: null,
      }),
    );
    expect(x.events.emit).not.toHaveBeenCalledWith(
      containing({ type: 'message.received' }),
    );
  });
});
