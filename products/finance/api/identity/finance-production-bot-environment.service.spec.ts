import { FinanceProductionBotEnvironmentService } from './finance-production-bot-environment.service';

function setup() {
  const settings = new Map([
    ['FINANCE_BOT_DASHBOARD_WORKSPACE_ID', 'workspace'],
    ['FINANCE_BOT_PRODUCTION_TOKEN', 'new-token'],
    ['FINANCE_BOT_PRODUCTION_USERNAME', 'finance_bot'],
  ]);
  const config = { get: (key: string) => settings.get(key) };
  const db = {
    telegramBotIntegration: {
      findMany: jest.fn().mockResolvedValue([{
        id: 'finance',
        runtimeInstances: [{
          id: 'runtime',
          botId: '100',
          runtimeStatus: 'ACTIVE',
          botTokenEncrypted: 'encrypted',
          botTokenIv: 'iv',
          botTokenAuthTag: 'tag',
        }],
      }]),
    },
  };
  const telegram = {
    getMe: jest.fn().mockResolvedValue({ id: 100, username: 'finance_bot' }),
    getWebhookInfo: jest.fn().mockResolvedValue({ url: '' }),
  };
  const runtime = {
    webhookUrlFor: jest.fn().mockReturnValue('https://api.example/webhook'),
    configureRuntime: jest.fn(),
    enableRuntime: jest.fn(),
  };
  const ownership = { owns: jest.fn().mockReturnValue(true) };
  const encryption = { decrypt: jest.fn().mockReturnValue('old-token') };
  const service = new FinanceProductionBotEnvironmentService(
    config as never, db as never, telegram as never,
    async () => runtime as never, ownership as never, encryption as never,
  );
  return { service, telegram, runtime, encryption };
}

it('activates a rotated production token for the existing account', async () => {
  const { service, runtime } = setup();
  await service['synchronize']();
  expect(runtime.configureRuntime).toHaveBeenCalledWith({
    botIntegrationId: 'finance', environment: 'PRODUCTION', token: 'new-token',
  });
  expect(runtime.enableRuntime).toHaveBeenCalledWith({
    botIntegrationId: 'finance', environment: 'PRODUCTION',
  });
});

it('preserves a running bot when the environment credential already matches', async () => {
  const { service, telegram, runtime, encryption } = setup();
  encryption.decrypt.mockReturnValue('new-token');
  await service['synchronize']();
  expect(telegram.getMe).not.toHaveBeenCalled();
  expect(runtime.configureRuntime).not.toHaveBeenCalled();
});

it('preserves a webhook owned by another host', async () => {
  const { service, telegram, runtime } = setup();
  telegram.getWebhookInfo.mockResolvedValue({ url: 'https://other.example/webhook' });
  await expect(service['synchronize']()).rejects.toThrow('webhook owner');
  expect(runtime.configureRuntime).not.toHaveBeenCalled();
});
