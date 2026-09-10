import { TelegramAdSalesPaymentsController } from './telegram-ad-sales-payments.controller';

describe('TelegramAdSalesPaymentsController', () => {
  it('forwards the optional deal-value cleanup choice', async () => {
    const paymentDeletion = {
      deleteActivePayment: jest.fn().mockResolvedValue({
        paymentId: 'payment-1',
        transactionId: 'transaction-1',
        dealAmountCleared: true,
      }),
    };
    const controller = new TelegramAdSalesPaymentsController(
      {} as never,
      paymentDeletion as never,
    );

    await controller.deletePayment(
      { sub: 'user-1' } as never,
      'sale-1',
      'payment-1',
      { clearDealAmount: true },
    );

    expect(paymentDeletion.deleteActivePayment).toHaveBeenCalledWith(
      'user-1',
      'sale-1',
      'payment-1',
      { clearDealAmount: true },
    );
  });
});
