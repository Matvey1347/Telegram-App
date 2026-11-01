const containing = (value: Record<string, unknown>): unknown =>
  expect.objectContaining(value);
import { ConflictException, ForbiddenException } from '@nestjs/common';
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
    refresh: jest.fn().mockResolvedValue({}),
    require: jest.fn().mockResolvedValue({
      workspaceId: 'workspace-1',
      memberId: 'member-1',
    }),
    requireOwnOrAny: jest.fn().mockResolvedValue(undefined),
    scope: jest.fn().mockResolvedValue({}),
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
      $queryRaw: jest.fn().mockResolvedValue([]),
      telegramCrmDeletedMessage: {
        findUnique: jest.fn().mockResolvedValue(null),
      },
      $executeRaw: jest.fn(),
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
      telegramAdvertiser: {
        findFirst: jest.fn().mockResolvedValue({ manualSalesStatus: null }),
      },
      telegramCrmConversation: {
        findFirst: jest.fn().mockResolvedValue({
          ...conversation,
          contactId: 'contact-1',
          contact: { ownerMemberId: 'member-1' },
        }),
        updateMany: jest.fn(),
      },
      telegramCrmMessage: { findUnique: jest.fn().mockResolvedValue(null) },
      $transaction: jest.fn(
        async (operation: (tx: unknown) => Promise<unknown>) =>
          operation(transaction),
      ),
    };
    const events = { emit: jest.fn() };
    const responseCache = { clearWorkspacePath: jest.fn() };
    const service = new TelegramCrmManualSendService(
      prisma as never,
      authorization as never,
      runtime as never,
      events as never,
      responseCache as never,
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
    const compactQueries = transaction.$executeRaw.mock.calls.map(
      (args: unknown[]) => args[0] as Prisma.Sql,
    );
    expect(compactQueries).toHaveLength(2);
    expect(compactQueries[0].sql).toContain('GREATEST("lastMessageAt",');
    expect(compactQueries[0].sql).not.toContain('"lastInboundAt" =');
    expect(compactQueries[0].values).toContain('workspace-1');
    expect(compactQueries[1].sql).toContain('GREATEST("lastContactAt",');
    expect(events.emit).toHaveBeenCalledWith(
      containing({ type: 'message.sent' }),
    );
    expect(responseCache.clearWorkspacePath).toHaveBeenCalledWith(
      'workspace-1',
      '/telegram-crm/conversations/conversation-1/messages',
    );
    expect(responseCache.clearWorkspacePath).toHaveBeenCalledWith(
      'workspace-1',
      '/telegram-crm/contacts',
    );
  });

  it('replays the same client key without making a second Telegram call', async () => {
    const runtime = { withAccountHandle: jest.fn() };
    const prisma = {
      telegramAdvertiser: {
        findFirst: jest.fn().mockResolvedValue({ manualSalesStatus: null }),
      },
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

  it.each([
    '**Package pricing**',
    '__Welcome__',
    '[Statistics](https://example.com/report)',
  ])(
    'replays a lost response for formatted body %s without another protocol send',
    async (body) => {
      const stored = { ...messageRow, text: body };
      const handle = {
        sendText: jest
          .fn()
          .mockResolvedValue({ telegramMessageId: 501, sentAt }),
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
      const tx = {
        $queryRaw: jest.fn().mockResolvedValue([]),
        telegramCrmDeletedMessage: {
          findUnique: jest.fn().mockResolvedValue(null),
        },
        $executeRaw: jest.fn(),
        telegramCrmMessage: {
          findUnique: jest.fn().mockResolvedValue(null),
          create: jest.fn().mockResolvedValue(stored),
        },
        telegramCrmConversation: { update: jest.fn() },
      };
      const prisma = {
        telegramCrmConversation: {
          findFirst: jest.fn().mockResolvedValue(conversation),
        },
        telegramCrmMessage: {
          findUnique: jest
            .fn()
            .mockResolvedValueOnce(null)
            .mockResolvedValue(stored),
        },
        $transaction: jest.fn(
          async (operation: (transaction: typeof tx) => Promise<unknown>) =>
            operation(tx),
        ),
      };
      const events = { emit: jest.fn() };
      const service = new TelegramCrmManualSendService(
        prisma as never,
        authorization as never,
        runtime as never,
        events as never,
      );
      const request = {
        text: ` ${body} `,
        clientIdempotencyKey: messageRow.clientIdempotencyKey,
      };

      // The first response is lost after Telegram and the database accepted it.
      await service.send('user-1', conversation.id, request);
      const replay = await service.send('user-1', conversation.id, request);

      expect(replay).toMatchObject({
        idempotentReplay: true,
        message: { id: stored.id, text: body },
      });
      expect(handle.sendText).toHaveBeenCalledTimes(1);
      expect(prisma.$transaction).toHaveBeenCalledTimes(1);
      expect(
        events.emit.mock.calls.filter(
          ([event]: unknown[]) =>
            isRecord(event) && event.type === 'message.sent',
        ),
      ).toHaveLength(1);
    },
  );

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
      $queryRaw: jest.fn().mockResolvedValue([]),
      telegramCrmDeletedMessage: {
        findUnique: jest.fn().mockResolvedValue(null),
      },
      $executeRaw: jest.fn(),
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
      telegramAdvertiser: {
        findFirst: jest.fn().mockResolvedValue({ manualSalesStatus: null }),
      },
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

  it('converges on formatted stored content when concurrent requests race on the unique key', async () => {
    const body = '**Hello**';
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
      telegramAdvertiser: {
        findFirst: jest.fn().mockResolvedValue({ manualSalesStatus: null }),
      },
      telegramCrmConversation: {
        findFirst: jest.fn().mockResolvedValue(conversation),
      },
      telegramCrmMessage: {
        findUnique: jest
          .fn()
          .mockResolvedValueOnce(null)
          .mockResolvedValueOnce({ ...messageRow, text: body }),
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
        text: body,
        clientIdempotencyKey: 'client-key-1',
      }),
    ).resolves.toMatchObject({ idempotentReplay: true });
    expect(handle.sendText).toHaveBeenCalledTimes(1);
    expect(events.emit).not.toHaveBeenCalled();
  });
});

describe('manual commercial DNC protection', () => {
  const authorization = {
    refresh: jest.fn().mockResolvedValue({}),
    require: jest
      .fn()
      .mockResolvedValue({ workspaceId: 'workspace-a', memberId: 'member-a' }),
    requireOwnOrAny: jest.fn(),
    scope: jest.fn().mockResolvedValue({}),
  };
  it('blocks a DNC client before creating a protocol handle', async () => {
    const runtime = { withAccountHandle: jest.fn() };
    const prisma = {
      telegramCrmConversation: {
        findFirst: jest.fn().mockResolvedValue({
          ...conversation,
          contactId: 'client-a',
          contact: {
            ownerMemberId: 'member-a',
            manualSalesStatus: 'DO_NOT_CONTACT',
          },
        }),
      },
      telegramCrmMessage: { findUnique: jest.fn().mockResolvedValue(null) },
    };
    const service = new TelegramCrmManualSendService(
      prisma as never,
      authorization as never,
      runtime as never,
      { emit: jest.fn() } as never,
    );
    await expect(
      service.send('user-a', conversation.id, {
        text: 'Offer',
        clientIdempotencyKey: 'new-key',
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(runtime.withAccountHandle).not.toHaveBeenCalled();
  });
  it('rechecks DNC after awaiting account capacity and before the actual send', async () => {
    const handle = { sendText: jest.fn() };
    const runtime = {
      withAccountHandle: jest.fn(
        (
          _workspace: string,
          _account: string,
          _purpose: string,
          operation: (value: typeof handle) => Promise<unknown>,
        ) => operation(handle),
      ),
    };
    const prisma = {
      telegramCrmConversation: {
        findFirst: jest
          .fn()
          .mockResolvedValueOnce({
            ...conversation,
            contactId: 'client-a',
            contact: { ownerMemberId: 'member-a', manualSalesStatus: null },
          })
          .mockResolvedValue({
            ...conversation,
            contactId: 'client-a',
            contact: {
              ownerMemberId: 'member-a',
              manualSalesStatus: 'DO_NOT_CONTACT',
            },
          }),
      },
      telegramCrmMessage: { findUnique: jest.fn().mockResolvedValue(null) },
      telegramAdvertiser: {
        findFirst: jest
          .fn()
          .mockResolvedValue({ manualSalesStatus: 'DO_NOT_CONTACT' }),
      },
    };
    const service = new TelegramCrmManualSendService(
      prisma as never,
      authorization as never,
      runtime as never,
      { emit: jest.fn() } as never,
    );
    await expect(
      service.send('user-a', conversation.id, {
        text: 'Offer',
        clientIdempotencyKey: 'new-key',
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(handle.sendText).not.toHaveBeenCalled();
  });
});

describe('queued manual send current client protection', () => {
  it.each([null, 'client-before'])(
    'blocks a newly linked DNC client after handle wait (previous link %s)',
    async (previousContactId) => {
      let release!: () => void;
      let entered!: () => void;
      const wait = new Promise<void>((resolve) => {
        release = resolve;
      });
      const started = new Promise<void>((resolve) => {
        entered = resolve;
      });
      const handle = { sendText: jest.fn() };
      const runtime = {
        withAccountHandle: jest.fn(
          async (
            _workspace: string,
            _account: string,
            _purpose: string,
            operation: (value: typeof handle) => Promise<unknown>,
          ) => {
            entered();
            await wait;
            return operation(handle);
          },
        ),
      };
      const findFirst = jest
        .fn()
        .mockResolvedValueOnce({
          ...conversation,
          contactId: previousContactId,
          contact: previousContactId
            ? { ownerMemberId: 'member-a', manualSalesStatus: null }
            : null,
        })
        .mockResolvedValue({
          contact: { manualSalesStatus: 'DO_NOT_CONTACT' },
        });
      const authorization = {
        refresh: jest.fn().mockResolvedValue({}),
        require: jest.fn().mockResolvedValue({
          workspaceId: 'workspace-a',
          memberId: 'member-a',
        }),
        requireOwnOrAny: jest.fn(),
        scope: jest.fn().mockResolvedValue({}),
      };
      const prisma = {
        telegramCrmConversation: { findFirst },
        telegramCrmMessage: { findUnique: jest.fn().mockResolvedValue(null) },
      };
      const service = new TelegramCrmManualSendService(
        prisma as never,
        authorization as never,
        runtime as never,
        { emit: jest.fn() } as never,
      );
      const pending = service.send('user-a', conversation.id, {
        text: 'Offer',
        clientIdempotencyKey: 'queued-key',
      });
      await started;
      release();
      await expect(pending).rejects.toBeInstanceOf(ForbiddenException);
      expect(handle.sendText).not.toHaveBeenCalled();
      expect(findFirst).toHaveBeenCalledTimes(2);
      expect(findFirst).toHaveBeenLastCalledWith({
        where: { id: conversation.id, workspaceId: 'workspace-a' },
        select: { contact: { select: { manualSalesStatus: true } } },
      });
    },
  );
  it('applies the current own-only scope to the fresh conversation query before send', async () => {
    const handle = { sendText: jest.fn() };
    const runtime = {
      withAccountHandle: jest.fn(
        (
          _workspace: string,
          _account: string,
          _purpose: string,
          operation: (value: typeof handle) => Promise<unknown>,
        ) => operation(handle),
      ),
    };
    const findFirst = jest
      .fn()
      .mockResolvedValueOnce(conversation)
      .mockResolvedValue(null);
    const authorization = {
      refresh: jest.fn().mockResolvedValue({}),
      require: jest.fn().mockResolvedValue({
        workspaceId: 'workspace-a',
        memberId: 'member-a',
      }),
      requireOwnOrAny: jest.fn(),
      scope: jest.fn().mockResolvedValue({ assignedMemberId: 'member-a' }),
    };
    const service = new TelegramCrmManualSendService(
      {
        telegramCrmConversation: { findFirst },
        telegramCrmMessage: { findUnique: jest.fn().mockResolvedValue(null) },
      } as never,
      authorization as never,
      runtime as never,
      { emit: jest.fn() } as never,
    );
    await expect(
      service.send('user-a', conversation.id, {
        text: 'Offer',
        clientIdempotencyKey: 'queued-key',
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(findFirst).toHaveBeenLastCalledWith({
      where: {
        id: conversation.id,
        workspaceId: 'workspace-a',
        contact: { ownerMemberId: 'member-a' },
      },
      select: { contact: { select: { manualSalesStatus: true } } },
    });
    expect(handle.sendText).not.toHaveBeenCalled();
  });
  it('keeps a send deleted when its deletion reaches the account before HTTP persistence', async () => {
    const handle = {
      sendText: jest.fn().mockResolvedValue({
        telegramMessageId: 501,
        telegramUserId: '42',
        text: 'Hello',
        sentAt,
        contentMetadata: null,
      }),
    };
    const runtime = {
      withAccountHandle: jest.fn(
        async (
          _workspace: string,
          _account: string,
          _purpose: string,
          operation: (h: typeof handle) => Promise<unknown>,
        ) => operation(handle),
      ),
    };
    const tx = {
      $queryRaw: jest.fn().mockResolvedValue([]),
      $executeRaw: jest.fn(),
      telegramCrmDeletedMessage: {
        findUnique: jest.fn().mockResolvedValue({ telegramMessageId: 501 }),
      },
      telegramCrmMessage: {
        findUnique: jest.fn().mockResolvedValue(null),
        create: jest
          .fn()
          .mockImplementation(({ data }: { data: Record<string, unknown> }) =>
            Promise.resolve({
              ...messageRow,
              ...data,
              sentByMember: null,
            }),
          ),
      },
      telegramCrmConversation: { update: jest.fn() },
      telegramAdvertiser: { updateMany: jest.fn() },
    };
    const prisma = {
      telegramCrmConversation: {
        findFirst: jest.fn().mockResolvedValue(conversation),
      },
      telegramCrmMessage: { findUnique: jest.fn().mockResolvedValue(null) },
      $transaction: jest.fn(async (fn: (t: typeof tx) => Promise<unknown>) =>
        fn(tx),
      ),
    };
    const auth = {
      refresh: jest.fn().mockResolvedValue({}),
      require: jest.fn().mockResolvedValue({
        workspaceId: 'workspace-1',
        memberId: 'member-1',
      }),
      requireOwnOrAny: jest.fn(),
      scope: jest.fn().mockResolvedValue({}),
    };
    const service = new TelegramCrmManualSendService(
      prisma as never,
      auth as never,
      runtime as never,
      { emit: jest.fn() } as never,
    );
    const result = await service.send('user', 'conversation-1', {
      text: 'Hello',
      clientIdempotencyKey: 'stable',
    });
    expect(result.message.deletedAt).toBeTruthy();
    expect(result.message.text).toBeNull();
    expect(tx.telegramCrmMessage.create).toHaveBeenCalledWith(
      containing({
        data: containing({
          deletedAt: expect.any(Date) as unknown,
          text: null,
          contentMetadata: containing({
            manualRequestHash: expect.any(String) as unknown,
          }),
        }),
      }),
    );
    expect(tx.$executeRaw).not.toHaveBeenCalled();
    expect(tx.telegramCrmConversation.update).not.toHaveBeenCalled();
  });
});

describe('manual send permission revocation during session wait', () => {
  it('refreshes send permission and rejects a revoked actor before send or durable intent', async () => {
    const access = { workspaceId: 'workspace-1', memberId: 'member-1' };
    const auth = {
      refresh: jest.fn(),
      require: jest
        .fn()
        .mockResolvedValueOnce(access)
        .mockRejectedValueOnce(new ForbiddenException('revoked')),
      requireOwnOrAny: jest.fn(),
      scope: jest.fn(),
    };
    const handle = { sendText: jest.fn() };
    const runtime = {
      withAccountHandle: jest.fn(
        (
          _workspace: string,
          _account: string,
          _purpose: string,
          operation: (value: typeof handle) => Promise<unknown>,
        ) => operation(handle),
      ),
    };
    const prisma = {
      telegramCrmConversation: {
        findFirst: jest.fn().mockResolvedValue(conversation),
      },
      telegramCrmMessage: { findUnique: jest.fn().mockResolvedValue(null) },
    };
    const intents = { claim: jest.fn() };
    const service = new TelegramCrmManualSendService(
      prisma as never,
      auth as never,
      runtime as never,
      { emit: jest.fn() } as never,
      undefined,
      undefined,
      intents as never,
    );
    await expect(
      service.send('user', 'conversation-1', {
        text: 'Hello',
        clientIdempotencyKey: 'new-key',
      }),
    ).rejects.toThrow('revoked');
    expect(auth.refresh).toHaveBeenCalledWith('user');
    expect(handle.sendText).not.toHaveBeenCalled();
    expect(intents.claim).not.toHaveBeenCalled();
  });
});
