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
          createdAt: new Date('2026-08-01T10:00:00.000Z'),
          ownViewsPerPost: 0,
          ownReactionsPerPost: 0,
          adBaseCpm: 300,
          adBaseCurrency: 'UAH',
        }),
      },
      $queryRaw: jest
        .fn()
        .mockResolvedValueOnce([
          {
            collectedAt: new Date('2026-09-01T10:00:00.000Z'),
            subscribers: 1_000,
          },
          {
            collectedAt: new Date('2026-09-01T12:00:00.000Z'),
            subscribers: 2_070,
          },
          {
            collectedAt: new Date('2026-09-01T20:00:00.000Z'),
            subscribers: 1_870,
          },
          {
            collectedAt: new Date('2026-09-07T10:00:00.000Z'),
            subscribers: 1_900,
          },
        ])
        .mockResolvedValueOnce([
          {
            date: new Date('2026-09-01T00:00:00.000Z'),
            averageViews: 500,
            averageReactions: 20,
            postsPublished: 2,
          },
          {
            date: new Date('2026-09-07T00:00:00.000Z'),
            averageViews: 450,
            averageReactions: 18,
            postsPublished: 3,
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
    const currencyConversion = {
      convertCurrency: jest.fn().mockResolvedValue(150),
    };
    return {
      prisma,
      currencyConversion,
      service: new TelegramChannelPerformanceHistoryService(
        prisma as never,
        support as never,
        currencyConversion as never,
      ),
    };
  }

  it('preserves same-day subscriber peaks and builds daily views, payback and ads-left charts', async () => {
    const { service, prisma } = createService();

    const result = await service.history('user-1', 'channel-1', '30d', now);

    expect(result).toMatchObject({
      range: '30d',
      periodDays: 30,
      currency: 'UAH',
    });
    expect(
      result.points
        .filter((point) => point.subscribers != null)
        .map((point) => point.subscribers),
    ).toEqual([1_000, 2_070, 1_870, 1_900]);
    expect(result.points).toContainEqual(
      expect.objectContaining({
        date: '2026-09-01T00:00:00.000Z',
        averageViews: 500,
        averageReactions: 20,
        postsPublished: 2,
        invested: 1_000,
        revenue: 0,
        paybackPercent: 0,
        adsLeft: 7,
      }),
    );
    expect(result.points).toContainEqual(
      expect.objectContaining({
        date: '2026-09-05T00:00:00.000Z',
        invested: 1_100,
        revenue: 300,
        paybackPercent: 27.3,
        adsLeft: 6,
      }),
    );
    expect(result.points).toContainEqual(
      expect.objectContaining({
        date: '2026-09-07T00:00:00.000Z',
        averageViews: 450,
        postsPublished: 3,
        adsLeft: 6,
      }),
    );
    expect(prisma.$queryRaw).toHaveBeenCalledTimes(2);
    const rawQuery = prisma.$queryRaw as unknown as {
      mock: { calls: Array<[{ strings: string[] }]> };
    };
    const postHistorySql = rawQuery.mock.calls[1][0].strings.join(' ');
    expect(postHistorySql).toContain('"TelegramPostMetricSnapshot"');
    expect(postHistorySql).toContain("INTERVAL '24 hours'");
    expect(result.points[0].date).toBe('2026-09-01T00:00:00.000Z');
    expect(prisma.transaction.findMany).toHaveBeenCalledTimes(1);
    expect(
      prisma.telegramAdSalePaymentAllocation.findMany,
    ).toHaveBeenCalledTimes(1);
  });

  it('lets each all-time chart start at its first real metric observation', async () => {
    const { service } = createService();

    const result = await service.history('user-1', 'channel-1', 'all', now);

    expect(result.range).toBe('all');
    expect(result.periodDays).toBeNull();
    expect(result.points.find((point) => point.subscribers != null)?.date).toBe(
      '2026-09-01T10:00:00.000Z',
    );
  });

  it('converts a foreign CPM so the ads-left graph remains available', async () => {
    const { service, currencyConversion } = createService({
      telegramChannel: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'channel-1',
          purchaseTransactionId: 'purchase-1',
          createdAt: new Date('2026-08-01T10:00:00.000Z'),
          ownViewsPerPost: 0,
          ownReactionsPerPost: 0,
          adBaseCpm: 4,
          adBaseCurrency: 'USD',
        }),
      },
    });

    const result = await service.history('user-1', 'channel-1', '30d', now);

    expect(currencyConversion.convertCurrency).toHaveBeenCalledWith(
      4,
      'USD',
      'UAH',
      'workspace-1',
    );
    expect(result.points.some((point) => point.adsLeft != null)).toBe(true);
  });

  it.each([
    ['1d', 1],
    ['7d', 7],
  ] as const)('supports the %s whole-modal range', async (range, days) => {
    const { service } = createService();

    const result = await service.history('user-1', 'channel-1', range, now);

    expect(result.range).toBe(range);
    expect(result.periodDays).toBe(days);
  });

  it('keeps Today points inside today while providing yesterday as comparison', async () => {
    const { service } = createService({
      $queryRaw: jest
        .fn()
        .mockResolvedValueOnce([
          {
            collectedAt: new Date('2026-09-06T20:00:00.000Z'),
            subscribers: 1_880,
          },
          {
            collectedAt: new Date('2026-09-07T10:00:00.000Z'),
            subscribers: 1_900,
          },
        ])
        .mockResolvedValueOnce([
          {
            date: new Date('2026-09-06T00:00:00.000Z'),
            averageViews: 400,
            averageReactions: 16,
            postsPublished: 2,
          },
          {
            date: new Date('2026-09-07T00:00:00.000Z'),
            averageViews: 450,
            averageReactions: 18,
            postsPublished: 3,
          },
        ]),
    });

    const result = await service.history('user-1', 'channel-1', '1d', now);

    expect(result.points.every((point) => point.date >= '2026-09-07')).toBe(
      true,
    );
    expect(result.comparisonPoint).toEqual({
      date: '2026-09-06T20:00:00.000Z',
      subscribers: 1_880,
      averageViews: 400,
      averageReactions: 16,
    });
  });

  it('keeps history workspace-isolated and rejects an unknown channel', async () => {
    const { service, prisma } = createService({
      telegramChannel: { findFirst: jest.fn().mockResolvedValue(null) },
    });

    await expect(
      service.history('user-1', 'missing-channel', '90d', now),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.telegramChannel.findFirst).toHaveBeenCalledWith({
      where: {
        id: 'missing-channel',
        workspaceId: 'workspace-1',
        isActive: true,
      },
      select: {
        id: true,
        purchaseTransactionId: true,
        createdAt: true,
        ownViewsPerPost: true,
        ownReactionsPerPost: true,
        adBaseCpm: true,
        adBaseCurrency: true,
      },
    });
    expect(prisma.$queryRaw).not.toHaveBeenCalled();
  });

  it('propagates a history read failure instead of drawing partial data', async () => {
    const { service } = createService({
      $queryRaw: jest.fn().mockRejectedValue(new Error('database unavailable')),
    });

    await expect(
      service.history('user-1', 'channel-1', '90d', now),
    ).rejects.toThrow('database unavailable');
  });
});
