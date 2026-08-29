import { Prisma, TelegramAdSalePaymentStatus } from '@prisma/client';
import {
  adSalesAnalyticsPlacementWhere,
  TelegramAdSalesAnalyticsDatasetReader,
} from './telegram-ad-sales-analytics-dataset-reader';
import { buildAdSalesAnalyticsSummary } from './telegram-ad-sales-analytics-summary';

const from = new Date('2026-07-01T00:00:00.000Z');
const to = new Date('2026-07-31T23:59:59.999Z');
const decimal = (value: number | string) => new Prisma.Decimal(value);

function params(
  overrides: Partial<Parameters<typeof adSalesAnalyticsPlacementWhere>[0]> = {},
) {
  return {
    workspaceId: 'workspace-1',
    from,
    to,
    channelIds: ['channel-1', 'channel-2'],
    networkId: 'network-1',
    networkMode: 'SALE_CONTEXT' as const,
    ...overrides,
  };
}

describe('TelegramAdSalesAnalyticsDatasetReader', () => {
  it('loads placements and channel presentation without a standalone payment read', async () => {
    const placements = [
      { telegramChannelId: 'channel-1' },
      { telegramChannelId: 'channel-1' },
      { telegramChannelId: 'channel-2' },
    ];
    const prisma = {
      telegramAdSalePlacement: {
        findMany: jest.fn().mockResolvedValue(placements),
      },
      telegramAdSalePayment: { findMany: jest.fn() },
      telegramChannel: {
        findMany: jest.fn().mockResolvedValue([
          { id: 'channel-1', title: 'One' },
          { id: 'channel-2', title: 'Two' },
        ]),
      },
    };
    const reader = new TelegramAdSalesAnalyticsDatasetReader(prisma as never);

    const result = await reader.read(params());

    expect(result).toEqual({
      placements,
      channels: [
        { id: 'channel-1', title: 'One' },
        { id: 'channel-2', title: 'Two' },
      ],
    });
    expect(prisma.telegramAdSalePlacement.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: adSalesAnalyticsPlacementWhere(params()),
      }),
    );
    expect(prisma.telegramAdSalePayment.findMany).not.toHaveBeenCalled();
    expect(prisma.telegramChannel.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          workspaceId: 'workspace-1',
          id: { in: ['channel-1', 'channel-2'] },
        },
      }),
    );
  });

  it('uses the exact workspace/network/channel/date predicate for prior revenue', async () => {
    const aggregate = jest.fn().mockResolvedValue({
      _sum: { agreedPrice: decimal(125) },
    });
    const reader = new TelegramAdSalesAnalyticsDatasetReader({
      telegramAdSalePlacement: { aggregate },
    } as never);

    await expect(reader.sumAgreedRevenue(params())).resolves.toEqual(
      decimal(125),
    );
    expect(aggregate).toHaveBeenCalledWith({
      where: {
        workspaceId: 'workspace-1',
        telegramChannelNetworkId: 'network-1',
        telegramChannelId: { in: ['channel-1', 'channel-2'] },
        OR: [
          { scheduledAt: { gte: from, lte: to } },
          { publishedAt: { gte: from, lte: to } },
          { sale: { createdAt: { gte: from, lte: to } } },
        ],
      },
      _sum: { agreedPrice: true },
    });
  });

  it('omits sale-context network filtering in CURRENT_CHANNELS mode', () => {
    const where = adSalesAnalyticsPlacementWhere(
      params({ networkMode: 'CURRENT_CHANNELS' }),
    );

    expect(where).not.toHaveProperty('telegramChannelNetworkId');
    expect(where).toMatchObject({
      workspaceId: 'workspace-1',
      telegramChannelId: { in: ['channel-1', 'channel-2'] },
    });
  });

  it('propagates a failed prior aggregate without a fallback dataset read', async () => {
    const error = new Error('aggregate unavailable');
    const aggregate = jest.fn().mockRejectedValue(error);
    const findMany = jest.fn();
    const reader = new TelegramAdSalesAnalyticsDatasetReader({
      telegramAdSalePlacement: { aggregate, findMany },
    } as never);

    await expect(reader.sumAgreedRevenue(params())).rejects.toBe(error);
    expect(findMany).not.toHaveBeenCalled();
  });

  it('returns zero when the prior period has no agreed revenue', async () => {
    const reader = new TelegramAdSalesAnalyticsDatasetReader({
      telegramAdSalePlacement: {
        aggregate: jest.fn().mockResolvedValue({
          _sum: { agreedPrice: null },
        }),
      },
    } as never);

    await expect(reader.sumAgreedRevenue(params())).resolves.toEqual(
      decimal(0),
    );
  });
});

describe('buildAdSalesAnalyticsSummary previous revenue', () => {
  it('preserves MoM math when legacy previous rows had mixed currencies', () => {
    const placement = (
      id: string,
      agreedPrice: number,
      currency: string,
      paymentAllocations: Array<{
        amount: Prisma.Decimal;
        payment: { status: TelegramAdSalePaymentStatus };
      }> = [],
    ) => ({
      id,
      telegramChannelId: 'channel-1',
      agreedPrice: decimal(agreedPrice),
      minimumPrice: decimal(agreedPrice),
      actualViewsFinal: 0,
      scheduledAt: new Date('2026-07-15T12:00:00.000Z'),
      currency,
      lastDeletionError: null,
      paymentAllocations,
      sale: { createdAt: new Date('2026-07-15T12:00:00.000Z') },
    });

    const previousRevenue = [decimal(70), decimal(30)].reduce(
      (sum, value) => sum.add(value),
      decimal(0),
    );
    const result = buildAdSalesAnalyticsSummary({
      dataset: {
        placements: [
          placement('placement-1', 200, 'USD', [
            {
              amount: decimal(100),
              payment: { status: TelegramAdSalePaymentStatus.ACTIVE },
            },
            {
              amount: decimal(20),
              payment: { status: TelegramAdSalePaymentStatus.VOIDED },
            },
          ]),
        ],
        channels: [{ id: 'channel-1', title: 'One' }],
      } as never,
      previousRevenue,
      nextSevenDays: [],
      from,
      to,
      timezone: 'UTC',
      now: new Date('2026-08-01T00:00:00.000Z'),
    });

    expect(result).toMatchObject({
      currency: 'USD',
      revenueThisMonth: '200',
      revenuePreviousMonth: '100',
      monthOverMonthChangePercent: 100,
      paidRevenue: '100',
      accountsReceivable: '100',
    });
  });
});
