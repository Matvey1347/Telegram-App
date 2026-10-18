import { ServiceUnavailableException } from '@nestjs/common';
import { FinancePrimaryBotService } from './finance-primary-bot.service';

describe('FinancePrimaryBotService', () => {
  it('creates a single configured local primary bot without selecting it from a request', async () => {
    const findUnique = jest.fn().mockResolvedValue(null);
    const create = jest.fn().mockResolvedValue({ id: 'finance-local-bot', telegramUsername: 'groshly_dev_bot' });
    const service = new FinancePrimaryBotService(
      {
        selectedBot: {
          environment: 'LOCAL',
          username: 'groshly_dev_bot',
          token: 'not-used-for-webhook-processing',
          webhookSecret: 'a-secure-local-webhook-secret-with-32-chars',
        },
      } as never,
      { financeBot: { findUnique, create } } as never,
    );

    await expect(service.resolve()).resolves.toMatchObject({ id: 'finance-local-bot' });
    expect(findUnique).toHaveBeenCalledWith({ where: { runtimeEnvironment: 'LOCAL' } });
    expect(create).toHaveBeenCalledWith({
      data: { runtimeEnvironment: 'LOCAL', telegramUsername: 'groshly_dev_bot' },
    });
  });

  it('does not resolve a bot or accept its secret while the runtime is disabled', () => {
    const service = new FinancePrimaryBotService(
      { selectedBot: undefined } as never,
      { financeBot: {} } as never,
    );

    expect(() => service.webhookSecret()).toThrow(ServiceUnavailableException);
  });
});
