/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-argument */
import {
  TelegramBotApplicationType,
  TelegramBotRuntimeEnvironment,
  TelegramBotRuntimeStatus,
  TelegramBotWebhookStatus,
} from '@prisma/client';
import { TelegramBotLocalDevelopmentService } from './telegram-bot-local-development.service';

describe('TelegramBotLocalDevelopmentService', () => {
  const runtime = {
    id: 'local-1',
    botIntegrationId: 'finance-1',
    environment: TelegramBotRuntimeEnvironment.LOCAL,
    runtimeStatus: TelegramBotRuntimeStatus.ACTIVE,
    webhookUrl: 'https://old.trycloudflare.com/api/webhook',
    botTokenEncrypted: 'encrypted',
    botTokenIv: 'iv',
    botTokenAuthTag: 'tag',
    miniAppExpectedUrl: 'https://old.trycloudflare.com/finance/finance-1',
    botIntegration: {
      applicationType: TelegramBotApplicationType.FINANCE,
    },
    users: [
      {
        id: 'user-1',
        telegramChatId: '42',
        languageCode: 'en',
        localLifecycleMessageId: 77,
        financeProfiles: [{ locale: 'ru' }],
      },
    ],
  };
  const prisma = {
    telegramBotRuntimeInstance: {
      findMany: jest.fn(),
      update: jest.fn().mockResolvedValue({}),
    },
    telegramBotUser: { update: jest.fn().mockResolvedValue({}) },
  } as any;
  const encryption = {
    decrypt: jest.fn().mockReturnValue('local-token'),
  } as any;
  const api = {
    sendMessage: jest.fn().mockResolvedValue({ message_id: 1 }),
    setChatMenuButton: jest.fn().mockResolvedValue(true),
    deleteWebhook: jest.fn().mockResolvedValue(true),
    deleteMessage: jest.fn().mockResolvedValue(true),
  } as any;
  const environment = { current: jest.fn() } as any;
  const presentation = {
    reconcile: jest.fn().mockResolvedValue(undefined),
    application: jest.fn(),
  } as any;
  const financePresentation = {
    localDevelopmentActive: jest.fn().mockReturnValue(true),
    miniAppUrl: jest
      .fn()
      .mockReturnValue('https://new.trycloudflare.com/finance/finance-1'),
    resolveLocale: jest
      .fn()
      .mockImplementation((preferred, fallback) =>
        preferred?.startsWith('ru') || fallback?.startsWith('ru') ? 'ru' : 'en',
      ),
    localLifecycle: jest.fn().mockImplementation((state, botIntegrationId) => ({
      text:
        state === 'started'
          ? '✅ Локальная версия Finance запущена. Ссылка Mini App обновлена.'
          : 'Локальная версия Finance не запущена.',
      ...(state === 'started'
        ? {
            replyKeyboard: [
              [
                {
                  text: 'Open',
                  webAppUrl: `https://new.trycloudflare.com/finance/${botIntegrationId}`,
                },
              ],
            ],
          }
        : {}),
    })),
    menuButton: jest.fn().mockReturnValue({
      type: 'web_app',
      text: 'Open',
      webAppUrl: 'https://new.trycloudflare.com/finance/finance-1',
    }),
  } as any;
  const registry = {
    invalidate: jest.fn(),
    refresh: jest.fn().mockResolvedValue({}),
  } as any;
  const runtimeService = {
    reconcileLocalDevelopment: jest.fn().mockResolvedValue(undefined),
  } as any;
  let service: TelegramBotLocalDevelopmentService;
  const previousUrl = process.env.FRONTEND_URL;
  const previousSecret = process.env.LOCAL_DEV_BOTS_CONTROL_SECRET;

  beforeEach(() => {
    jest.clearAllMocks();
    environment.current.mockReturnValue(TelegramBotRuntimeEnvironment.LOCAL);
    process.env.FRONTEND_URL = 'https://new.trycloudflare.com';
    process.env.LOCAL_DEV_BOTS_CONTROL_SECRET = 'control-secret';
    service = new TelegramBotLocalDevelopmentService(
      prisma,
      encryption,
      api,
      environment,
      presentation,
      registry,
      runtimeService,
    );
    presentation.application.mockReturnValue(financePresentation);
  });

  afterAll(() => {
    if (previousUrl === undefined) delete process.env.FRONTEND_URL;
    else process.env.FRONTEND_URL = previousUrl;
    if (previousSecret === undefined)
      delete process.env.LOCAL_DEV_BOTS_CONTROL_SECRET;
    else process.env.LOCAL_DEV_BOTS_CONTROL_SECRET = previousSecret;
  });

  it('pushes a fresh localized keyboard when the tunnel URL changed', async () => {
    prisma.telegramBotRuntimeInstance.findMany.mockResolvedValue([runtime]);

    await service.start('control-secret');

    expect(runtimeService.reconcileLocalDevelopment).toHaveBeenCalledTimes(1);
    expect(api.sendMessage).toHaveBeenCalledWith(
      'local-token',
      expect.objectContaining({
        chat_id: '42',
        text: expect.stringContaining('Ссылка Mini App обновлена'),
        reply_markup: expect.objectContaining({
          keyboard: expect.arrayContaining([
            expect.arrayContaining([
              expect.objectContaining({
                web_app: {
                  url: 'https://new.trycloudflare.com/finance/finance-1',
                },
              }),
            ]),
          ]),
        }),
      }),
    );
    expect(api.deleteMessage).toHaveBeenCalledWith('local-token', {
      chat_id: '42',
      message_id: 77,
    });
    expect(prisma.telegramBotUser.update).toHaveBeenCalledWith({
      where: { id: 'user-1' },
      data: { localLifecycleMessageId: 1 },
    });
    expect(api.sendMessage.mock.calls[0][1].text).toContain('✅');
    expect(prisma.telegramBotRuntimeInstance.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'local-1' },
        data: expect.objectContaining({
          miniAppExpectedUrl: 'https://new.trycloudflare.com/finance/finance-1',
        }),
      }),
    );
    expect(api.setChatMenuButton).toHaveBeenCalledWith(
      'local-token',
      expect.objectContaining({
        type: 'web_app',
        webAppUrl: 'https://new.trycloudflare.com/finance/finance-1',
      }),
      '42',
    );
    expect(financePresentation.resolveLocale).toHaveBeenCalledWith('ru', 'en');
    expect(financePresentation.localLifecycle).toHaveBeenCalledWith(
      'started',
      'finance-1',
      'ru',
    );
    expect(financePresentation.menuButton).toHaveBeenCalledWith(
      'finance-1',
      'ru',
    );
  });

  it('does not message users again when a watch restart keeps the same URL', async () => {
    prisma.telegramBotRuntimeInstance.findMany.mockResolvedValue([
      {
        ...runtime,
        miniAppExpectedUrl: 'https://new.trycloudflare.com/finance/finance-1',
      },
    ]);

    await service.start('control-secret');

    expect(api.sendMessage).not.toHaveBeenCalled();
    expect(prisma.telegramBotRuntimeInstance.update).not.toHaveBeenCalled();
  });

  it('removes LOCAL keyboards, menu links and webhooks during explicit shutdown', async () => {
    prisma.telegramBotRuntimeInstance.findMany.mockResolvedValue([runtime]);

    await expect(service.stop('control-secret')).resolves.toMatchObject({
      stopped: 1,
    });

    expect(api.sendMessage).toHaveBeenCalledWith(
      'local-token',
      expect.objectContaining({
        text: expect.stringContaining('не запущена'),
        reply_markup: { remove_keyboard: true },
      }),
    );
    expect(presentation.reconcile).toHaveBeenCalledWith(
      'local-token',
      TelegramBotApplicationType.NONE,
      'finance-1',
    );
    expect(api.deleteWebhook).toHaveBeenCalledWith('local-token');
    expect(api.setChatMenuButton).toHaveBeenCalledWith(
      'local-token',
      { type: 'commands' },
      '42',
    );
    expect(prisma.telegramBotRuntimeInstance.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          runtimeStatus: TelegramBotRuntimeStatus.DISABLED,
          webhookStatus: TelegramBotWebhookStatus.NOT_CONFIGURED,
          miniAppExpectedUrl: null,
        }),
      }),
    );
  });

  it('cannot run without the per-process secret', async () => {
    await expect(service.stop('wrong-secret')).rejects.toThrow(
      'Invalid dev control secret',
    );
    expect(prisma.telegramBotRuntimeInstance.findMany).not.toHaveBeenCalled();
  });

  it('cannot clean up PRODUCTION even with the dev secret', async () => {
    environment.current.mockReturnValue(
      TelegramBotRuntimeEnvironment.PRODUCTION,
    );

    await expect(service.stop('control-secret')).rejects.toThrow(
      'LOCAL Telegram runtime is not selected',
    );
    expect(prisma.telegramBotRuntimeInstance.findMany).not.toHaveBeenCalled();
  });
});
