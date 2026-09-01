import { ConflictException } from '@nestjs/common';
import {
  Prisma,
  TelegramCrmDeliveryState,
  TelegramCrmMessageDirection,
  TelegramCrmMessageOrigin,
  TelegramCrmReadState,
} from '@prisma/client';
import { TelegramCrmManualSendService } from './telegram-crm-manual-send.service';

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;
const callArgument = (mock: { mock: { calls: unknown[][] } }): unknown =>
  mock.mock.calls[0]?.[0];

const sentAt = new Date('2026-08-31T10:00:00.000Z');
const messageRow = {
  id: 'message-1',
  workspaceId: 'workspace-1',
  conversationId: 'conversation-1',
  telegramMessageId: '501',
  telegramMessageIdNumeric: 501,
  clientIdempotencyKey: 'client-key-1',
  mtprotoAccountId: 'account-fixed',
  direction: TelegramCrmMessageDirection.OUTBOUND,
  origin: TelegramCrmMessageOrigin.MANUAL,
  sentByMemberId: 'member-1',
  automationExecutionId: null,
  text: 'Hello',
  contentMetadata: null,
  sentAt,
  editedAt: null,
  readState: TelegramCrmReadState.UNKNOWN,
  deliveryState: TelegramCrmDeliveryState.SENT,
  createdAt: sentAt,
};

const conversation = {
  id: 'conversation-1',
  workspaceId: 'workspace-1',
  mtprotoAccountId: 'account-fixed',
  telegramAccessHash: 'access-hash',
  contactId: null,
  peer: {
    id: 'peer-1',
    telegramUserId: '42',
    username: 'recipient',
  },
  contact: null,
};

describe('TelegramCrmManualSendService', () => {
  const authorization = {
    require: jest.fn().mockResolvedValue({
      workspaceId: 'workspace-1',
      memberId: 'member-1',
    }),
    requireOwnOrAny: jest.fn().mockResolvedValue(undefined),
  };

  beforeEach(() => jest.clearAllMocks());

  it('sends from the Conversation account and records MANUAL attribution without consulting automation flags', async () => {
    const handle = {
      sendText: jest.fn().mockResolvedValue({
        telegramMessageId: 501,
        telegramUserId: '42',
        direction: 'OUTBOUND',
        text: 'Hello',
        sentAt,
        editedAt: null,
        contentMetadata: null,
      }),
    };
    const runtime = {
      withAccountHandle: jest.fn(
        async (
          _workspaceId: string,
          _accountId: string,
          _purpose: string,
          operation: (value: typeof handle) => Promise<unknown>,
        ) => operation(handle),
      ),
    };
    const transaction = {
      telegramCrmMessage: {
        findUnique: jest
          .fn()
          .mockResolvedValueOnce(null)
          .mockResolvedValueOnce(null),
        create: jest.fn().mockResolvedValue({
          ...messageRow,
          sentByMember: {
            id: 'member-1',
            user: { name: 'Alice', email: 'alice@example.com' },
          },
        }),
      },
      telegramCrmConversation: { update: jest.fn() },
      telegramAdvertiser: { update: jest.fn() },
    };
    const prisma = {
      telegramCrmConversation: {
        findFirst: jest.fn().mockResolvedValue(conversation),
        updateMany: jest.fn(),
      },
      telegramCrmMessage: { findUnique: jest.fn().mockResolvedValue(null) },
      $transaction: jest.fn(
        async (operation: (tx: unknown) => Promise<unknown>) =>
          operation(transaction),
      ),
    };
    const events = { emit: jest.fn() };
    const service = new TelegramCrmManualSendService(
      prisma as never,
      authorization as never,
      runtime as never,
      events as never,
    );

    await expect(
      service.send('user-1', 'conversation-1', {
        text: ' Hello ',
        clientIdempotencyKey: ' client-key-1 ',
      }),
    ).resolves.toMatchObject({
      idempotentReplay: false,
      message: {
        origin: 'MANUAL',
        sentByMemberId: 'member-1',
        sentByMember: {
          id: 'member-1',
          name: 'Alice',
          email: 'alice@example.com',
        },
        mtprotoAccountId: 'account-fixed',
      },
    });

    expect(runtime.withAccountHandle).toHaveBeenCalledWith(
      'workspace-1',
      'account-fixed',
      'send',
      expect.any(Function),
    );
    const sendCall = callArgument(handle.sendText);
    expect(sendCall).toMatchObject({
      telegramUserId: '42',
      telegramAccessHash: 'access-hash',
      text: 'Hello',
    });
    expect(isRecord(sendCall) && typeof sendCall.randomId === 'bigint').toBe(
      true,
    );
    const createCall = callArgument(transaction.telegramCrmMessage.create);
    expect(createCall).toMatchObject({
      data: {
        mtprotoAccountId: 'account-fixed',
        origin: 'MANUAL',
        sentByMemberId: 'member-1',
      },
    });
    if (!isRecord(createCall) || !isRecord(createCall.data)) {
      throw new Error('Expected a typed Message create call');
    }
    expect(createCall.data).not.toHaveProperty('automationExecutionId');
    expect(events.emit).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'message.sent' }),
    );
  });

  it('replays the same client key without making a second Telegram call', async () => {
    const runtime = { withAccountHandle: jest.fn() };
    const prisma = {
      telegramCrmConversation: {
        findFirst: jest.fn().mockResolvedValue(conversation),
      },
      telegramCrmMessage: {
        findUnique: jest.fn().mockResolvedValue(messageRow),
      },
    };
    const service = new TelegramCrmManualSendService(
      prisma as never,
      authorization as never,
      runtime as never,
      { emit: jest.fn() } as never,
    );

    await expect(
      service.send('user-1', 'conversation-1', {
        text: 'Hello',
        clientIdempotencyKey: 'client-key-1',
      }),
    ).resolves.toMatchObject({ idempotentReplay: true });
    expect(runtime.withAccountHandle).not.toHaveBeenCalled();
  });

  it('promotes a simultaneous TELEGRAM_SYNC echo to MANUAL attribution', async () => {
    const handle = {
      sendText: jest.fn().mockResolvedValue({
        telegramMessageId: 501,
        telegramUserId: '42',
        direction: 'OUTBOUND',
        text: 'Hello',
        sentAt,
        editedAt: null,
        contentMetadata: null,
      }),
    };
    const runtime = {
      withAccountHandle: jest.fn(
        async (
          _workspaceId: string,
          _accountId: string,
          _purpose: string,
          operation: (value: typeof handle) => Promise<unknown>,
        ) => operation(handle),
      ),
    };
    const transaction = {
      telegramCrmMessage: {
        findUnique: jest
          .fn()
          .mockResolvedValueOnce(null)
          .mockResolvedValueOnce({
            ...messageRow,
            clientIdempotencyKey: null,
            origin: TelegramCrmMessageOrigin.TELEGRAM_SYNC,
            sentByMemberId: null,
          }),
        update: jest.fn().mockResolvedValue(messageRow),
        create: jest.fn(),
      },
      telegramCrmConversation: { update: jest.fn() },
      telegramAdvertiser: { update: jest.fn() },
    };
    const prisma = {
      telegramCrmConversation: {
        findFirst: jest.fn().mockResolvedValue(conversation),
      },
      telegramCrmMessage: { findUnique: jest.fn().mockResolvedValue(null) },
      $transaction: jest.fn(
        async (operation: (tx: unknown) => Promise<unknown>) =>
          operation(transaction),
      ),
    };
    const service = new TelegramCrmManualSendService(
      prisma as never,
      authorization as never,
      runtime as never,
      { emit: jest.fn() } as never,
    );

    await expect(
      service.send('user-1', 'conversation-1', {
        text: 'Hello',
        clientIdempotencyKey: 'client-key-1',
      }),
    ).resolves.toMatchObject({ idempotentReplay: false });
    expect(transaction.telegramCrmMessage.create).not.toHaveBeenCalled();
    const echoUpdateCall = callArgument(transaction.telegramCrmMessage.update);
    expect(echoUpdateCall).toMatchObject({
      where: { id: 'message-1' },
      data: {
        origin: TelegramCrmMessageOrigin.MANUAL,
        sentByMemberId: 'member-1',
        clientIdempotencyKey: 'client-key-1',
      },
    });
  });

  it('rejects reusing an idempotency key for different text', async () => {
    const service = new TelegramCrmManualSendService(
      {
        telegramCrmConversation: {
          findFirst: jest.fn().mockResolvedValue(conversation),
        },
        telegramCrmMessage: {
          findUnique: jest.fn().mockResolvedValue(messageRow),
        },
      } as never,
      authorization as never,
      { withAccountHandle: jest.fn() } as never,
      { emit: jest.fn() } as never,
    );

    await expect(
      service.send('user-1', 'conversation-1', {
        text: 'Different',
        clientIdempotencyKey: 'client-key-1',
      }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('converges on the stored Message when concurrent requests race on the unique key', async () => {
    const handle = {
      sendText: jest.fn().mockResolvedValue({
        telegramMessageId: 501,
        telegramUserId: '42',
        direction: 'OUTBOUND',
        text: 'Hello',
        sentAt,
        editedAt: null,
        contentMetadata: null,
      }),
    };
    const runtime = {
      withAccountHandle: jest.fn(
        async (
          _workspaceId: string,
          _accountId: string,
          _purpose: string,
          operation: (value: typeof handle) => Promise<unknown>,
        ) => operation(handle),
      ),
    };
    const prisma = {
      telegramCrmConversation: {
        findFirst: jest.fn().mockResolvedValue(conversation),
      },
      telegramCrmMessage: {
        findUnique: jest
          .fn()
          .mockResolvedValueOnce(null)
          .mockResolvedValueOnce(messageRow),
      },
      $transaction: jest.fn().mockRejectedValue(
        new Prisma.PrismaClientKnownRequestError('unique race', {
          code: 'P2002',
          clientVersion: '7.8.0',
        }),
      ),
    };
    const events = { emit: jest.fn() };
    const service = new TelegramCrmManualSendService(
      prisma as never,
      authorization as never,
      runtime as never,
      events as never,
    );

    await expect(
      service.send('user-1', 'conversation-1', {
        text: 'Hello',
        clientIdempotencyKey: 'client-key-1',
      }),
    ).resolves.toMatchObject({ idempotentReplay: true });
    expect(handle.sendText).toHaveBeenCalledTimes(1);
    expect(events.emit).not.toHaveBeenCalled();
  });
});
