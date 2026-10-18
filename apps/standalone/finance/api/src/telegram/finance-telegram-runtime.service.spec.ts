import { Logger } from '@nestjs/common';
import { FinanceTelegramRuntimeService } from './finance-telegram-runtime.service';

const local = {
  environment: 'LOCAL' as const,
  username: 'groshly_dev_bot',
  token: 'local-token',
  webhookSecret: 'local-webhook-secret-with-at-least-32-chars',
};
const production = {
  environment: 'PRODUCTION' as const,
  username: 'groshly_bot',
  token: 'production-token',
  webhookSecret: 'production-webhook-secret-with-at-least-32',
};

describe('FinanceTelegramRuntimeService', () => {
  const api = { getWebhookInfo: jest.fn(), setWebhook: jest.fn() };
  const primaryBot = { resolve: jest.fn() };
  const config: { selectedBot: typeof local | typeof production; apiPublicUrl?: string } = {
    selectedBot: local,
    apiPublicUrl: 'https://api.groshly.nexeloq.com',
  };
  let service: FinanceTelegramRuntimeService;

  beforeEach(() => {
    jest.resetAllMocks();
    jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    config.selectedBot = local;
    config.apiPublicUrl = 'https://api.groshly.nexeloq.com';
    api.getWebhookInfo.mockResolvedValue({ url: 'https://other.example/webhook' });
    api.setWebhook.mockResolvedValue(undefined);
    primaryBot.resolve.mockResolvedValue({ id: 'finance-bot-1' });
    service = new FinanceTelegramRuntimeService(config as never, primaryBot as never, api as never);
  });

  afterEach(() => jest.restoreAllMocks());

  it('reconciles only the selected LOCAL bot once when its webhook differs', async () => {
    await service.onModuleInit();

    expect(api.getWebhookInfo).toHaveBeenCalledWith('local-token');
    expect(api.setWebhook).toHaveBeenCalledWith(
      'local-token',
      'https://api.groshly.nexeloq.com/api/telegram/finance/webhook',
      local.webhookSecret,
    );
    expect(api.setWebhook).not.toHaveBeenCalledWith('production-token', expect.anything(), expect.anything());
  });

  it('uses only the selected PRODUCTION token', async () => {
    config.selectedBot = production;
    await service.onModuleInit();

    expect(api.getWebhookInfo).toHaveBeenCalledWith('production-token');
    expect(api.setWebhook).toHaveBeenCalledWith(
      'production-token',
      expect.any(String),
      production.webhookSecret,
    );
    expect(api.getWebhookInfo).not.toHaveBeenCalledWith('local-token');
  });

  it('does not write when the selected webhook already matches', async () => {
    api.getWebhookInfo.mockResolvedValue({
      url: 'https://api.groshly.nexeloq.com/api/telegram/finance/webhook',
    });

    await service.onModuleInit();

    expect(api.setWebhook).not.toHaveBeenCalled();
    expect(primaryBot.resolve).toHaveBeenCalledTimes(1);
  });

  it('has no external call when no public HTTPS API URL exists', async () => {
    config.apiPublicUrl = undefined;

    await service.onModuleInit();

    expect(api.getWebhookInfo).not.toHaveBeenCalled();
    expect(api.setWebhook).not.toHaveBeenCalled();
  });

  it('does not retry after a failed startup reconciliation', async () => {
    api.getWebhookInfo.mockRejectedValue(new Error('network unavailable'));

    await service.onModuleInit();

    expect(api.getWebhookInfo).toHaveBeenCalledTimes(1);
    expect(api.setWebhook).not.toHaveBeenCalled();
    expect(primaryBot.resolve).not.toHaveBeenCalled();
  });
});
