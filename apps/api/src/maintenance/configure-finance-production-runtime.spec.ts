import {
  TelegramBotRuntimeEnvironment,
  TelegramBotRuntimeStatus,
  TelegramBotWebhookStatus,
} from '@prisma/client';
import { configureFinanceProductionRuntime } from './configure-finance-production-runtime';

describe('configureFinanceProductionRuntime', () => {
  it('configures and activates the existing Finance bot in production', async () => {
    const runtime = {
      configureRuntime: jest.fn().mockResolvedValue({
        botIntegrationId: 'finance-bot',
      }),
      enableRuntime: jest.fn().mockResolvedValue({
        id: 'runtime-production',
        environment: TelegramBotRuntimeEnvironment.PRODUCTION,
        runtimeStatus: TelegramBotRuntimeStatus.ACTIVE,
        username: 'Groshly_bot',
        webhookStatus: TelegramBotWebhookStatus.CONFIGURED,
      }),
    };

    await expect(
      configureFinanceProductionRuntime(runtime, {
        botIntegrationId: 'finance-bot',
        token: 'test-token',
      }),
    ).resolves.toEqual({
      runtimeId: 'runtime-production',
      environment: TelegramBotRuntimeEnvironment.PRODUCTION,
      status: TelegramBotRuntimeStatus.ACTIVE,
      username: 'Groshly_bot',
      webhookConfigured: true,
    });
    expect(runtime.configureRuntime).toHaveBeenCalledWith({
      botIntegrationId: 'finance-bot',
      environment: TelegramBotRuntimeEnvironment.PRODUCTION,
      token: 'test-token',
    });
    expect(runtime.enableRuntime).toHaveBeenCalledWith({
      botIntegrationId: 'finance-bot',
      environment: TelegramBotRuntimeEnvironment.PRODUCTION,
    });
  });
});
