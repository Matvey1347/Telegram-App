import {
  Prisma,
  TelegramAdPlacementStatus,
  TelegramAdSalePaymentStatus,
  TelegramAdSaleStatus,
  TelegramAdSlotStrategy,
} from '@prisma/client';
import { TelegramAdSalesAvailabilityReader } from './telegram-ad-sales-availability-reader';

describe('TelegramAdSalesAvailabilityReader sale summaries', () => {
  it('loads sale/payment summaries once and exposes computed statuses on placements', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-08-01T00:00:00.000Z'));
    const placement = {
      id: 'placement-1',
      telegramAdSaleId: 'sale-1',
      telegramChannelId: 'channel-1',
      status: TelegramAdPlacementStatus.SCHEDULED,
      scheduledAt: new Date('2026-08-02T12:00:00.000Z'),
      inventoryOpportunityKey: null,
      agreedPrice: new Prisma.Decimal(100),
      currency: 'USD',
      actualViewsFinal: null,
      actualViews48h: null,
      actualViews24h: null,
      managedPost: null,
      telegramPost: null,
    };
    type SaleQuery = {
      where: { workspaceId: string; id: { in: string[] } };
      select: Record<string, unknown>;
    };
    let saleQuery: SaleQuery | undefined;
    const findSales = jest.fn((query: SaleQuery) => {
      saleQuery = query;
      return Promise.resolve([
        {
          id: 'sale-1',
          title: 'Campaign',
          advertiserName: 'Buyer',
          advertiserNameSnapshot: 'Buyer',
          status: TelegramAdSaleStatus.CONFIRMED,
          placements: [{ agreedPrice: new Prisma.Decimal(100) }],
          payments: [
            {
              amount: new Prisma.Decimal(40),
              status: TelegramAdSalePaymentStatus.ACTIVE,
            },
          ],
        },
      ]);
    });
    const prisma = {
      telegramChannel: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'channel-1',
            adBaseCurrency: 'USD',
            timePosts: [{ time: '12:00' }],
          },
        ]),
      },
      workspace: {
        findUniqueOrThrow: jest.fn().mockResolvedValue({ timezone: 'UTC' }),
      },
      telegramAdSalesWorkspaceSettings: {
        findUnique: jest
          .fn()
          .mockResolvedValue({ defaultOrganicPostsPerAdSlot: 1 }),
      },
      telegramAdSchedulePolicy: {
        findMany: jest.fn().mockResolvedValue([
          {
            telegramChannelId: 'channel-1',
            timezone: 'UTC',
            expectedOrganicPostsPerDay: null,
            useWorkspaceDefault: false,
            organicPostsPerAdSlot: 1,
            maxAdsPerDay: 3,
            slotStrategy: TelegramAdSlotStrategy.BEFORE_ORGANIC_POST,
          },
        ]),
      },
      telegramAdProduct: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'product-1',
            telegramChannelId: 'channel-1',
            isActive: true,
            topDurationMinutes: 60,
            currency: 'USD',
            position: 0,
            createdAt: new Date(),
          },
        ]),
        createMany: jest.fn(),
      },
      telegramAdSalePlacement: {
        findMany: jest.fn().mockResolvedValue([placement]),
      },
      telegramAdSale: {
        findMany: findSales,
      },
      telegramPost: { findMany: jest.fn().mockResolvedValue([]) },
      telegramManagedPost: { findMany: jest.fn().mockResolvedValue([]) },
    };
    const pricingReader = {
      sourcesForChannels: jest.fn().mockResolvedValue(
        new Map([
          [
            'channel-1',
            {
              channel: { id: 'channel-1' },
              posts: [],
              evaluatedAt: new Date(),
            },
          ],
        ]),
      ),
      previewFromSource: jest.fn().mockReturnValue({
        expectedViews: 1_000,
        recommendedPrice: '100',
        minimumPrice: '80',
        currency: 'USD',
      }),
    };
    const reader = new TelegramAdSalesAvailabilityReader(
      prisma as never,
      pricingReader as never,
      jest.fn().mockResolvedValue(undefined),
    );

    const result = await reader.read(
      'ws-1',
      {
        from: '2026-08-02T00:00:00.000Z',
        to: '2026-08-02T23:59:59.000Z',
        channelIds: ['channel-1'],
      },
      ['channel-1'],
    );

    expect(result.slots[0].existingPlacement).toEqual(
      expect.objectContaining({
        saleStatus: TelegramAdSaleStatus.CONFIRMED,
        paymentStatus: 'PARTIALLY_PAID',
      }),
    );
    expect(prisma.telegramAdSale.findMany).toHaveBeenCalledTimes(1);
    if (!saleQuery) throw new Error('Expected sale summary query');
    expect(saleQuery.where).toEqual({
      workspaceId: 'ws-1',
      id: { in: ['sale-1'] },
    });
    expect(saleQuery.select).toHaveProperty('placements');
    expect(saleQuery.select).toHaveProperty('payments');
    jest.useRealTimers();
  });
});
