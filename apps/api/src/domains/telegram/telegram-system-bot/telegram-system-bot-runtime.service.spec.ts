/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-argument */
import { TelegramSystemBotRuntimeService } from './telegram-system-bot-runtime.service';

describe('TelegramSystemBotRuntimeService', () => {
  const prisma = {
    telegramSystemBotUpdateLog: {
      create: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
    },
  } as any;
  const config = {
    environment: 'LOCAL',
    configured: true,
    validatesWebhookSecret: jest.fn(),
    token: 'local-token',
    webhookUrl: 'https://local.example/api/telegram/system-bot/webhook',
    expectedWebhookSecret: jest.fn(),
  } as any;
  const api = {
    setWebhook: jest.fn(),
    setMyCommands: jest.fn(),
    setChatMenuButton: jest.fn(),
    deleteWebhook: jest.fn(),
    getWebhookInfo: jest.fn(),
    getUpdates: jest.fn(),
  } as any;
  const handler = { handle: jest.fn() } as any;
  let service: TelegramSystemBotRuntimeService;

  beforeEach(() => {
    jest.clearAllMocks();
    config.environment = 'LOCAL';
    config.configured = true;
    config.token = 'local-token';
    config.webhookUrl = 'https://local.example/api/telegram/system-bot/webhook';
    config.expectedWebhookSecret.mockReturnValue('local-secret');
    api.getWebhookInfo.mockResolvedValue(null);
    service = new TelegramSystemBotRuntimeService(prisma, config, api, handler);
  });

  it('configures the selected LOCAL webhook without polling or deleting a webhook', async () => {
    await service.onModuleInit();

    expect(api.setWebhook).toHaveBeenCalledWith(
      'local-token',
      'https://local.example/api/telegram/system-bot/webhook',
      'local-secret',
    );
    expect(api.setMyCommands).toHaveBeenCalledWith(
      'local-token',
      expect.any(Array),
    );
    expect(api.deleteWebhook).not.toHaveBeenCalled();
    expect(api.getUpdates).not.toHaveBeenCalled();
  });

  it('configures only the selected PRODUCTION credential', async () => {
    config.environment = 'PRODUCTION';
    config.token = 'production-token';
    config.webhookUrl =
      'https://production.example/api/telegram/system-bot/webhook';
    config.expectedWebhookSecret.mockReturnValue('production-secret');

    await service.onModuleInit();

    expect(api.setWebhook).toHaveBeenCalledWith(
      'production-token',
      'https://production.example/api/telegram/system-bot/webhook',
      'production-secret',
    );
    expect(api.setWebhook).not.toHaveBeenCalledWith(
      'local-token',
      expect.anything(),
      expect.anything(),
    );
  });

  it('does not reset an already-correct selected webhook', async () => {
    api.getWebhookInfo.mockResolvedValue({
      url: 'https://local.example/api/telegram/system-bot/webhook',
    });

    await service.onModuleInit();

    expect(api.setWebhook).not.toHaveBeenCalled();
    expect(api.getWebhookInfo).toHaveBeenCalledWith('local-token');
  });

  it('has no Telegram side effects when an environment is not selected', async () => {
    config.environment = null;
    config.configured = false;
    config.token = null;

    await service.onModuleInit();

    expect(api.setWebhook).not.toHaveBeenCalled();
    expect(api.setMyCommands).not.toHaveBeenCalled();
    expect(api.setChatMenuButton).not.toHaveBeenCalled();
    expect(api.deleteWebhook).not.toHaveBeenCalled();
    expect(api.getUpdates).not.toHaveBeenCalled();
  });

  it('rejects an invalid webhook secret before processing an update', async () => {
    config.validatesWebhookSecret.mockReturnValue(false);
    await expect(
      service.handleWebhook('wrong', { update_id: 1 }),
    ).resolves.toEqual({ status: 'UNAUTHORIZED' });
    expect(prisma.telegramSystemBotUpdateLog.create).not.toHaveBeenCalled();
  });

  it('records duplicate updates once and does not dispatch them twice', async () => {
    config.validatesWebhookSecret.mockReturnValue(true);
    prisma.telegramSystemBotUpdateLog.create.mockResolvedValueOnce({
      id: 'log',
    });
    await service.handleWebhook('secret', { update_id: 1, message: {} });
    const unique = Object.assign(new Error('duplicate'), {
      code: 'P2002',
      constructor: { name: 'PrismaClientKnownRequestError' },
    });
    prisma.telegramSystemBotUpdateLog.create.mockRejectedValueOnce(unique);
    prisma.telegramSystemBotUpdateLog.findUnique.mockResolvedValueOnce({
      id: 'log',
      status: 'PROCESSED',
    });
    await expect(
      service.handleWebhook('secret', { update_id: 1, message: {} }),
    ).resolves.toEqual({ status: 'DUPLICATE' });
    expect(handler.handle).toHaveBeenCalledTimes(1);
  });

  it('treats a previously failed update id as terminal', async () => {
    config.validatesWebhookSecret.mockReturnValue(true);
    const unique = Object.assign(new Error('duplicate'), { code: 'P2002' });
    prisma.telegramSystemBotUpdateLog.create.mockRejectedValueOnce(unique);
    prisma.telegramSystemBotUpdateLog.findUnique.mockResolvedValueOnce({
      id: 'log',
      status: 'FAILED',
    });

    await expect(
      service.handleWebhook('secret', { update_id: 1, message: {} }),
    ).resolves.toEqual({ status: 'DUPLICATE' });
    expect(handler.handle).not.toHaveBeenCalled();
  });

  it('scopes update idempotency by the selected System Bot environment', async () => {
    config.validatesWebhookSecret.mockReturnValue(true);
    prisma.telegramSystemBotUpdateLog.create.mockResolvedValue({ id: 'log' });

    await service.handleWebhook('secret', { update_id: 1, message: {} });
    config.environment = 'PRODUCTION';
    config.token = 'production-token';
    await service.handleWebhook('secret', { update_id: 1, message: {} });

    expect(prisma.telegramSystemBotUpdateLog.create).toHaveBeenNthCalledWith(
      1,
      { data: { environment: 'LOCAL', updateId: '1', updateType: 'message' } },
    );
    expect(prisma.telegramSystemBotUpdateLog.create).toHaveBeenNthCalledWith(
      2,
      {
        data: {
          environment: 'PRODUCTION',
          updateId: '1',
          updateType: 'message',
        },
      },
    );
  });

  it('contains a Telegram webhook configuration failure without falling back to polling', async () => {
    api.setWebhook.mockRejectedValueOnce(new Error('Telegram unavailable'));

    await expect(service.onModuleInit()).resolves.toBeUndefined();

    expect(api.getUpdates).not.toHaveBeenCalled();
    expect(api.deleteWebhook).not.toHaveBeenCalled();
  });
});
