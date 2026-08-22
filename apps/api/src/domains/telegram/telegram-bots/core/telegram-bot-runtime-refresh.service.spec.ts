/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-argument */
import {
  TelegramBotApplicationType,
  TelegramBotRuntimeEnvironment,
  TelegramBotRuntimeStatus,
  TelegramBotWebhookStatus,
} from '@prisma/client';
import { TelegramBotRuntimeRefreshService } from './telegram-bot-runtime-refresh.service';

describe('TelegramBotRuntimeRefreshService', () => {
  const runtime = {
    id: 'runtime-1',
    botIntegrationId: 'finance-1',
    environment: TelegramBotRuntimeEnvironment.PRODUCTION,
    runtimeStatus: TelegramBotRuntimeStatus.ACTIVE,
    webhookUrl:
      'https://api.nexeloq.com/api/telegram/bots/runtime/runtime-1/webhook',
    botIntegration: { applicationType: TelegramBotApplicationType.FINANCE },
  } as any;
  const prisma = {
    telegramBotRuntimeInstance: { update: jest.fn() },
  } as any;
  const botApi = {
    getMe: jest.fn(),
    getWebhookInfo: jest.fn(),
  } as any;
  const presentation = { reconcile: jest.fn() } as any;
  const checks = { presentation: jest.fn() } as any;
  const registry = { refresh: jest.fn() } as any;
  const userPresentation = { reconcile: jest.fn() } as any;
  let service: TelegramBotRuntimeRefreshService;

  beforeEach(() => {
    jest.clearAllMocks();
    botApi.getMe.mockResolvedValue({ id: 7, username: 'finance_bot' });
    botApi.getWebhookInfo.mockResolvedValue({ url: runtime.webhookUrl });
    presentation.reconcile.mockResolvedValue({
      miniAppUrl: 'https://nexeloq.com/finance/finance-1',
    });
    userPresentation.reconcile.mockResolvedValue({ attempted: 1, failed: 0 });
    checks.presentation.mockResolvedValue({
      webApp: {
        status: 'AVAILABLE',
        url: 'https://nexeloq.com/finance/finance-1',
        error: null,
      },
      miniApp: {
        status: 'CONFIGURED',
        expectedUrl: 'https://nexeloq.com/finance/finance-1',
        actualUrl: 'https://nexeloq.com/finance/finance-1',
        error: null,
      },
    });
    prisma.telegramBotRuntimeInstance.update.mockResolvedValue(runtime);
    service = new TelegramBotRuntimeRefreshService(
      prisma,
      botApi,
      presentation,
      checks,
      registry,
      userPresentation,
    );
  });

  it('repairs global and chat-specific presentation before checking Telegram', async () => {
    await service.refresh(runtime, 'token');

    expect(presentation.reconcile).toHaveBeenCalledWith(
      'token',
      TelegramBotApplicationType.FINANCE,
      'finance-1',
    );
    expect(userPresentation.reconcile).toHaveBeenCalledWith({
      runtimeId: 'runtime-1',
      botIntegrationId: 'finance-1',
      applicationType: TelegramBotApplicationType.FINANCE,
      token: 'token',
    });
    expect(checks.presentation).toHaveBeenCalledWith(
      'token',
      'finance-1',
      true,
    );
    expect(prisma.telegramBotRuntimeInstance.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          webhookStatus: TelegramBotWebhookStatus.CONFIGURED,
          miniAppActualUrl: 'https://nexeloq.com/finance/finance-1',
        }),
      }),
    );
  });

  it('does not report success when Telegram rejects presentation repair', async () => {
    presentation.reconcile.mockRejectedValueOnce(new Error('Telegram failed'));

    await expect(service.refresh(runtime, 'token')).rejects.toThrow(
      'Telegram failed',
    );
    expect(checks.presentation).not.toHaveBeenCalled();
    expect(prisma.telegramBotRuntimeInstance.update).not.toHaveBeenCalled();
  });
});
