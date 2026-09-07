import { NotFoundException } from '@nestjs/common';
import { TelegramChannelPerformanceHistoryService } from './telegram-channel-performance-history.service';

describe('TelegramChannelPerformanceHistoryService', () => {
  const now = new Date('2026-09-07T12:00:00.000Z');

  function createService(overrides: Record<string, unknown> = {}) {
    const prisma = {
      telegramChannel: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'channel-1',
          purchaseTransactionId: 'purchase-1',
        }),
      },
      $queryRaw: jest.fn().mockResolvedValue([
        {
          collectedAt: new Date('2026-09-01T20:00:00.000Z'),
          subscribers: 1_000,
          averageViews: 500,
          averageReactions: 20,
        },
        {
          collectedAt: new Date('2026-09-07T10:00:00.000Z'),
          subscribers: 1_100,
          averageViews: 450,
          averageReactions: 18,
        },
      ]),
      transaction: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'purchase-1',
            type: 'expense',
            date: new Date('2026-08-01T10:00:00.000Z'),
            amountInPrimaryCurrency: 1_000,
            categoryRef: null,
            telegramAdSalePayment: null,
          },
          {
            id: 'ad-spend-1',
            type: 'expense',
            date: new Date('2026-09-02T10:00:00.000Z'),
            amountInPrimaryCurrency: 100,
            categoryRef: { key: 'advertising', name: 'Advertising' },
            telegramAdSalePayment: null,
          },
          {
            id: 'manual-revenue-1',
            type: 'income',
            date: new Date('2026-09-03T10:00:00.000Z'),
            amountInPrimaryCurrency: 100,
            categoryRef: {
              key: 'channel_advertising_revenue',
              name: 'Channel advertising revenue',
            },
            telegramAdSalePayment: null,
          },
          {
            id: 'payment-transaction-1',
            type: 'income',
            date: new Date('2026-09-04T10:00:00.000Z'),
            amountInPrimaryCurrency: 200,
            categoryRef: {
              key: 'channel_advertising_revenue',
              name: 'Channel advertising revenue',
            },
            telegramAdSalePayment: { id: 'payment-1' },
          },
        ]),
      },
      telegramAdSalePaymentAllocation: {
        findMany: jest.fn().mockResolvedValue([
          {
            amountInPrimaryCurrency: 200,
            payment: { paidAt: new Date('2026-09-05T10:00:00.000Z') },
          },
        ]),
      },
      workspace: {
        findUnique: jest.fn().mockResolvedValue({ primaryCurrency: 'UAH' }),
      },
      ...overrides,
    };
    const support = { workspace: jest.fn().mockResolvedValue('workspace-1') };
    return {
      prisma,
      service: new TelegramChannelPerformanceHistoryService(
        prisma as never,
        support as never,
      ),
    };
  }

  it('builds audience and cumulative payback charts without double-counting payments', async () => {
    const { service, prisma } = createService();

    const result = await service.history('user-1', 'channel-1', 7, now);

    expect(result).toMatchObject({ periodDays: 7, currency: 'UAH' });
    expect(result.points).toEqual([
      expect.objectContaining({
        date: '2026-09-01T00:00:00.000Z',
        subscribers: 1_000,
        averageViews: 500,
        invested: 1_000,
        revenue: 0,
        paybackPercent: 0,
      }),
      expect.objectContaining({
        date: '2026-09-02T00:00:00.000Z',
        invested: 1_100,
        revenue: 0,
        paybackPercent: 0,
      }),
      expect.objectContaining({
        date: '2026-09-03T00:00:00.000Z',
        invested: 1_100,
        revenue: 100,
        paybackPercent: 9.1,
      }),
      expect.objectContaining({
        date: '2026-09-05T00:00:00.000Z',
        invested: 1_100,
        revenue: 300,
        paybackPercent: 27.3,
      }),
      expect.objectContaining({
        date: '2026-09-07T00:00:00.000Z',
        subscribers: 1_100,
        averageViews: 450,
        invested: 1_100,
        revenue: 300,
        paybackPercent: 27.3,
      }),
    ]);
    expect(prisma.$queryRaw).toHaveBeenCalledTimes(1);
    expect(prisma.transaction.findMany).toHaveBeenCalledTimes(1);
    expect(
      prisma.telegramAdSalePaymentAllocation.findMany,
    ).toHaveBeenCalledTimes(1);
  });

  it('keeps history workspace-isolated and rejects an unknown channel', async () => {
    const { service, prisma } = createService({
      telegramChannel: { findFirst: jest.fn().mockResolvedValue(null) },
    });

    await expect(
      service.history('user-1', 'missing-channel', 90, now),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.telegramChannel.findFirst).toHaveBeenCalledWith({
      where: {
        id: 'missing-channel',
        workspaceId: 'workspace-1',
        isActive: true,
      },
      select: { id: true, purchaseTransactionId: true },
    });
    expect(prisma.$queryRaw).not.toHaveBeenCalled();
  });

  it('propagates a history read failure instead of drawing partial data', async () => {
    const { service } = createService({
      $queryRaw: jest.fn().mockRejectedValue(new Error('database unavailable')),
    });

    await expect(
      service.history('user-1', 'channel-1', 90, now),
    ).rejects.toThrow('database unavailable');
  });
});
