import type { Request } from 'express';
import { ForbiddenException } from '@nestjs/common';
import { FinanceConsumerBillingController } from '@consumer-finance/api/billing/finance-consumer-billing.controller';

describe('FinanceConsumerBillingController', () => {
  const previousFrontend = process.env.FRONTEND_URL;

  beforeAll(() => {
    process.env.FRONTEND_URL = 'https://finance.example';
  });

  afterAll(() => {
    if (previousFrontend === undefined) delete process.env.FRONTEND_URL;
    else process.env.FRONTEND_URL = previousFrontend;
  });

  it('starts Stripe checkout and returns portal access for the authenticated Finance user', () => {
    const requests = {
      authenticate: jest.fn().mockReturnValue({
        profileId: 'profile-1',
        telegramBotUserId: 'telegram-user-1',
      }),
    };
    const billing = { stripePortal: jest.fn(), createStripeCheckout: jest.fn(), createStarsCheckout: jest.fn() };
    const controller = new FinanceConsumerBillingController(
      requests as never,
      billing as never,
      {} as never,
    );

    controller.checkout('bot-1', {} as Request, { priceId: 'price-1', mode: 'TEST' });
    expect(() => controller.starsCheckout('bot-1', {} as Request)).toThrow(ForbiddenException);
    controller.paymentPortal('bot-1', {} as Request);
    expect(billing.createStripeCheckout).toHaveBeenCalledWith({
      botIntegrationId: 'bot-1',
      telegramBotUserId: 'telegram-user-1',
      priceId: 'price-1',
      requestedMode: 'TEST',
      couponCode: undefined,
      successUrl: 'https://finance.example/finance/bot-1?screen=billing&checkout=success',
      cancelUrl: 'https://finance.example/finance/bot-1?screen=billing&checkout=cancel',
    });
    expect(billing.stripePortal).toHaveBeenCalledWith({
      botIntegrationId: 'bot-1',
      telegramBotUserId: 'telegram-user-1',
      returnUrl: 'https://finance.example/finance/bot-1?screen=billing',
    });
    expect(billing.createStarsCheckout).not.toHaveBeenCalled();
  });
});
