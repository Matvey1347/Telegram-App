import type { Request } from 'express';
import { FinanceConsumerBillingController } from './finance-consumer-billing.controller';

describe('FinanceConsumerBillingController', () => {
  const previousFrontend = process.env.FRONTEND_URL;

  beforeAll(() => {
    process.env.FRONTEND_URL = 'https://finance.example';
  });

  afterAll(() => {
    if (previousFrontend === undefined) delete process.env.FRONTEND_URL;
    else process.env.FRONTEND_URL = previousFrontend;
  });

  it('returns from the Stripe portal to the dedicated Plans screen', async () => {
    const requests = {
      authenticate: jest.fn().mockReturnValue({
        profileId: 'profile-1',
        telegramBotUserId: 'telegram-user-1',
      }),
    };
    const billing = {
      stripePortal: jest.fn().mockResolvedValue({
        url: 'https://billing.example/portal',
      }),
    };
    const controller = new FinanceConsumerBillingController(
      requests as never,
      billing as never,
      {} as never,
    );

    await expect(
      controller.paymentPortal('bot-1', {} as Request),
    ).resolves.toEqual({ url: 'https://billing.example/portal' });
    expect(billing.stripePortal).toHaveBeenCalledWith({
      botIntegrationId: 'bot-1',
      telegramBotUserId: 'telegram-user-1',
      returnUrl: 'https://finance.example/finance/bot-1?screen=billing',
    });
  });
});
