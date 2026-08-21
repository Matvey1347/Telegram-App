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

  it('recognizes start payloads and preserves the first startedAt timestamp', async () => {
    const firstStart = new Date('2026-01-01T00:00:00Z');
    const prisma = {
      telegramBotUser: {
        upsert: jest.fn().mockResolvedValue({ id: 'u', startedAt: firstStart }),
        updateMany: jest.fn(),
      },
    } as any;
    const service = new TelegramBotUsersService(prisma);
    await service.upsertFromUpdate({
      workspaceId: 'w',
      botIntegrationId: 'b',
      runtimeInstanceId: 'runtime-1',
      update: {
        message: { text: '/start campaign', chat: { id: 7 }, from: { id: 7 } },
      },
    });
    expect(prisma.telegramBotUser.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        update: expect.not.objectContaining({ startedAt: expect.anything() }),
      }),
    );
    expect(prisma.telegramBotUser.updateMany).not.toHaveBeenCalled();
  });
});
