import { TelegramBotUsersService } from './telegram-bot-users.service';

describe('TelegramBotUsersService', () => {
  it('does not treat a joined channel id as the user private chat id', () => {
    const service = new TelegramBotUsersService({} as any);
    expect(
      service.chatIdFromUpdate({
        chat_join_request: {
          chat: { id: -100 },
          from: { id: 7 },
          user_chat_id: 900,
        },
      }),
    ).toBeNull();
  });

  it('does not write an unchanged established Telegram identity', async () => {
    const existing = {
      id: 'u', telegramChatId: '7', username: 'ada', firstName: 'Ada',
      lastName: null, languageCode: 'en', startedAt: new Date(),
      lastInteractionAt: new Date(),
    };
    const prisma = {
      telegramBotUser: {
        findUnique: jest.fn().mockResolvedValue(existing),
        create: jest.fn(), update: jest.fn(),
      },
    } as any;
    const service = new TelegramBotUsersService(prisma);
    await expect(service.upsertFromUpdate({
      workspaceId: 'w',
      botIntegrationId: 'b',
      runtimeInstanceId: 'runtime-1',
      update: {
        message: { text: 'hello', chat: { id: 7 }, from: { id: 7, username: 'ada', first_name: 'Ada', language_code: 'en' } },
      },
    })).resolves.toBe(existing);
    expect(prisma.telegramBotUser.create).not.toHaveBeenCalled();
    expect(prisma.telegramBotUser.update).not.toHaveBeenCalled();
  });

  it('creates a first-time user in the exact runtime scope', async () => {
    const created = { id: 'u-new' };
    const prisma = { telegramBotUser: {
      findUnique: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockResolvedValue(created), update: jest.fn(),
    } } as any;
    await expect(new TelegramBotUsersService(prisma).upsertActor({
      workspaceId: 'w', botIntegrationId: 'b', runtimeInstanceId: 'runtime-local',
      actor: { id: 7, first_name: 'Ada' }, telegramChatId: '7',
    })).resolves.toBe(created);
    expect(prisma.telegramBotUser.create).toHaveBeenCalledWith({ data: expect.objectContaining({
      workspaceId: 'w', botIntegrationId: 'b', runtimeInstanceId: 'runtime-local', telegramUserId: '7', firstName: 'Ada',
    }) });
    expect(prisma.telegramBotUser.update).not.toHaveBeenCalled();
  });

  it('updates changed identity and first /start state in one write', async () => {
    const prisma = { telegramBotUser: {
      findUnique: jest.fn().mockResolvedValue({
        id: 'u', telegramChatId: null, username: 'old', firstName: 'Ada', lastName: null,
        languageCode: 'en', startedAt: null, lastInteractionAt: new Date(),
      }),
      create: jest.fn(), update: jest.fn(({ data }) => Promise.resolve({ id: 'u', ...data })),
    } } as any;
    const service = new TelegramBotUsersService(prisma);
    await service.upsertFromUpdate({
      workspaceId: 'w', botIntegrationId: 'b', runtimeInstanceId: 'runtime-1',
      update: { message: { text: '/start campaign', chat: { id: 7 }, from: { id: 7, username: 'ada', first_name: 'Ada', language_code: 'en' } } },
    });
    expect(prisma.telegramBotUser.update).toHaveBeenCalledWith({
      where: { id: 'u' },
      data: expect.objectContaining({ username: 'ada', telegramChatId: '7', startedAt: expect.any(Date) }),
    });
    expect(prisma.telegramBotUser.update).toHaveBeenCalledTimes(1);
  });

  it('throttles lastInteractionAt instead of writing it on every update', async () => {
    const prisma = { telegramBotUser: {
      findUnique: jest.fn().mockResolvedValue({
        id: 'u', telegramChatId: '7', username: null, firstName: null, lastName: null,
        languageCode: null, startedAt: null, lastInteractionAt: new Date(Date.now() - 2 * 60 * 60 * 1000),
      }),
      create: jest.fn(), update: jest.fn().mockResolvedValue({ id: 'u' }),
    } } as any;
    await new TelegramBotUsersService(prisma).upsertActor({
      workspaceId: 'w', botIntegrationId: 'b', runtimeInstanceId: 'runtime-1',
      actor: { id: 7 }, telegramChatId: '7',
    });
    expect(prisma.telegramBotUser.update).toHaveBeenCalledWith({
      where: { id: 'u' }, data: { lastInteractionAt: expect.any(Date) },
    });
  });
});
