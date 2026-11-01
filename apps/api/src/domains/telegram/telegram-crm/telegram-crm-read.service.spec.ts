import { TelegramCrmReadService } from './telegram-crm-read.service';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { MarkCrmConversationReadDto } from './telegram-crm-inbox.dto';
import { ValidationPipe } from '@nestjs/common';

function setup() {
  const conversation = {
    id: 'conversation-a',
    mtprotoAccountId: 'account-a',
    telegramAccessHash: 'hash',
    contactId: null,
    unreadCount: 3,
    lastReadInboxTelegramMessageId: 80,
    peer: { id: 'peer-a', telegramUserId: '12345', username: 'recipient' },
    contact: null,
    messages: [{ telegramMessageIdNumeric: 99 }],
  };
  const handle = { markRead: jest.fn() };
  const runtime = {
    withAccountHandle: jest.fn(
      async (
        _workspace: string,
        _account: string,
        _purpose: string,
        operation: (value: typeof handle) => Promise<unknown>,
      ) => operation(handle),
    ),
  };
  const tx = {
    telegramCrmMessage: {
      updateMany: jest.fn().mockResolvedValue({ count: 2 }),
      count: jest.fn().mockResolvedValue(0),
    },
    telegramCrmConversation: { update: jest.fn() },
    $queryRaw: jest
      .fn()
      .mockResolvedValue([
        { unreadCount: 3, lastReadInboxTelegramMessageId: 80 },
      ]),
  };
  const prisma = {
    telegramCrmConversation: {
      findFirst: jest.fn().mockResolvedValue(conversation),
      updateMany: jest.fn(),
    },
    $transaction: jest.fn(
      async (operation: (value: typeof tx) => Promise<unknown>) =>
        operation(tx),
    ),
  };
  const authorization = {
    require: jest.fn().mockResolvedValue({ workspaceId: 'workspace-a' }),
    requireOwnOrAny: jest.fn(),
  };
  const events = { emit: jest.fn() };
  const notifications = {
    reconcileConversationGroups: jest.fn().mockResolvedValue(['member-a']),
  };
  const publisher = { invalidate: jest.fn() };
  const cache = { clearWorkspacePath: jest.fn() };
  const service = new TelegramCrmReadService(
    prisma as never,
    authorization as never,
    runtime as never,
    events as never,
    notifications as never,
    publisher as never,
    cache as never,
  );
  return {
    conversation,
    handle,
    runtime,
    tx,
    prisma,
    authorization,
    events,
    notifications,
    publisher,
    service,
  };
}

describe('explicit CRM read watermark', () => {
  it('caps the Telegram read at a rendered message even if a newer message already exists', async () => {
    const { service, prisma, conversation, handle, tx } = setup();
    // A later inbound message was committed before the request reached the API.
    prisma.telegramCrmConversation.findFirst.mockImplementation(
      (query: {
        select: {
          messages: { where: { telegramMessageIdNumeric: { lte?: number } } };
        };
      }) => {
        const limit = query.select.messages.where.telegramMessageIdNumeric.lte;
        const ids = [101, 99, 90].filter(
          (id) => limit === undefined || id <= limit,
        );
        return Promise.resolve({
          ...conversation,
          messages: ids
            .slice(0, 1)
            .map((id) => ({ telegramMessageIdNumeric: id })),
        });
      },
    );
    tx.telegramCrmMessage.count.mockResolvedValue(1);
    const result = await service.markRead('user-a', 'conversation-a', 99);
    expect(handle.markRead).toHaveBeenCalledWith(
      expect.objectContaining({ maxTelegramMessageId: 99 }),
    );
    expect(tx.telegramCrmMessage.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          telegramMessageIdNumeric: { lte: 99 },
        }) as unknown,
      }),
    );
    expect(tx.telegramCrmMessage.count).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          OR: [
            { telegramMessageIdNumeric: { gt: 99 } },
            { telegramMessageIdNumeric: null },
          ],
        }) as unknown,
      }),
    );
    expect(result.unreadCount).toBe(1);
    expect(result.lastReadInboxTelegramMessageId).toBe(99);
  });
  it('fails safely if no message in this conversation exists at or below the viewed watermark', async () => {
    const { service, prisma, conversation, runtime, tx } = setup();
    prisma.telegramCrmConversation.findFirst.mockResolvedValue({
      ...conversation,
      messages: [],
    });
    await expect(
      service.markRead('user-a', 'conversation-a', 5),
    ).rejects.toThrow('Viewed Telegram message not found');
    expect(runtime.withAccountHandle).not.toHaveBeenCalled();
    expect(tx.telegramCrmMessage.updateMany).not.toHaveBeenCalled();
  });
  it.each([0, -1, 1.5, 2_147_483_648, null, '99'])(
    'rejects invalid explicit read watermark %s without invoking Telegram',
    async (watermark) => {
      const { service, runtime } = setup();
      const dto = plainToInstance(MarkCrmConversationReadDto, {
        maxTelegramMessageId: watermark,
      });
      expect(await validate(dto)).not.toHaveLength(0);
      await expect(
        service.markRead('user-a', 'conversation-a', watermark as number),
      ).rejects.toThrow('Invalid Telegram read watermark');
      expect(runtime.withAccountHandle).not.toHaveBeenCalled();
    },
  );
  it('accepts an omitted watermark for existing manual clients', async () => {
    expect(
      await validate(plainToInstance(MarkCrmConversationReadDto, {})),
    ).toHaveLength(0);
  });
  it('treats an absent body as manual and rejects null through the actual validation pipeline', async () => {
    const pipe = new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
    });
    const metadata = {
      type: 'body' as const,
      metatype: MarkCrmConversationReadDto,
    };
    await expect(pipe.transform(undefined, metadata)).resolves.toEqual(
      expect.objectContaining({}),
    );
    await expect(
      pipe.transform({ maxTelegramMessageId: null }, metadata),
    ).rejects.toThrow();
  });
  it('does not read a conversation outside the authorized workspace', async () => {
    const { service, prisma, runtime } = setup();
    prisma.telegramCrmConversation.findFirst.mockResolvedValue(null);
    await expect(
      service.markRead('user-a', 'foreign-conversation', 99),
    ).rejects.toThrow('CRM Conversation not found');
    expect(prisma.telegramCrmConversation.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'foreign-conversation', workspaceId: 'workspace-a' },
      }),
    );
    expect(runtime.withAccountHandle).not.toHaveBeenCalled();
  });
  it('uses the highest Telegram id including outbound, but marks only inbound rows', async () => {
    const { service, handle, tx, events, notifications, publisher } = setup();
    await expect(service.markRead('user-a', 'conversation-a')).resolves.toEqual(
      {
        conversationId: 'conversation-a',
        lastReadInboxTelegramMessageId: 99,
        readMessageCount: 2,
        unreadCount: 0,
      },
    );
    expect(handle.markRead).toHaveBeenCalledWith(
      expect.objectContaining({ maxTelegramMessageId: 99 }),
    );
    expect(tx.telegramCrmMessage.updateMany).toHaveBeenCalledWith({
      where: {
        workspaceId: 'workspace-a',
        conversationId: 'conversation-a',
        direction: 'INBOUND',
        telegramMessageIdNumeric: { lte: 99 },
        readState: { not: 'READ' },
      },
      data: { readState: 'READ' },
    });
    expect(events.emit).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'readChanged', unreadCount: 0 }),
    );
    expect(notifications.reconcileConversationGroups).toHaveBeenCalledWith(
      tx,
      'workspace-a',
      [{ conversationId: 'conversation-a', contactId: null, unreadCount: 0 }],
    );
    expect(publisher.invalidate).toHaveBeenCalledWith('workspace-a', [
      'member-a',
    ]);
  });
  it('preserves a newer inbound message arriving during Telegram markRead instead of zeroing its counter/notification', async () => {
    const { service, tx, events, notifications } = setup();
    tx.$queryRaw.mockResolvedValue([
      { unreadCount: 4, lastReadInboxTelegramMessageId: 80 },
    ]);
    tx.telegramCrmMessage.count.mockResolvedValue(1);
    const result = await service.markRead('user-a', 'conversation-a');
    expect(result.unreadCount).toBe(1);
    expect(tx.telegramCrmConversation.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          unreadCount: 1,
          readState: 'UNREAD',
        }) as unknown,
      }),
    );
    expect(notifications.reconcileConversationGroups).toHaveBeenCalledWith(
      tx,
      'workspace-a',
      [{ conversationId: 'conversation-a', contactId: null, unreadCount: 1 }],
    );
    expect(events.emit).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'readChanged', unreadCount: 1 }),
    );
  });
  it('never regresses a concurrently advanced watermark or writes unchanged compact state', async () => {
    const { service, tx } = setup();
    tx.$queryRaw.mockResolvedValue([
      { unreadCount: 0, lastReadInboxTelegramMessageId: 110 },
    ]);
    expect(
      (await service.markRead('user-a', 'conversation-a'))
        .lastReadInboxTelegramMessageId,
    ).toBe(110);
    expect(tx.telegramCrmConversation.update).not.toHaveBeenCalled();
  });
  it('does not dismiss a new notification when the originally empty conversation receives a message during the request', async () => {
    const { service, prisma, conversation, tx, notifications, runtime } =
      setup();
    prisma.telegramCrmConversation.findFirst.mockResolvedValue({
      ...conversation,
      unreadCount: 0,
      messages: [],
    });
    tx.$queryRaw.mockResolvedValue([
      { unreadCount: 1, lastReadInboxTelegramMessageId: 80 },
    ]);
    expect(
      (await service.markRead('user-a', 'conversation-a')).unreadCount,
    ).toBe(1);
    expect(notifications.reconcileConversationGroups).not.toHaveBeenCalled();
    expect(runtime.withAccountHandle).not.toHaveBeenCalled();
  });
  it('preserves local state if Telegram rejects markRead and does not infer an automatic read', async () => {
    const { service, handle, prisma, notifications } = setup();
    handle.markRead.mockRejectedValue(new Error('Session unavailable'));
    await expect(service.markRead('user-a', 'conversation-a')).rejects.toThrow(
      'Session unavailable',
    );
    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(notifications.reconcileConversationGroups).not.toHaveBeenCalled();
  });
  it('requires own/any permission before invoking the account runtime', async () => {
    const { service, authorization, runtime } = setup();
    authorization.requireOwnOrAny.mockRejectedValue(new Error('Forbidden'));
    await expect(service.markRead('user-a', 'conversation-a')).rejects.toThrow(
      'Forbidden',
    );
    expect(runtime.withAccountHandle).not.toHaveBeenCalled();
  });
});
