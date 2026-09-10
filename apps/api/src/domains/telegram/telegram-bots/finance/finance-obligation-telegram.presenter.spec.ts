import {
  FinanceObligationTelegramPresenter,
  financeRegularPaymentConfirmCallback,
} from './finance-obligation-telegram.presenter';
import { parseFinanceRegularPaymentCallback } from './finance-regular-payment-callback.handler';

describe('Finance obligation Telegram presentation', () => {
  it('keeps the exact occurrence in a bounded callback and links amount changes to the regular screen', () => {
    const occurrence = new Date('2026-10-25T23:00:00.000Z');
    const callback = financeRegularPaymentConfirmCallback(
      'regular-payment-1',
      occurrence,
      7,
    );
    expect(callback.length).toBeLessThanOrEqual(64);
    expect(parseFinanceRegularPaymentCallback(callback)).toEqual({
      regularPaymentId: 'regular-payment-1',
      expectedOccurrenceAt: occurrence.toISOString(),
      expectedVersion: 7,
    });
    const message = new FinanceObligationTelegramPresenter().regularPaymentDue({
      botIntegrationId: 'bot-1',
      regularPaymentId: 'regular-payment-1',
      name: 'Rent',
      amount: '1000',
      currency: 'USD',
      expectedOccurrenceAt: occurrence,
      configVersion: 7,
      locale: 'uk',
    });
    expect(message.text).toContain('Час регулярного платежу');
    expect(message.inlineButtons?.[0]?.[0]).toMatchObject({
      callbackData: callback,
    });
    expect(message.inlineButtons?.[0]?.[1]?.webAppUrl).toContain(
      'screen=regular-payments',
    );
    expect(message.inlineButtons?.[0]?.[1]?.webAppUrl).toContain(
      'regularPaymentId=regular-payment-1',
    );
    expect(message.inlineButtons?.[0]?.[1]?.webAppUrl).toContain(
      'occurrenceAt=2026-10-25T23%3A00%3A00.000Z',
    );
    expect(message.inlineButtons?.[1]?.[0]?.webAppUrl).toContain(
      'screen=regular-payments',
    );
  });

  it.each(['en', 'uk', 'ru'] as const)(
    'presents debt notifications in %s with a scoped app link',
    (locale) => {
      const message = new FinanceObligationTelegramPresenter().debtDue({
        botIntegrationId: 'bot-1',
        debtName: 'Alex',
        amount: '50',
        currency: 'EUR',
        locale,
      });
      expect(message.text).toContain('Alex');
      expect(message.inlineButtons?.[0]?.[0]?.webAppUrl).toContain(
        'screen=debts',
      );
    },
  );
});
