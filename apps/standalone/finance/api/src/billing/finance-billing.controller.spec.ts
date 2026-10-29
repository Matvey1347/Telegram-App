import { ForbiddenException } from '@nestjs/common';
import { FinanceBillingController } from './finance-billing.controller';

describe('Finance Billing Checkout surface', () => {
  const session = { financeBotId: 'bot-1', financeTelegramUserId: 'user-1', profileId: 'profile-1', expiresAt: Date.now() + 60_000 };
  const sessions = {
    authenticateBrowser: jest.fn().mockReturnValue({ ...session, surface: 'TELEGRAM_MINI_APP' }),
    assertExternalCheckout: jest.fn().mockImplementation((value) => {
      if (value.surface !== 'EXTERNAL_WEB') throw new ForbiddenException();
    }),
  };
  const billing = { checkout: jest.fn().mockResolvedValue({ url: 'https://checkout.stripe.com/example' }) };
  const controller = new FinanceBillingController(sessions as never, billing as never);

  beforeEach(() => jest.clearAllMocks());

  it('rejects a Telegram Mini App session before creating a Stripe Checkout', () => {
    expect(() => controller.checkout('bot-1', undefined, 'finance_session=token', 'https://finance.example', { offerCode: 'MONTH' })).toThrow(ForbiddenException);
    expect(billing.checkout).not.toHaveBeenCalled();
  });

  it('rejects the Stripe billing portal inside a Telegram Mini App', () => {
    expect(() => controller.portal('bot-1', undefined, 'finance_session=token', 'https://finance.example')).toThrow(ForbiddenException);
  });

  it('allows a signed external Finance Web session to use the existing billing service', async () => {
    sessions.authenticateBrowser.mockReturnValueOnce({ ...session, surface: 'EXTERNAL_WEB' });
    await expect(controller.checkout('bot-1', undefined, 'finance_session=token', 'https://finance.example', { offerCode: 'MONTH' })).resolves.toEqual({ url: 'https://checkout.stripe.com/example' });
    expect(billing.checkout).toHaveBeenCalledWith(expect.objectContaining({ surface: 'EXTERNAL_WEB' }), 'MONTH');
  });
});
