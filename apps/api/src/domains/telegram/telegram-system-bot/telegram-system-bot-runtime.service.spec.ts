/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-argument */
import { TelegramSystemBotRuntimeService } from './telegram-system-bot-runtime.service';
import { SYSTEM_BOT_COMMANDS } from './telegram-system-bot-menu';

describe('TelegramSystemBotRuntimeService', () => {
  const prisma = {
    telegramSystemBotUpdateLog: {
      create: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
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
    deleteMyCommands: jest.fn(),
    setChatMenuButton: jest.fn(),
    deleteWebhook: jest.fn(),
    getWebhookInfo: jest.fn(),
    getUpdates: jest.fn(),
  } as any;
  const handler = { handle: jest.fn() } as any;
  let service: TelegramSystemBotRuntimeService;

  beforeEach(() => {
    jest.resetAllMocks();
    config.environment = 'LOCAL';
    config.configured = true;
    config.token = 'local-token';
    config.webhookUrl = 'https://local.example/api/telegram/system-bot/webhook';
    config.expectedWebhookSecret.mockReturnValue('local-secret');
    api.getWebhookInfo.mockResolvedValue(null);
    prisma.telegramSystemBotUpdateLog.updateMany.mockResolvedValue({
      count: 1,
    });
    handler.handle.mockResolvedValue(undefined);
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
      SYSTEM_BOT_COMMANDS,
    );
    expect(api.setMyCommands).toHaveBeenCalledWith(
      'local-token',
      SYSTEM_BOT_COMMANDS,
      'ru',
      { type: 'all_private_chats' },
    );
    expect(api.setChatMenuButton).toHaveBeenCalledWith('local-token', {
      type: 'commands',
    });
    expect(api.deleteMyCommands).not.toHaveBeenCalled();
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
    expect(api.setMyCommands).toHaveBeenCalledWith(
      'production-token',
      SYSTEM_BOT_COMMANDS,
    );
    expect(api.setMyCommands).toHaveBeenCalledWith(
      'production-token',
      SYSTEM_BOT_COMMANDS,
      undefined,
      { type: 'all_private_chats' },
    );
    expect(api.setMyCommands).toHaveBeenCalledWith(
      'production-token',
      SYSTEM_BOT_COMMANDS,
      'ru',
      { type: 'all_private_chats' },
    );
    expect(api.setMyCommands).not.toHaveBeenCalledWith(
      'local-token',
      expect.anything(),
    );
    expect(api.setChatMenuButton).toHaveBeenCalledWith('production-token', {
      type: 'commands',
    });
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
    expect(api.deleteMyCommands).not.toHaveBeenCalled();
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

  it('keeps a fresh processing update with its original worker', async () => {
    config.validatesWebhookSecret.mockReturnValue(true);
    const unique = Object.assign(new Error('duplicate'), { code: 'P2002' });
    prisma.telegramSystemBotUpdateLog.create.mockRejectedValueOnce(unique);
    prisma.telegramSystemBotUpdateLog.findUnique.mockResolvedValueOnce({
      id: 'log',
      status: 'PROCESSING',
      updatedAt: new Date('2026-08-27T11:59:00.000Z'),
    });
    const now = jest
      .spyOn(Date, 'now')
      .mockReturnValue(new Date('2026-08-27T12:00:00.000Z').getTime());

    await expect(
      service.handleWebhook('secret', { update_id: 1, message: {} }),
    ).resolves.toEqual({ status: 'DUPLICATE' });

    expect(prisma.telegramSystemBotUpdateLog.updateMany).not.toHaveBeenCalled();
    expect(handler.handle).not.toHaveBeenCalled();
    now.mockRestore();
  });

  it('atomically reclaims and processes a stale processing update', async () => {
    config.validatesWebhookSecret.mockReturnValue(true);
    const unique = Object.assign(new Error('duplicate'), { code: 'P2002' });
    prisma.telegramSystemBotUpdateLog.create.mockRejectedValueOnce(unique);
    prisma.telegramSystemBotUpdateLog.findUnique.mockResolvedValueOnce({
      id: 'log',
      status: 'PROCESSING',
      updatedAt: new Date('2026-08-27T11:54:00.000Z'),
    });
    const now = jest
      .spyOn(Date, 'now')
      .mockReturnValue(new Date('2026-08-27T12:00:00.000Z').getTime());

    await expect(
      service.handleWebhook('secret', { update_id: 1, message: {} }),
    ).resolves.toEqual({ status: 'PROCESSED' });

    expect(handler.handle).toHaveBeenCalledTimes(1);
    expect(
      prisma.telegramSystemBotUpdateLog.updateMany,
    ).toHaveBeenNthCalledWith(1, {
      where: {
        id: 'log',
        status: 'PROCESSING',
        updatedAt: new Date('2026-08-27T11:54:00.000Z'),
      },
      data: {
        processedAt: null,
        error: null,
        updatedAt: new Date('2026-08-27T12:00:00.000Z'),
      },
    });
    expect(
      prisma.telegramSystemBotUpdateLog.updateMany,
    ).toHaveBeenNthCalledWith(2, {
      where: {
        id: 'log',
        status: 'PROCESSING',
        updatedAt: new Date('2026-08-27T12:00:00.000Z'),
      },
      data: { status: 'PROCESSED', processedAt: expect.any(Date) },
    });
    now.mockRestore();
  });

  it.each(['PROCESSED', 'FAILED'])(
    'treats a %s update id as terminal',
    async (status) => {
      config.validatesWebhookSecret.mockReturnValue(true);
      const unique = Object.assign(new Error('duplicate'), { code: 'P2002' });
      prisma.telegramSystemBotUpdateLog.create.mockRejectedValueOnce(unique);
      prisma.telegramSystemBotUpdateLog.findUnique.mockResolvedValueOnce({
        id: 'log',
        status,
      });

      await expect(
        service.handleWebhook('secret', { update_id: 1, message: {} }),
      ).resolves.toEqual({ status: 'DUPLICATE' });
      expect(
        prisma.telegramSystemBotUpdateLog.updateMany,
      ).not.toHaveBeenCalled();
      expect(handler.handle).not.toHaveBeenCalled();
    },
  );

  it('allows exactly one concurrent worker to reclaim a stale update', async () => {
    config.validatesWebhookSecret.mockReturnValue(true);
    const unique = Object.assign(new Error('duplicate'), { code: 'P2002' });
    prisma.telegramSystemBotUpdateLog.create.mockRejectedValueOnce(unique);
    prisma.telegramSystemBotUpdateLog.findUnique.mockResolvedValue({
      id: 'log',
      status: 'PROCESSING',
      updatedAt: new Date('2026-08-27T11:54:00.000Z'),
    });
    const now = jest
      .spyOn(Date, 'now')
      .mockReturnValue(new Date('2026-08-27T12:00:00.000Z').getTime());

    const results = await Promise.all([
      service.handleWebhook('secret', { update_id: 1, message: {} }),
      service.handleWebhook('secret', { update_id: 1, message: {} }),
    ]);

    expect(results).toEqual(
      expect.arrayContaining([
        { status: 'PROCESSED' },
        { status: 'DUPLICATE' },
      ]),
    );
    expect(prisma.telegramSystemBotUpdateLog.updateMany).toHaveBeenCalledTimes(
      2,
    );
    expect(prisma.telegramSystemBotUpdateLog.create).toHaveBeenCalledTimes(1);
    expect(prisma.telegramSystemBotUpdateLog.findUnique).toHaveBeenCalledTimes(
      1,
    );
    expect(handler.handle).toHaveBeenCalledTimes(1);
    expect(prisma.telegramSystemBotUpdateLog.update).not.toHaveBeenCalled();
    now.mockRestore();
  });

  it('keeps an unfinished original handler after the reclaim age across service instances', async () => {
    config.validatesWebhookSecret.mockReturnValue(true);
    prisma.telegramSystemBotUpdateLog.create.mockResolvedValueOnce({
      id: 'log',
    });
    const now = jest
      .spyOn(Date, 'now')
      .mockReturnValue(new Date('2026-08-27T12:00:00.000Z').getTime());
    let releaseHandler!: () => void;
    let markHandlerStarted!: () => void;
    const handlerStarted = new Promise<void>((resolve) => {
      markHandlerStarted = resolve;
    });
    const unfinishedHandler = new Promise<void>((resolve) => {
      releaseHandler = resolve;
    });
    handler.handle.mockImplementationOnce(() => {
      markHandlerStarted();
      return unfinishedHandler;
    });

    const original = service.handleWebhook('secret', {
      update_id: 91,
      message: {},
    });
    await handlerStarted;

    let originalResult: Awaited<typeof original>;
    try {
      now.mockReturnValue(new Date('2026-08-27T12:06:00.000Z').getTime());
      const secondService = new TelegramSystemBotRuntimeService(
        prisma,
        config,
        api,
        handler,
      );

      await expect(
        secondService.handleWebhook('secret', {
          update_id: 91,
          message: {},
        }),
      ).resolves.toEqual({ status: 'DUPLICATE' });

      expect(prisma.telegramSystemBotUpdateLog.create).toHaveBeenCalledTimes(1);
      expect(
        prisma.telegramSystemBotUpdateLog.findUnique,
      ).not.toHaveBeenCalled();
      expect(
        prisma.telegramSystemBotUpdateLog.updateMany,
      ).not.toHaveBeenCalled();
      expect(handler.handle).toHaveBeenCalledTimes(1);
    } finally {
      releaseHandler();
      originalResult = await original;
      now.mockRestore();
    }
    expect(originalResult).toEqual({ status: 'PROCESSED' });
  });

  it('does not let a losing attempt overwrite a newer owner when it finalizes', async () => {
    config.validatesWebhookSecret.mockReturnValue(true);
    prisma.telegramSystemBotUpdateLog.create.mockResolvedValueOnce({
      id: 'log',
    });
    prisma.telegramSystemBotUpdateLog.updateMany.mockResolvedValueOnce({
      count: 0,
    });
    const attemptStartedAt = new Date('2026-08-27T12:00:00.000Z');
    const now = jest
      .spyOn(Date, 'now')
      .mockReturnValue(attemptStartedAt.getTime());

    await expect(
      service.handleWebhook('secret', { update_id: 92, message: {} }),
    ).resolves.toEqual({ status: 'DUPLICATE' });

    expect(prisma.telegramSystemBotUpdateLog.updateMany).toHaveBeenCalledWith({
      where: {
        id: 'log',
        status: 'PROCESSING',
        updatedAt: attemptStartedAt,
      },
      data: { status: 'PROCESSED', processedAt: expect.any(Date) },
    });
    expect(prisma.telegramSystemBotUpdateLog.update).not.toHaveBeenCalled();
    now.mockRestore();
  });

  it('does not let a losing failed attempt overwrite a newer owner', async () => {
    config.validatesWebhookSecret.mockReturnValue(true);
    prisma.telegramSystemBotUpdateLog.create.mockResolvedValueOnce({
      id: 'log',
    });
    prisma.telegramSystemBotUpdateLog.updateMany.mockResolvedValueOnce({
      count: 0,
    });
    handler.handle.mockRejectedValueOnce(new Error('handler exploded'));
    const attemptStartedAt = new Date('2026-08-27T12:00:00.000Z');
    const now = jest
      .spyOn(Date, 'now')
      .mockReturnValue(attemptStartedAt.getTime());

    await expect(
      service.handleWebhook('secret', { update_id: 93, message: {} }),
    ).rejects.toThrow('handler exploded');

    expect(prisma.telegramSystemBotUpdateLog.updateMany).toHaveBeenCalledWith({
      where: {
        id: 'log',
        status: 'PROCESSING',
        updatedAt: attemptStartedAt,
      },
      data: {
        status: 'FAILED',
        error: 'handler exploded',
      },
    });
    expect(prisma.telegramSystemBotUpdateLog.update).not.toHaveBeenCalled();
    now.mockRestore();
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
      {
        data: {
          environment: 'LOCAL',
          updateId: '1',
          updateType: 'message',
          updatedAt: expect.any(Date),
        },
      },
    );
    expect(prisma.telegramSystemBotUpdateLog.create).toHaveBeenNthCalledWith(
      2,
      {
        data: {
          environment: 'PRODUCTION',
          updateId: '1',
          updateType: 'message',
          updatedAt: expect.any(Date),
        },
      },
    );
  });

  it('records and dispatches channel membership updates', async () => {
    config.validatesWebhookSecret.mockReturnValue(true);
    prisma.telegramSystemBotUpdateLog.create.mockResolvedValue({ id: 'log' });
    const update = {
      update_id: 2,
      my_chat_member: {
        chat: { id: -1001, type: 'channel' },
        old_chat_member: { status: 'member', user: { id: 7 } },
        new_chat_member: { status: 'administrator', user: { id: 7 } },
      },
    };

    await service.handleWebhook('secret', update);

    expect(prisma.telegramSystemBotUpdateLog.create).toHaveBeenCalledWith({
      data: {
        environment: 'LOCAL',
        updateId: '2',
        updateType: 'my_chat_member',
        updatedAt: expect.any(Date),
      },
    });
    expect(handler.handle).toHaveBeenCalledWith(update);
  });

  it('contains a Telegram webhook configuration failure without falling back to polling', async () => {
    api.setWebhook.mockRejectedValueOnce(new Error('Telegram unavailable'));

    await expect(service.onModuleInit()).resolves.toBeUndefined();

    expect(api.getUpdates).not.toHaveBeenCalled();
    expect(api.deleteWebhook).not.toHaveBeenCalled();
  });
});
