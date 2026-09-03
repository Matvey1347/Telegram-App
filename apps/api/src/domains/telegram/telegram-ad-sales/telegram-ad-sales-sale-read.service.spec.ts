import {
  Prisma,
  TelegramAdCrmDealStage,
  TelegramAdPlacementStatus,
  TelegramAdPricingMode,
  TelegramAdSaleOrigin,
  TelegramAdSalePaymentStatus,
  TelegramAdSaleStatus,
} from '@prisma/client';
import { TelegramAdSalesSaleReadService } from './telegram-ad-sales-sale-read.service';

const decimal = (value: string | number) => new Prisma.Decimal(value);

describe('TelegramAdSalesSaleReadService', () => {
  it('returns compact rows with batched payment summaries and no payment or advertiser histories', async () => {
    type SaleListQuery = {
      where: { workspaceId: string };
      select: Record<string, unknown>;
    };
    let listQuery: SaleListQuery | undefined;
    const sale = {
      id: 'sale-1',
      workspaceId: 'ws-1',
      advertiserId: 'advertiser-1',
      advertiserName: 'Buyer',
      advertiserTelegram: '@buyer',
      advertiserContact: null,
      advertiserNameSnapshot: 'Buyer',
      advertiserTelegramSnapshot: '@buyer',
      advertiserCompanySnapshot: null,
      title: 'Campaign',
      notes: null,
      status: TelegramAdSaleStatus.CONFIRMED,
      origin: TelegramAdSaleOrigin.DIRECT,
      crmDealStage: TelegramAdCrmDealStage.PAID,
      expectedCloseAt: null,
      lostReason: null,
      nextActionAt: null,
      settlementCurrency: 'USD',
      reservedUntil: null,
      financeSkipped: false,
      sourceTaskId: null,
      sourceAdvertiserActivityId: null,
      createdByUserId: 'user-1',
      assignedMemberId: null,
      createdAt: new Date('2026-08-01T00:00:00.000Z'),
      updatedAt: new Date('2026-08-02T00:00:00.000Z'),
      assignedMember: null,
      advertiser: {
        displayName: 'Current buyer',
        telegramUsername: 'current_buyer',
      },
      placements: [
        {
          id: 'placement-1',
          workspaceId: 'ws-1',
          telegramAdSaleId: 'sale-1',
          telegramChannelId: 'channel-1',
          telegramChannelNetworkId: null,
          telegramAdProductId: null,
          inventoryOpportunityKey: null,
          pricingSnapshotId: null,
          status: TelegramAdPlacementStatus.SCHEDULED,
          scheduledAt: new Date('2026-08-10T10:00:00.000Z'),
          timezone: 'UTC',
          pricingMode: TelegramAdPricingMode.CPM,
          expectedViews: 1_000,
          quotedCpm: decimal(100),
          recommendedPrice: decimal(100),
          minimumPrice: decimal(80),
          agreedPrice: decimal(100),
          currency: 'USD',
          scheduledManagedAt: null,
          topDurationMinutesSnapshot: 60,
          feedDurationHoursSnapshot: 24,
          deleteAfterHoursSnapshot: 24,
          isPermanentSnapshot: false,
          manualPriceReason: null,
          managedPostId: 'managed-1',
          telegramPostId: null,
          publishedAt: null,
          plannedDeleteAt: null,
          deletedAt: null,
          lastDeletionAttemptAt: null,
          lastDeletionError: null,
          actualViews24h: null,
          actualViews48h: null,
          actualViewsFinal: null,
          actualReactionsFinal: null,
          actualCpm: null,
          completedAt: null,
          createdAt: new Date('2026-08-01T00:00:00.000Z'),
          updatedAt: new Date('2026-08-02T00:00:00.000Z'),
          telegramChannel: { telegramChatId: '-100123' },
          managedPost: {
            status: 'FAILED',
            publishedAt: new Date('2026-08-10T10:05:00.000Z'),
            lastError: 'Production bot cannot post',
            telegramMessageIds: [],
            telegramMessageUrls: ['https://t.me/channel/1'],
            telegramRemoteStatus: 'PUBLISHED',
          },
          telegramPost: null,
          paymentAllocations: [
            {
              amount: decimal(40),
              payment: { status: TelegramAdSalePaymentStatus.ACTIVE },
            },
          ],
        },
      ],
    };
    const findSales = jest.fn((query: SaleListQuery) => {
      listQuery = query;
      return Promise.resolve([sale]);
    });
    const prisma = {
      telegramAdvertiser: { findFirst: jest.fn() },
      telegramAdSale: {
        findMany: findSales,
        count: jest.fn().mockResolvedValue(1),
      },
      telegramAdSalePayment: {
        findMany: jest.fn().mockResolvedValue([
          {
            telegramAdSaleId: 'sale-1',
            amount: decimal(40),
            amountInPrimaryCurrency: decimal(40),
            status: TelegramAdSalePaymentStatus.ACTIVE,
          },
          {
            telegramAdSaleId: 'sale-1',
            amount: decimal(20),
            amountInPrimaryCurrency: decimal(20),
            status: TelegramAdSalePaymentStatus.VOIDED,
          },
        ]),
      },
      telegramPost: { findMany: jest.fn() },
      $transaction: jest.fn((operations: Array<Promise<unknown>>) =>
        Promise.all(operations),
      ),
    };
    const workspaceService = {
      resolveWorkspaceIdForUser: jest.fn().mockResolvedValue('ws-1'),
    };
    const service = new TelegramAdSalesSaleReadService(
      prisma as never,
      workspaceService as never,
    );

    const result = await service.listSales('user-1', {
      page: 1,
      pageSize: 25,
    });

    expect(result.items[0]).toEqual(
      expect.objectContaining({
        placementsCount: 1,
        totalAgreedAmount: '100',
        totalPaidAmount: '40',
        outstandingAmount: '60',
        paymentStatus: 'PARTIALLY_PAID',
        advertiserSummary: {
          displayName: 'Current buyer',
          telegramUsername: 'current_buyer',
        },
      }),
    );
    expect(result.items[0]).not.toHaveProperty('payments');
    expect(result.items[0]).not.toHaveProperty('advertiser');
    expect(result.items[0].placements[0]).toEqual(
      expect.objectContaining({
        agreedPrice: '100',
        managedPost: {
          status: 'FAILED',
          lastError: 'Production bot cannot post',
          telegramMessageIds: [],
          telegramMessageUrls: ['https://t.me/channel/1'],
          telegramRemoteStatus: 'PUBLISHED',
        },
        paidAllocatedAmount: '40',
        unpaidAmount: '60',
        publishedAt: '2026-08-10T10:05:00.000Z',
      }),
    );
    if (!listQuery) throw new Error('Expected compact sale list query');
    expect(listQuery.where).toEqual({ workspaceId: 'ws-1' });
    expect(listQuery.select).not.toHaveProperty('payments');
    expect(listQuery.select.advertiser).toEqual({
      select: { displayName: true, telegramUsername: true },
    });
    expect(workspaceService.resolveWorkspaceIdForUser).toHaveBeenCalledTimes(1);
    expect(prisma.telegramAdSale.findMany).toHaveBeenCalledTimes(1);
    expect(prisma.telegramAdSale.count).toHaveBeenCalledTimes(1);
    expect(prisma.telegramAdSalePayment.findMany).toHaveBeenCalledTimes(1);
    expect(prisma.telegramPost.findMany).not.toHaveBeenCalled();
  });

  it('keeps advertiser lookup and sale filtering inside the authorized workspace', async () => {
    let workspaceId: string | undefined;
    const findSales = jest.fn((query: { where: { workspaceId: string } }) => {
      workspaceId = query.where.workspaceId;
      return Promise.resolve([]);
    });
    const prisma = {
      telegramAdvertiser: {
        findFirst: jest
          .fn()
          .mockResolvedValue({ telegramUsername: '@LegacyBuyer' }),
      },
      telegramAdSale: {
        findMany: findSales,
        count: jest.fn().mockResolvedValue(0),
      },
      telegramAdSalePayment: { findMany: jest.fn() },
      telegramPost: { findMany: jest.fn() },
      $transaction: jest.fn((operations: Array<Promise<unknown>>) =>
        Promise.all(operations),
      ),
    };
    const service = new TelegramAdSalesSaleReadService(
      prisma as never,
      {
        resolveWorkspaceIdForUser: jest.fn().mockResolvedValue('ws-1'),
      } as never,
    );

    await service.listSales('user-1', { advertiserId: 'advertiser-1' });

    expect(prisma.telegramAdvertiser.findFirst).toHaveBeenCalledWith({
      where: { id: 'advertiser-1', workspaceId: 'ws-1' },
      select: { telegramUsername: true },
    });
    expect(workspaceId).toBe('ws-1');
  });

  it('sends search and page offsets to the server and reuses the predicate for count', async () => {
    let findWhere: unknown;
    let countWhere: unknown;
    const prisma = {
      telegramAdvertiser: { findFirst: jest.fn() },
      telegramAdSale: {
        findMany: jest.fn((query: { where: unknown }) => {
          findWhere = query.where;
          return Promise.resolve([]);
        }),
        count: jest.fn((query: { where: unknown }) => {
          countWhere = query.where;
          return Promise.resolve(21);
        }),
      },
      telegramAdSalePayment: { findMany: jest.fn() },
      telegramPost: { findMany: jest.fn() },
      $transaction: jest.fn((operations: Array<Promise<unknown>>) =>
        Promise.all(operations),
      ),
    };
    const service = new TelegramAdSalesSaleReadService(
      prisma as never,
      {
        resolveWorkspaceIdForUser: jest.fn().mockResolvedValue('ws-1'),
      } as never,
    );

    const result = await service.listSales('user-1', {
      page: 3,
      pageSize: 10,
      search: 'channel beyond page one',
    });

    expect(prisma.telegramAdSale.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ skip: 20, take: 10 }),
    );
    expect(findWhere).toBe(countWhere);
    expect(JSON.stringify(findWhere)).toContain('"workspaceId":"ws-1"');
    expect(JSON.stringify(findWhere)).toContain('"placements"');
    expect(JSON.stringify(findWhere)).toContain('"telegramChannel"');
    expect(result.pagination).toEqual(
      expect.objectContaining({ page: 3, totalItems: 21 }),
    );
  });
});
