/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-return */
import { TelegramBotApplicationType } from '@prisma/client';
import { TelegramBotRuntimeUserPresentationService } from './telegram-bot-runtime-user-presentation.service';

describe('TelegramBotRuntimeUserPresentationService', () => {
  const prisma = {
    telegramBotUser: { findMany: jest.fn() },
  } as any;
  const botApi = { setChatMenuButton: jest.fn() } as any;
  const finance = {
    resolveLocale: jest.fn((preferred) => preferred || 'en'),
    menuButton: jest.fn((botId, locale) => ({
      type: 'web_app',
      text: `Open ${locale}`,
      webAppUrl: `https://nexeloq.com/finance/${botId}`,
    })),
  };
  const presentation = {
    application: jest.fn().mockReturnValue(finance),
  } as any;
  let service: TelegramBotRuntimeUserPresentationService;

  beforeEach(() => {
    jest.clearAllMocks();
    presentation.application.mockReturnValue(finance);
    botApi.setChatMenuButton.mockResolvedValue(true);
    service = new TelegramBotRuntimeUserPresentationService(
      prisma,
      botApi,
      presentation,
    );
  });

  it('replaces chat-specific menu buttons with the current production URL', async () => {
    prisma.telegramBotUser.findMany.mockResolvedValue([
      { telegramChatId: '41', languageCode: 'uk' },
      { telegramChatId: '42', languageCode: 'ru' },
    ]);

    await expect(
      service.reconcile({
        runtimeId: 'runtime-1',
        botIntegrationId: 'finance-1',
        applicationType: TelegramBotApplicationType.FINANCE,
        token: 'token',
      }),
    ).resolves.toEqual({ attempted: 2, failed: 0 });

    expect(prisma.telegramBotUser.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ runtimeInstanceId: 'runtime-1' }),
        distinct: ['telegramChatId'],
      }),
    );
    expect(botApi.setChatMenuButton).toHaveBeenCalledWith(
      'token',
      expect.objectContaining({
        webAppUrl: 'https://nexeloq.com/finance/finance-1',
      }),
      '41',
    );
  });

  it('continues updating other users when one stale override cannot be replaced', async () => {
    prisma.telegramBotUser.findMany.mockResolvedValue([
      { telegramChatId: '41', languageCode: 'en' },
      { telegramChatId: '42', languageCode: 'en' },
    ]);
    botApi.setChatMenuButton
      .mockRejectedValueOnce(new Error('chat unavailable'))
      .mockResolvedValueOnce(true);

    await expect(
      service.reconcile({
        runtimeId: 'runtime-1',
        botIntegrationId: 'finance-1',
        applicationType: TelegramBotApplicationType.FINANCE,
        token: 'token',
      }),
    ).resolves.toEqual({ attempted: 2, failed: 1 });
    expect(botApi.setChatMenuButton).toHaveBeenCalledTimes(2);
  });

  it('does no per-user work for applications that never create chat overrides', async () => {
    await expect(
      service.reconcile({
        runtimeId: 'runtime-1',
        botIntegrationId: 'greeter-1',
        applicationType: TelegramBotApplicationType.GREETER,
        token: 'token',
      }),
    ).resolves.toEqual({ attempted: 0, failed: 0 });
    expect(prisma.telegramBotUser.findMany).not.toHaveBeenCalled();
    expect(botApi.setChatMenuButton).not.toHaveBeenCalled();
  });
});
