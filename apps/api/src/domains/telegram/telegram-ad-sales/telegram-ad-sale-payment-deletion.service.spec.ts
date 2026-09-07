import { TelegramAdSalePaymentStatus } from '@prisma/client';
import { TelegramAdSalePaymentDeletionService } from './telegram-ad-sale-payment-deletion.service';

describe('TelegramAdSalePaymentDeletionService', () => {
  it('deletes the active payment and soft-deletes its linked finance transaction', async () => {
    const paymentDelete = jest.fn();
    const transactionUpdateMany = jest.fn();
    const prisma = {
      telegramAdSalePayment: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'payment-1',
          transactionId: 'transaction-1',
          reversalTransactionId: null,
          status: TelegramAdSalePaymentStatus.ACTIVE,
          sale: { advertiserId: 'advertiser-1' },
        }),
      },
      $transaction: jest.fn().mockImplementation((callback) =>
        callback({
          telegramAdSalePayment: { delete: paymentDelete },
          transaction: { updateMany: transactionUpdateMany },
        }),
      ),
    };
    const workspaceService = {
      resolveWorkspaceIdForUser: jest.fn().mockResolvedValue('workspace-1'),
    };
    const adSales = { recalculateAdvertiserStats: jest.fn() };
    const service = new TelegramAdSalePaymentDeletionService(
      prisma as never,
      workspaceService as never,
      adSales as never,
    );

    await expect(
      service.deleteActivePayment('user-1', 'sale-1', 'payment-1'),
    ).resolves.toEqual({
      paymentId: 'payment-1',
      transactionId: 'transaction-1',
    });
    expect(prisma.telegramAdSalePayment.findFirst).toHaveBeenCalledWith({
      where: {
        id: 'payment-1',
        workspaceId: 'workspace-1',
        telegramAdSaleId: 'sale-1',
      },
      select: expect.any(Object),
    });
    expect(paymentDelete).toHaveBeenCalledWith({
      where: { id: 'payment-1', workspaceId: 'workspace-1' },
    });
    expect(transactionUpdateMany).toHaveBeenCalledWith({
      where: {
        id: 'transaction-1',
        workspaceId: 'workspace-1',
        deletedAt: null,
      },
      data: { deletedAt: expect.any(Date) },
    });
    expect(adSales.recalculateAdvertiserStats).toHaveBeenCalledWith(
      'workspace-1',
      'advertiser-1',
    );
  });

  it('preserves voided payment and reversal audit records', async () => {
    const prisma = {
      telegramAdSalePayment: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'payment-1',
          transactionId: 'transaction-1',
          reversalTransactionId: 'reversal-1',
          status: TelegramAdSalePaymentStatus.VOIDED,
          sale: { advertiserId: null },
        }),
      },
      $transaction: jest.fn(),
    };
    const service = new TelegramAdSalePaymentDeletionService(
      prisma as never,
      { resolveWorkspaceIdForUser: jest.fn().mockResolvedValue('workspace-1') } as never,
      {} as never,
    );

    await expect(
      service.deleteActivePayment('user-1', 'sale-1', 'payment-1'),
    ).rejects.toThrow('reversal history must be preserved');
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
});
