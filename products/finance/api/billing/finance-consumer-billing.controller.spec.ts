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

  it('closes old purchases and portal without changing subscription reads', () => {
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

    expect(() => controller.checkout('bot-1', {} as Request)).toThrow(ForbiddenException);
    expect(() => controller.starsCheckout('bot-1', {} as Request)).toThrow(ForbiddenException);
    expect(() => controller.paymentPortal('bot-1', {} as Request)).toThrow(ForbiddenException);
    expect(billing.createStripeCheckout).not.toHaveBeenCalled();
    expect(billing.createStarsCheckout).not.toHaveBeenCalled();
    expect(billing.stripePortal).not.toHaveBeenCalled();
  });
});
