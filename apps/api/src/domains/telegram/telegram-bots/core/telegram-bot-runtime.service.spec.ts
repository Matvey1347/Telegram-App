/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-return, @typescript-eslint/require-await */
import {
  TelegramBotApplicationType,
  TelegramBotRuntimeEnvironment,
  TelegramBotRuntimeStatus,
  TelegramBotWebhookStatus,
} from '@prisma/client';
import { TelegramBotRuntimeExecutionContext } from './telegram-bot-runtime-execution-context';
import { TelegramBotRuntimeService } from './telegram-bot-runtime.service';

const bot = {
  id: 'bot-1',
  workspaceId: 'workspace-1',
  label: 'Finance',
  applicationType: TelegramBotApplicationType.FINANCE,
  isActive: true,
};

const runtime = (id: string, environment: TelegramBotRuntimeEnvironment) => ({
  id,
  workspaceId: 'workspace-1',
  botIntegrationId: bot.id,
  environment,
  botTokenEncrypted: `${id}-enc`,
  botTokenIv: `${id}-iv`,
  botTokenAuthTag: `${id}-tag`,
  botTokenMasked: 'mask',
  botId: id,
  username: `${id}_bot`,
  firstName: 'Bot',
  lastErrorMessage: null,
  lastCheckedAt: null,
  runtimeStatus: TelegramBotRuntimeStatus.ACTIVE,
  webhookStatus: TelegramBotWebhookStatus.CONFIGURED,
  webhookUrl: `https://api.example/api/telegram/bots/runtime/${id}/webhook`,
  webhookSecretEncrypted: `${id}-secret-enc`,
  webhookSecretIv: `${id}-secret-iv`,
  webhookSecretAuthTag: `${id}-secret-tag`,
  webhookConfiguredAt: new Date('2026-01-01'),
  pendingWebhookUrl: null,
  pendingWebhookSecretEncrypted: null,
  pendingWebhookSecretIv: null,
  pendingWebhookSecretAuthTag: null,
  runtimeTransitionStartedAt: null,
  lastUpdateProcessedAt: null,
  lastRuntimeError: null,
  createdAt: new Date('2026-01-01'),
  updatedAt: new Date('2026-01-01'),
  botIntegration: bot,
});

describe('TelegramBotRuntimeService environment isolation', () => {
  const prisma = {
    telegramBotIntegration: { findUnique: jest.fn() },
    telegramBotRuntimeInstance: {
      findMany: jest.fn().mockResolvedValue([]),
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      upsert: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
      delete: jest.fn(),
    },
    telegramBotUpdateLog: {
      create: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    $transaction: jest.fn().mockResolvedValue([]),
  } as any;
  const encryption = {
    decrypt: jest.fn((value) =>
      String(value.encrypted).includes('secret') ? 'webhook-secret' : 'token',
    ),
    encrypt: jest.fn().mockReturnValue({
      encrypted: 'encrypted',
      iv: 'iv',
      authTag: 'tag',
    }),
  } as any;
  const api = {
    getMe: jest.fn(),
    getWebhookInfo: jest.fn(),
    getChatMenuButton: jest.fn(),
    setWebhook: jest.fn(),
    deleteWebhook: jest.fn(),
  } as any;
  const dispatcher = { dispatch: jest.fn() } as any;
  const environment = {
    current: jest.fn(),
    owns: jest.fn((value) => value === environment.current()),
  } as any;
  const registry = {
    bootstrap: jest.fn(),
    resolve: jest.fn(),
    refresh: jest.fn(),
    invalidate: jest.fn(),
  } as any;
  const presentation = { reconcile: jest.fn() } as any;
  const checks = { presentation: jest.fn() } as any;
  const identity = { ensureAvailable: jest.fn() } as any;
  const executionContext = new TelegramBotRuntimeExecutionContext();
  let service: TelegramBotRuntimeService;
  const originalBase = process.env.TELEGRAM_BOT_WEBHOOK_BASE_URL;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env.TELEGRAM_BOT_WEBHOOK_BASE_URL = 'https://api.example';
    prisma.telegramBotRuntimeInstance.findMany.mockResolvedValue([]);
    registry.bootstrap.mockResolvedValue([]);
    service = new TelegramBotRuntimeService(
      prisma,
      encryption,
      api,
      dispatcher,
      environment,
      registry,
      executionContext,
      presentation,
      identity,
      checks,
    );
  });

  afterAll(() => {
    if (originalBase === undefined)
      delete process.env.TELEGRAM_BOT_WEBHOOK_BASE_URL;
    else process.env.TELEGRAM_BOT_WEBHOOK_BASE_URL = originalBase;
  });

  it('does no workspace runtime work in an ordinary development process', async () => {
    environment.current.mockReturnValue(null);

    await service.onModuleInit();

    expect(registry.bootstrap).not.toHaveBeenCalled();
    expect(prisma.telegramBotRuntimeInstance.findMany).not.toHaveBeenCalled();
    expect(api.setWebhook).not.toHaveBeenCalled();
  });

  it('rejects an ngrok webhook base for a PRODUCTION runtime', () => {
    process.env.TELEGRAM_BOT_WEBHOOK_BASE_URL =
      'https://example.ngrok-free.app';

    expect(() =>
      service.webhookUrlFor(
        'production-1',
        TelegramBotRuntimeEnvironment.PRODUCTION,
      ),
    ).toThrow('Production Telegram webhooks cannot use localhost or ngrok URLs');
  });

  it('allows an ngrok webhook base for a LOCAL runtime', () => {
    process.env.TELEGRAM_BOT_WEBHOOK_BASE_URL =
      'https://example.ngrok-free.app';

    expect(
      service.webhookUrlFor('local-1', TelegramBotRuntimeEnvironment.LOCAL),
    ).toBe('https://example.ngrok-free.app/api/telegram/bots/runtime/local-1/webhook');
  });

  it('loads and reconciles only the process-owned LOCAL environment', async () => {
    environment.current.mockReturnValue(TelegramBotRuntimeEnvironment.LOCAL);
    const local = runtime('local-1', TelegramBotRuntimeEnvironment.LOCAL);
    registry.bootstrap.mockResolvedValue([
      { runtime: local, token: 'local-token' },
    ]);
    api.getWebhookInfo.mockResolvedValue({ url: local.webhookUrl });

    await service.onModuleInit();

    expect(prisma.telegramBotRuntimeInstance.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          environment: TelegramBotRuntimeEnvironment.LOCAL,
        }),
      }),
    );
    expect(registry.bootstrap).toHaveBeenCalledWith(
      TelegramBotRuntimeEnvironment.LOCAL,
    );
    expect(presentation.reconcile).toHaveBeenCalledWith(
      'local-token',
      TelegramBotApplicationType.FINANCE,
      'bot-1',
    );
    expect(api.setWebhook).not.toHaveBeenCalled();
    expect(prisma.telegramBotRuntimeInstance.updateMany).not.toHaveBeenCalled();
  });

  it('changes only a mismatched LOCAL webhook and never uses a production token', async () => {
    environment.current.mockReturnValue(TelegramBotRuntimeEnvironment.LOCAL);
    const local = runtime('local-1', TelegramBotRuntimeEnvironment.LOCAL);
    registry.bootstrap.mockResolvedValue([
      { runtime: local, token: 'local-token' },
    ]);
    api.getWebhookInfo.mockResolvedValue({
      url: 'https://production.example/webhook',
    });
    prisma.telegramBotRuntimeInstance.updateMany.mockResolvedValue({
      count: 1,
    });
    registry.refresh.mockResolvedValue({
      runtime: local,
      token: 'local-token',
    });

    await service.onModuleInit();

    expect(api.setWebhook).toHaveBeenCalledWith(
      'local-token',
      local.webhookUrl,
      'webhook-secret',
    );
    expect(api.setWebhook).not.toHaveBeenCalledWith(
      'production-token',
      expect.anything(),
      expect.anything(),
    );
  });

  it('rejects a LOCAL runtime id in a PRODUCTION process before dispatch', async () => {
    environment.current.mockReturnValue(
      TelegramBotRuntimeEnvironment.PRODUCTION,
    );
    registry.resolve.mockResolvedValue(null);

    await expect(
      service.handleWebhook('local-1', 'secret', { update_id: 1 }),
    ).rejects.toThrow('runtime not found');
    expect(registry.resolve).toHaveBeenCalledWith(
      'local-1',
      TelegramBotRuntimeEnvironment.PRODUCTION,
    );
    expect(dispatcher.dispatch).not.toHaveBeenCalled();
  });

  it('does not inspect or configure a LOCAL token in a PRODUCTION process', async () => {
    environment.current.mockReturnValue(
      TelegramBotRuntimeEnvironment.PRODUCTION,
    );

    await expect(
      service.configureRuntime({
        botIntegrationId: 'bot-1',
        environment: TelegramBotRuntimeEnvironment.LOCAL,
        token: 'local-token',
      }),
    ).rejects.toThrow('does not own the LOCAL');

    expect(api.getMe).not.toHaveBeenCalled();
    expect(prisma.telegramBotIntegration.findUnique).not.toHaveBeenCalled();
  });

  it('dispatches with the cached runtime token and execution runtime id', async () => {
    environment.current.mockReturnValue(TelegramBotRuntimeEnvironment.LOCAL);
    const local = runtime('local-1', TelegramBotRuntimeEnvironment.LOCAL);
    registry.resolve.mockResolvedValue({
      runtime: local,
      token: 'local-token',
    });
    prisma.telegramBotUpdateLog.create.mockResolvedValue({ id: 'log-1' });
    dispatcher.dispatch.mockImplementation(async (context) => {
      expect(context.token).toBe('local-token');
      expect(context.runtime.id).toBe('local-1');
      expect(executionContext.currentRuntimeId()).toBe('local-1');
      return { handled: true };
    });

    await service.handleWebhook('local-1', 'webhook-secret', { update_id: 7 });

    expect(prisma.telegramBotUpdateLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        runtimeInstanceId: 'local-1',
        updateId: '7',
      }),
    });
  });

  it('accepts the pending secret during a recoverable STARTING transition', async () => {
    environment.current.mockReturnValue(TelegramBotRuntimeEnvironment.LOCAL);
    const local = {
      ...runtime('local-1', TelegramBotRuntimeEnvironment.LOCAL),
      runtimeStatus: TelegramBotRuntimeStatus.STARTING,
      pendingWebhookSecretEncrypted: 'pending-secret-enc',
      pendingWebhookSecretIv: 'pending-secret-iv',
      pendingWebhookSecretAuthTag: 'pending-secret-tag',
    };
    registry.resolve.mockResolvedValue({
      runtime: local,
      token: 'local-token',
    });
    prisma.telegramBotUpdateLog.create.mockResolvedValue({ id: 'log-1' });
    dispatcher.dispatch.mockResolvedValue({ handled: true });

    await expect(
      service.handleWebhook('local-1', 'webhook-secret', { update_id: 8 }),
    ).resolves.toMatchObject({ ok: true, duplicate: false });
  });

  it('scopes equal Telegram update ids to their distinct runtime instances', async () => {
    environment.current.mockReturnValue(TelegramBotRuntimeEnvironment.LOCAL);
    const localA = runtime('local-a', TelegramBotRuntimeEnvironment.LOCAL);
    const localB = runtime('local-b', TelegramBotRuntimeEnvironment.LOCAL);
    registry.resolve.mockImplementation((id) =>
      Promise.resolve({
        runtime: id === 'local-a' ? localA : localB,
        token: id,
      }),
    );
    prisma.telegramBotUpdateLog.create
      .mockResolvedValueOnce({ id: 'log-a' })
      .mockResolvedValueOnce({ id: 'log-b' });
    dispatcher.dispatch.mockResolvedValue({ handled: true });

    await service.handleWebhook('local-a', 'webhook-secret', { update_id: 11 });
    await service.handleWebhook('local-b', 'webhook-secret', { update_id: 11 });

    expect(
      prisma.telegramBotUpdateLog.create.mock.calls.map(
        (call) => call[0].data.runtimeInstanceId,
      ),
    ).toEqual(['local-a', 'local-b']);
  });

  it('invalidates and refreshes cached credentials after token configuration', async () => {
    environment.current.mockReturnValue(TelegramBotRuntimeEnvironment.LOCAL);
    prisma.telegramBotIntegration.findUnique.mockResolvedValue({
      id: 'bot-1',
      workspaceId: 'workspace-1',
    });
    prisma.telegramBotRuntimeInstance.findUnique.mockResolvedValue(null);
    api.getMe.mockResolvedValue({ id: 42, username: 'local_bot' });
    prisma.telegramBotRuntimeInstance.upsert.mockResolvedValue({
      id: 'local-1',
      environment: TelegramBotRuntimeEnvironment.LOCAL,
    });

    await service.configureRuntime({
      botIntegrationId: 'bot-1',
      environment: TelegramBotRuntimeEnvironment.LOCAL,
      token: 'new-local-token',
    });

    expect(registry.refresh).toHaveBeenCalledWith(
      'local-1',
      TelegramBotRuntimeEnvironment.LOCAL,
    );
  });

  it('checks only the selected runtime and records Web App and Mini App separately', async () => {
    environment.current.mockReturnValue(TelegramBotRuntimeEnvironment.LOCAL);
    const local = runtime('local-1', TelegramBotRuntimeEnvironment.LOCAL);
    prisma.telegramBotRuntimeInstance.findUnique.mockResolvedValue(local);
    api.getMe.mockResolvedValue({ id: 42, username: 'local_bot' });
    api.getWebhookInfo.mockResolvedValue({ url: local.webhookUrl });
    checks.presentation.mockResolvedValue({
      webApp: { status: 'AVAILABLE', url: 'https://local.example/finance/bot-1', error: null },
      miniApp: {
        status: 'ERROR',
        expectedUrl: 'https://local.example/finance/bot-1',
        actualUrl: 'https://another.example/finance/bot-1',
        error: 'Telegram menu button points to another URL.',
      },
    });
    prisma.telegramBotRuntimeInstance.update.mockResolvedValue(local);
    registry.refresh.mockResolvedValue({ runtime: local, token: 'local-token' });
    const previousMiniAppUrl = process.env.FINANCE_MINI_APP_URL;
    process.env.FINANCE_MINI_APP_URL = 'https://local.example';
    await service.checkRuntime('bot-1', TelegramBotRuntimeEnvironment.LOCAL);

    expect(api.getMe).toHaveBeenCalledWith('token');
    expect(prisma.telegramBotRuntimeInstance.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          botIntegrationId_environment: {
            botIntegrationId: 'bot-1',
            environment: TelegramBotRuntimeEnvironment.LOCAL,
          },
        },
      }),
    );
    expect(prisma.telegramBotRuntimeInstance.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'local-1' },
        data: expect.objectContaining({
          webAppStatus: 'AVAILABLE',
          miniAppStatus: 'ERROR',
          miniAppActualUrl: 'https://another.example/finance/bot-1',
        }),
      }),
    );
    expect(checks.presentation).toHaveBeenCalledWith(
      'token',
      'bot-1',
      true,
    );
    if (previousMiniAppUrl === undefined) delete process.env.FINANCE_MINI_APP_URL;
    else process.env.FINANCE_MINI_APP_URL = previousMiniAppUrl;
  });
});
