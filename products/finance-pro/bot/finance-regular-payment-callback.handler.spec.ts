import { FinanceTransactionSource } from '@prisma/client';
import { FinanceRegularPaymentCallbackHandler } from './finance-regular-payment-callback.handler';
import { financeRegularPaymentConfirmCallback } from './finance-obligation-telegram.presenter';

describe('FinanceRegularPaymentCallbackHandler', () => {
  it('confirms the exact occurrence as a chat transaction', async () => {
    const confirmations = {
      confirm: jest.fn().mockResolvedValue({ duplicate: false }),
    };
    const interactive = { send: jest.fn().mockResolvedValue(undefined) };
    const handler = new FinanceRegularPaymentCallbackHandler(
      confirmations as never,
      interactive as never,
    );
    const occurrence = new Date('2026-09-01T00:00:00.000Z');
    const handled = await handler.handle({
      context: {
        token: 'token',
        update: {
          callback_query: {
            data: financeRegularPaymentConfirmCallback(
              'regular-1',
              occurrence,
              3,
            ),
          },
        },
      } as never,
      profileId: 'profile-1',
      chatId: '42',
      locale: 'en',
    });
    expect(handled).toBe(true);
    expect(confirmations.confirm).toHaveBeenCalledWith(
      'profile-1',
      'regular-1',
      { expectedOccurrenceAt: occurrence.toISOString(), expectedVersion: 3 },
      FinanceTransactionSource.CHAT,
    );
    expect(interactive.send).toHaveBeenCalledWith(
      'token',
      '42',
      expect.objectContaining({ text: expect.stringContaining('confirmed') }),
    );
  });

  it('ignores unrelated callbacks', async () => {
    const handler = new FinanceRegularPaymentCallbackHandler(
      {} as never,
      {} as never,
    );
    await expect(
      handler.handle({
        context: {
          update: { callback_query: { data: 'fin:flow:confirm' } },
        } as never,
        profileId: 'profile-1',
        chatId: '42',
        locale: 'en',
      }),
    ).resolves.toBe(false);
  });

  it.each([
    [true, 'already confirmed'],
    [false, 'confirmed'],
  ])(
    'uses idempotent confirmation copy when duplicate=%s',
    async (duplicate, text) => {
      const confirmations = {
        confirm: jest.fn().mockResolvedValue({ duplicate }),
      };
      const interactive = { send: jest.fn().mockResolvedValue(undefined) };
      const handler = new FinanceRegularPaymentCallbackHandler(
        confirmations as never,
        interactive as never,
      );
      await handler.handle({
        context: {
          token: 'token',
          update: {
            callback_query: {
              data: financeRegularPaymentConfirmCallback(
                'regular-1',
                new Date('2026-09-01T00:00:00.000Z'),
                3,
              ),
            },
          },
        } as never,
        profileId: 'profile-1',
        chatId: '42',
        locale: 'en',
      });
      expect(interactive.send).toHaveBeenCalledWith(
        'token',
        '42',
        expect.objectContaining({ text: expect.stringContaining(text) }),
      );
    },
  );

  it('turns a stale occurrence into a localized unavailable response', async () => {
    const confirmations = {
      confirm: jest.fn().mockRejectedValue(new Error('stale occurrence')),
    };
    const interactive = { send: jest.fn().mockResolvedValue(undefined) };
    const handler = new FinanceRegularPaymentCallbackHandler(
      confirmations as never,
      interactive as never,
    );
    await handler.handle({
      context: {
        token: 'token',
        update: {
          callback_query: {
            data: financeRegularPaymentConfirmCallback(
              'regular-1',
              new Date('2026-09-01T00:00:00.000Z'),
              3,
            ),
          },
        },
      } as never,
      profileId: 'profile-1',
      chatId: '42',
      locale: 'uk',
    });
    expect(interactive.send).toHaveBeenCalledWith(
      'token',
      '42',
      expect.objectContaining({ text: expect.stringContaining('недоступна') }),
    );
  });
});
