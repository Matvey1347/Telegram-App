import { BadRequestException, NotFoundException } from '@nestjs/common';
import {
  Prisma,
  TelegramAdPlacementStatus,
  TelegramAdPricingMode,
  TelegramAdSaleOrigin,
  TelegramAdSalePaymentStatus,
  TelegramAdSaleStatus,
  TelegramAdvertiserLifecycleStage,
  TelegramAdvertiserStatus,
  TelegramCrmContactStage,
  TelegramAdvertiserTaskPriority,
  TelegramAdvertiserTaskStatus,
  TelegramManagedPostStatus,
  TransactionType,
} from '@prisma/client';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import {
  CreateTelegramAdSaleDto,
  TelegramAdAlertsQueryDto,
  TelegramAdAnalyticsQueryDto,
  TelegramAdAnalyticsSeriesQueryDto,
} from './dto';
import { TelegramAdSalesService } from './telegram-ad-sales.service';
import { scheduledTaskWakeNotifier } from '../../../common/scheduled-task-wake-notifier';

const decimal = (value: number | string) => new Prisma.Decimal(value);

type PricingSourceFixtureRow = {
  id: string;
  telegramChannelId: string;
  postDate: Date;
  viewsCount: number | null;
  manualOwnViews: number;
  excludeFromAnalytics: boolean;
  adPlacementLinked: boolean;
  metricSnapshotId: string | null;
  metricSnapshotViewsCount: number | null;
  metricSnapshotCollectedAt: Date | null;
};

function pricingSourceRows(
  posts: Array<{
    id: string;
    telegramChannelId: string;
    postDate: Date;
    viewsCount: number | null;
    manualOwnViews?: number | null;
    excludeFromAnalytics: boolean;
    adSalePlacements: Array<{ id: string }>;
    metricSnapshots: Array<{ viewsCount: number | null; collectedAt: Date }>;
  }>,
): PricingSourceFixtureRow[] {
  return posts.flatMap<PricingSourceFixtureRow>((post) => {
    const base = {
      id: post.id,
      telegramChannelId: post.telegramChannelId,
      postDate: post.postDate,
      viewsCount: post.viewsCount,
      manualOwnViews: post.manualOwnViews ?? 0,
      excludeFromAnalytics: post.excludeFromAnalytics,
      adPlacementLinked: post.adSalePlacements.length > 0,
    };
    return post.metricSnapshots.length
      ? post.metricSnapshots.map((snapshot, index) => ({
          ...base,
          metricSnapshotId: `${post.id}-snapshot-${index + 1}`,
          metricSnapshotViewsCount: snapshot.viewsCount,
          metricSnapshotCollectedAt: snapshot.collectedAt,
        }))
      : [
          {
            ...base,
            metricSnapshotId: null,
            metricSnapshotViewsCount: null,
            metricSnapshotCollectedAt: null,
          },
        ];
  });
}

function makePlacement(overrides: Record<string, unknown> = {}) {
  return {
    id: 'placement-1',
    workspaceId: 'ws-1',
    telegramAdSaleId: 'sale-1',
    telegramChannelId: 'channel-1',
    telegramChannelNetworkId: null,
    pricingSnapshotId: null,
    telegramAdProductId: null,
    status: TelegramAdPlacementStatus.DRAFT,
    scheduledAt: new Date('2026-08-02T10:00:00.000Z'),
    timezone: 'UTC',
    pricingMode: TelegramAdPricingMode.CPM,
    expectedViews: 1000,
    quotedCpm: null,
    recommendedPrice: decimal(150),
    minimumPrice: decimal(120),
    agreedPrice: decimal(150),
    currency: 'USD',
    scheduledManagedAt: null,
    topDurationMinutesSnapshot: null,
    feedDurationHoursSnapshot: null,
    deleteAfterHoursSnapshot: 24,
    isPermanentSnapshot: false,
    manualPriceReason: null,
    managedPostId: null,
    telegramPostId: null,
    publishedAt: null,
    plannedDeleteAt: null,
    deletedAt: null,
    lastDeletionAttemptAt: null,
    lastDeletionError: null,
    actualViews24h: null,
    actualViews48h: null,
    actualViewsFinal: null,
    actualCpm: null,
    completedAt: null,
    createdAt: new Date('2026-07-31T00:00:00.000Z'),
    updatedAt: new Date('2026-07-31T00:00:00.000Z'),
    paymentAllocations: [],
    managedPost: null,
    telegramPost: null,
    ...overrides,
  };
}

function makeSale(overrides: Record<string, unknown> = {}) {
  return {
    id: 'sale-1',
    workspaceId: 'ws-1',
    advertiserName: 'Advertiser',
    advertiserTelegram: null,
    advertiserContact: null,
    title: 'Sale',
    notes: null,
    status: TelegramAdSaleStatus.DRAFT,
    settlementCurrency: 'USD',
    reservedUntil: null,
    createdByUserId: 'user-1',
    assignedMemberId: 'member-1',
    createdAt: new Date('2026-07-31T00:00:00.000Z'),
    updatedAt: new Date('2026-07-31T00:00:00.000Z'),
    placements: [makePlacement()],
    payments: [],
    ...overrides,
  };
}

function makePayment(overrides: Record<string, unknown> = {}) {
  return {
    id: 'payment-1',
    workspaceId: 'ws-1',
    telegramAdSaleId: 'sale-1',
    accountId: 'account-1',
    transactionId: 'tx-1',
    amount: decimal(120),
    currency: 'USD',
    amountInPrimaryCurrency: decimal(120),
    exchangeRateToPrimary: decimal(1),
    paidAt: new Date('2026-08-01T09:00:00.000Z'),
    notes: 'First tranche',
    status: TelegramAdSalePaymentStatus.ACTIVE,
    idempotencyKey: 'idem-1',
    reversalTransactionId: null,
    voidedAt: null,
    voidReason: null,
    createdByUserId: 'user-1',
    createdAt: new Date('2026-08-01T09:00:00.000Z'),
    updatedAt: new Date('2026-08-01T09:00:00.000Z'),
    allocations: [
      {
        id: 'allocation-1',
        workspaceId: 'ws-1',
        telegramAdSalePaymentId: 'payment-1',
        telegramAdSalePlacementId: 'placement-1',
        amount: decimal(120),
        currency: 'USD',
        amountInPrimaryCurrency: decimal(120),
        createdAt: new Date('2026-08-01T09:00:00.000Z'),
        payment: null,
      },
    ],
    account: {
      id: 'account-1',
      name: 'Main account',
      currency: 'USD',
    },
    transaction: {
      id: 'tx-1',
      date: new Date('2026-08-01T09:00:00.000Z'),
      amount: decimal(120),
      type: TransactionType.income,
      category: 'Channel Advertising Revenue',
    },
    reversalTransaction: null,
    ...overrides,
  };
}

function createService() {
  const prisma: any = {
    workspace: { findUnique: jest.fn(), findUniqueOrThrow: jest.fn() },
    account: { findFirst: jest.fn() },
    transactionCategory: { findFirst: jest.fn() },
    transaction: { create: jest.fn(), deleteMany: jest.fn() },
    telegramManagedPost: {
      findFirst: jest.fn(),
      findMany: jest.fn().mockResolvedValue([]),
      update: jest.fn(),
      deleteMany: jest.fn(),
    },
    telegramPostMetricSnapshot: { findMany: jest.fn() },
    telegramChannel: {
      findFirst: jest.fn(),
      findMany: jest.fn().mockResolvedValue([]),
    },
    telegramChannelNetwork: { findFirst: jest.fn() },
    telegramAdSale: {
      findFirst: jest.fn(),
      findMany: jest.fn().mockResolvedValue([]),
      count: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
      findUniqueOrThrow: jest.fn(),
    },
    telegramAdProduct: {
      findFirst: jest.fn(),
      create: jest.fn(),
      createMany: jest.fn(),
      update: jest.fn(),
      findMany: jest.fn().mockResolvedValue([]),
      count: jest.fn(),
    },
    telegramAdSchedulePolicy: {
      findFirst: jest.fn(),
      upsert: jest.fn(),
      findMany: jest.fn(),
    },
    telegramAdInventoryDailySnapshot: {
      findFirst: jest.fn(),
      findMany: jest.fn().mockResolvedValue([]),
      count: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    telegramAdSalesWorkspaceSettings: {
      findUnique: jest.fn(),
      upsert: jest.fn(),
    },
    telegramAdCrmWorkspaceSettings: {
      findUnique: jest.fn(),
      create: jest.fn(),
      upsert: jest.fn(),
    },
    telegramAdvertiser: {
      findFirst: jest.fn(),
      findMany: jest.fn().mockResolvedValue([]),
      count: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    telegramAdvertiserContact: {
      findFirst: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
      deleteMany: jest.fn(),
    },
    telegramAdvertiserActivity: {
      create: jest.fn(),
      findMany: jest.fn().mockResolvedValue([]),
      count: jest.fn(),
    },
    telegramAdvertiserTask: {
      findFirst: jest.fn(),
      findMany: jest.fn().mockResolvedValue([]),
      count: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    telegramAdPriceSnapshot: {
      create: jest.fn(),
      findFirst: jest.fn(),
      findMany: jest.fn().mockResolvedValue([]),
    },
    telegramAdSalePlacement: {
      findFirst: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
      findMany: jest.fn().mockResolvedValue([]),
      findUniqueOrThrow: jest.fn(),
      aggregate: jest.fn().mockResolvedValue({
        _sum: { agreedPrice: decimal(0) },
      }),
    },
    telegramAdSalePayment: {
      findFirst: jest.fn(),
      findMany: jest.fn().mockResolvedValue([]),
      create: jest.fn(),
      update: jest.fn(),
    },
    telegramPost: {
      findMany: jest.fn().mockResolvedValue([]),
      count: jest.fn(),
      findFirst: jest.fn(),
      deleteMany: jest.fn(),
    },
    telegramBotRuntimeInstance: { findFirst: jest.fn() },
    telegramUserAccountIntegration: { findFirst: jest.fn() },
    telegramChannelAudienceSnapshot: { findFirst: jest.fn() },
    $queryRaw: jest.fn().mockResolvedValue([]),
    $transaction: jest.fn(async (operation: any) =>
      typeof operation === 'function'
        ? operation(prisma)
        : Promise.all(operation),
    ),
  };
  prisma.telegramAdSchedulePolicy.findMany.mockImplementation(async () => {
    const policy = await prisma.telegramAdSchedulePolicy.findFirst();
    return policy ? [policy] : [];
  });
  const workspaceService: any = {
    resolveWorkspaceIdForUser: jest.fn().mockResolvedValue('ws-1'),
    resolveAssignedMemberId: jest.fn().mockResolvedValue({
      workspaceId: 'ws-1',
      assignedMemberId: 'member-1',
    }),
  };
  prisma.workspace.findUniqueOrThrow.mockResolvedValue({ timezone: 'UTC' });
  prisma.telegramAdSalesWorkspaceSettings.upsert.mockResolvedValue({
    workspaceId: 'ws-1',
    defaultOrganicPostsPerAdSlot: 3,
    createdAt: new Date('2026-08-01T00:00:00.000Z'),
    updatedAt: new Date('2026-08-01T00:00:00.000Z'),
  });
  prisma.telegramAdSalesWorkspaceSettings.findUnique.mockResolvedValue({
    workspaceId: 'ws-1',
    defaultOrganicPostsPerAdSlot: 3,
    createdAt: new Date('2026-08-01T00:00:00.000Z'),
    updatedAt: new Date('2026-08-01T00:00:00.000Z'),
  });
  const logger: any = { info: jest.fn() };
  const responseCache: any = {
    getOrSet: jest.fn(
      async (_key: string, _ttlMs: number, load: () => Promise<unknown>) =>
        load(),
    ),
    clearByPrefix: jest.fn(),
  };
  const currencyConversionService: any = {
    getRate: jest.fn().mockResolvedValue(1),
    convertCurrency: jest.fn(),
  };
  const financeCategoriesService: any = {
    ensureSystemCategories: jest.fn().mockResolvedValue(undefined),
  };
  const telegramChannelsService: any = {
    createManagedPost: jest.fn(),
    scheduleManagedPost: jest.fn(),
    publishManagedPostNow: jest.fn(),
    cancelScheduledManagedPost: jest.fn(),
    returnManagedPostToDraft: jest.fn(),
    syncManagedPosts: jest.fn(),
  };
  const telegramPostGroupsService: any = {
    ensureAdvertiseSystemGroup: jest
      .fn()
      .mockResolvedValue({ id: 'advertise-group-1' }),
    addPostsToGroup: jest.fn(),
  };
  const mtprotoClient: any = { deletePublishedMessages: jest.fn() };
  const sourceAccessService: any = { sourcesForChannel: jest.fn() };
  const encryptionService: any = { decrypt: jest.fn() };
  const telegramChannelAccessService: any = {
    botTokenForSource: jest.fn(),
    checkInlineButtonPublishingAccess: jest.fn(),
    checkProductionBotPublishingAccess: jest.fn(),
  };
  const telegramBotApiClient: any = { deleteMessage: jest.fn() };
  const notificationProjector: any = {
    placementMissed: jest.fn().mockResolvedValue([{ id: 'notification-1' }]),
    contactVisibilityChanged: jest.fn().mockResolvedValue([]),
    invalidateVisibility: jest.fn(),
    publish: jest.fn(),
  };
  const service = new TelegramAdSalesService(
    prisma,
    workspaceService,
    logger,
    responseCache,
    currencyConversionService,
    financeCategoriesService,
    telegramChannelsService,
    telegramPostGroupsService,
    telegramChannelsService,
    telegramChannelsService,
    mtprotoClient,
    sourceAccessService,
    encryptionService,
    telegramChannelAccessService,
    telegramBotApiClient,
    notificationProjector,
  );
  return {
    service,
    prisma,
    workspaceService,
    logger,
    responseCache,
    currencyConversionService,
    financeCategoriesService,
    telegramChannelsService,
    telegramPostGroupsService,
    sourceAccessService,
    telegramChannelAccessService,
    telegramBotApiClient,
    mtprotoClient,
    encryptionService,
    notificationProjector,
  };
}

function mockPricingPreview(
  service: TelegramAdSalesService,
  overrides: Record<string, unknown> = {},
) {
  return jest
    .spyOn((service as any).pricingReader, 'previewFromSource')
    .mockReturnValue({
      expectedViews: 1500,
      averageViews: null,
      medianViews: null,
      adjustedViews: null,
      postsSampleCount: 0,
      dataQuality: 'READY',
      warnings: [],
      fallbackSource: 'POSTS',
      methodVersion: 'test',
      sample: [],
      pricingWindowHours: null,
      pricingWindowLabel: 'Post',
      currency: 'USD',
      recommendedPrice: '18',
      minimumPrice: '18',
      targetCpm: '12',
      ...overrides,
    });
}

describe('TelegramAdSalesService', () => {
  it('keeps Telegram identity and active Deal projections in advertiser search', async () => {
    const { service, prisma } = createService();
    prisma.telegramAdvertiser.findMany.mockResolvedValue([
      {
        id: 'contact-1',
        displayName: 'Peer Contact',
        stage: TelegramCrmContactStage.LEAD,
        crmPeers: [{ telegramUserId: '778899' }],
        _count: { sales: 1 },
        contacts: [],
        totalRevenueInPrimaryCurrency: decimal(0),
        averageOrderValueInPrimaryCurrency: decimal(0),
        createdAt: new Date('2026-08-01T00:00:00.000Z'),
        updatedAt: new Date('2026-08-02T00:00:00.000Z'),
      },
    ]);

    const result = await service.advertiserSearch('user-1', {
      q: 'Peer',
      limit: 10,
    });

    expect(prisma.telegramAdvertiser.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        include: expect.objectContaining({
          crmPeers: expect.any(Object),
          _count: expect.any(Object),
        }),
      }),
    );
    expect(result[0]).toEqual(
      expect.objectContaining({
        telegramUserId: '778899',
        status: TelegramAdvertiserStatus.ACTIVE,
      }),
    );
  });

  it('hydrates sale-list metrics from the managed post Telegram message', async () => {
    const { service, prisma } = createService();
    const sale = makeSale({
      assignedMember: null,
      placements: [
        makePlacement({
          managedPost: { telegramMessageIds: ['42'] },
          telegramPost: null,
        }),
      ],
    });
    prisma.$transaction.mockResolvedValue([[sale], 1]);
    prisma.telegramPost.findMany.mockResolvedValue([
      {
        id: 'telegram-post-42',
        telegramChannelId: 'channel-1',
        telegramMessageId: '42',
        viewsCount: 1,
        forwardsCount: 0,
        reactionsCount: 0,
        commentsCount: 0,
        postDate: new Date('2026-08-27T09:31:00.000Z'),
      },
    ]);

    const result = await service.listSales('user-1', {
      page: 1,
      pageSize: 25,
    });

    expect(result.items[0].placements[0].telegramPost).toEqual(
      expect.objectContaining({ viewsCount: 1 }),
    );
    expect(prisma.telegramPost.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          workspaceId: 'ws-1',
          OR: [{ telegramChannelId: 'channel-1', telegramMessageId: '42' }],
        }),
      }),
    );
  });

  it('includes unlinked legacy sales with the client Telegram username in the client order list', async () => {
    const { service, prisma } = createService();
    prisma.telegramAdvertiser.findFirst.mockResolvedValue({
      telegramUsername: 'Artur_Pikhulia',
    });
    prisma.$transaction.mockResolvedValue([[], 0]);

    await service.listSales('user-1', {
      page: 1,
      pageSize: 25,
      advertiserId: 'advertiser-1',
    });

    expect(prisma.telegramAdSale.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          workspaceId: 'ws-1',
          OR: [
            { advertiserId: 'advertiser-1' },
            {
              advertiserId: null,
              advertiserTelegram: {
                in: ['artur_pikhulia', '@artur_pikhulia'],
                mode: 'insensitive',
              },
            },
            {
              advertiserId: null,
              advertiserTelegramSnapshot: {
                in: ['artur_pikhulia', '@artur_pikhulia'],
                mode: 'insensitive',
              },
            },
          ],
        },
      }),
    );
  });

  it('hydrates deal-detail metrics from the same managed post as the sale list', async () => {
    const { service, prisma } = createService();
    prisma.telegramAdSale.findFirst.mockResolvedValue(
      makeSale({
        assignedMember: null,
        placements: [
          makePlacement({
            managedPost: { telegramMessageIds: ['42'] },
            telegramPost: null,
          }),
        ],
      }),
    );
    prisma.telegramPost.findMany.mockResolvedValue([
      {
        id: 'wrong-channel-post-42',
        telegramChannelId: 'channel-2',
        telegramMessageId: '42',
        viewsCount: 879,
        forwardsCount: 14,
        reactionsCount: 20,
        commentsCount: 0,
        postDate: new Date('2026-08-27T09:31:00.000Z'),
      },
      {
        id: 'telegram-post-42',
        telegramChannelId: 'channel-1',
        telegramMessageId: '42',
        viewsCount: 1,
        forwardsCount: 0,
        reactionsCount: 0,
        commentsCount: 0,
        postDate: new Date('2026-08-27T09:31:00.000Z'),
      },
    ]);

    const result = await service.getSale('user-1', 'sale-1');

    expect(result.placements[0].telegramPost).toEqual(
      expect.objectContaining({
        viewsCount: 1,
        reactionsCount: 0,
        commentsCount: 0,
        forwardsCount: 0,
      }),
    );
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  it('persists and returns the selected sale origin', async () => {
    const { service, prisma } = createService();
    prisma.telegramAdSale.create.mockImplementation(({ data }: any) =>
      Promise.resolve(
        makeSale({
          ...data,
          advertiserId: null,
          origin: TelegramAdSaleOrigin.ADSELL_IO,
          placements: [],
        }),
      ),
    );

    const sale = await service.createSale('user-1', {
      advertiserId: null,
      advertiserName: 'Exchange advertiser',
      settlementCurrency: 'USD',
      origin: TelegramAdSaleOrigin.ADSELL_IO,
    });

    expect(prisma.telegramAdSale.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          origin: TelegramAdSaleOrigin.ADSELL_IO,
        }),
      }),
    );
    expect(sale.origin).toBe(TelegramAdSaleOrigin.ADSELL_IO);
  });

  it('replaces stale buyer snapshots when a deal buyer is edited', async () => {
    const { service, prisma } = createService();
    const existing = makeSale({
      advertiserId: 'advertiser-old',
      advertiser: { id: 'advertiser-old', displayName: 'Old buyer' },
      advertiserName: 'Old buyer',
      advertiserNameSnapshot: 'Old buyer',
      advertiserTelegram: '@old_buyer',
      advertiserTelegramSnapshot: '@old_buyer',
    });
    prisma.telegramAdSale.findFirst.mockResolvedValue(existing);
    prisma.telegramAdSale.update.mockImplementation(({ data }: any) =>
      Promise.resolve(makeSale({ ...existing, ...data, advertiser: null })),
    );

    await service.updateSale('user-1', 'sale-1', {
      advertiserId: null,
      advertiserName: 'new_buyer',
      advertiserContact: '@new_buyer',
      advertiserTelegram: '@new_buyer',
    });

    expect(prisma.telegramAdSale.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          advertiserId: null,
          advertiserNameSnapshot: 'new_buyer',
          advertiserTelegramSnapshot: '@new_buyer',
        }),
      }),
    );
  });

  it.each(['dedicated endpoint', 'generic PATCH'] as const)(
    '%s cancellation does not invoke Telegram delivery',
    async (path) => {
      const { service, prisma, mtprotoClient, telegramBotApiClient } =
        createService();
      const existing = makeSale({
        status: TelegramAdSaleStatus.DRAFT,
        payments: [],
      });
      prisma.telegramAdSale.findFirst.mockResolvedValue(existing);
      prisma.telegramAdSale.findUniqueOrThrow.mockResolvedValue(
        makeSale({
          ...existing,
          status: TelegramAdSaleStatus.CANCELLED,
          placements: existing.placements.map((placement: any) => ({
            ...placement,
            status: TelegramAdPlacementStatus.CANCELLED,
          })),
        }),
      );

      if (path === 'generic PATCH') {
        await service.updateSale('user-1', 'sale-1', {
          status: TelegramAdSaleStatus.CANCELLED,
        });
      } else {
        await service.cancelSale('user-1', 'sale-1');
      }

      expect(mtprotoClient.deletePublishedMessages).not.toHaveBeenCalled();
      expect(telegramBotApiClient.deleteMessage).not.toHaveBeenCalled();
    },
  );

  it('deletes the sale and all linked local finance and post records', async () => {
    const { service, prisma } = createService();
    prisma.telegramAdSale.findFirst.mockResolvedValue(
      makeSale({
        advertiserId: null,
        payments: [
          makePayment({
            transaction: { id: 'tx-1' },
            reversalTransaction: { id: 'tx-reversal-1' },
          }),
        ],
        placements: [
          makePlacement({
            publishedAt: null,
            managedPost: { id: 'managed-post-1', telegramMessageIds: [] },
            telegramPost: { id: 'telegram-post-1', telegramMessageId: '42' },
          }),
        ],
      }),
    );
    prisma.telegramAdSale.delete.mockResolvedValue({ id: 'sale-1' });

    await expect(service.deleteSale('user-1', 'sale-1')).resolves.toEqual({
      id: 'sale-1',
      channelIds: ['channel-1'],
    });
    expect(prisma.telegramAdSale.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ id: 'sale-1', workspaceId: 'ws-1' }),
      }),
    );
    expect(prisma.telegramAdSale.delete).toHaveBeenCalledWith({
      where: { id: 'sale-1', workspaceId: 'ws-1' },
    });
    expect(prisma.transaction.deleteMany).toHaveBeenCalledWith({
      where: {
        workspaceId: 'ws-1',
        id: { in: ['tx-1', 'tx-reversal-1'] },
      },
    });
    expect(prisma.telegramManagedPost.deleteMany).toHaveBeenCalledWith({
      where: { workspaceId: 'ws-1', id: { in: ['managed-post-1'] } },
    });
    expect(prisma.telegramPost.deleteMany).toHaveBeenCalledWith({
      where: { workspaceId: 'ws-1', id: { in: ['telegram-post-1'] } },
    });
  });

  it('keeps the deal and local records when Telegram post deletion fails', async () => {
    const { service, prisma } = createService();
    prisma.telegramPost.findMany.mockResolvedValue([]);
    prisma.telegramAdSale.findFirst.mockResolvedValue(
      makeSale({
        placements: [
          makePlacement({
            publishedAt: new Date('2026-08-22T09:00:00.000Z'),
            deletedAt: null,
            managedPost: { id: 'managed-post-1', telegramMessageIds: ['42'] },
          }),
        ],
      }),
    );
    jest
      .spyOn(service as any, 'deletePublishedPlacement')
      .mockRejectedValue(new BadRequestException('Telegram deletion failed'));

    await expect(service.deleteSale('user-1', 'sale-1')).rejects.toThrow(
      'Telegram deletion failed',
    );

    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(prisma.telegramAdSale.delete).not.toHaveBeenCalled();
    expect(prisma.transaction.deleteMany).not.toHaveBeenCalled();
  });

  it('creates and links an advertiser when the client id is null but creation is requested', async () => {
    const { service, prisma } = createService();
    const advertiser = {
      id: 'advertiser-created',
      workspaceId: 'ws-1',
      displayName: 'Acme',
      companyName: null,
      telegramUsername: 'acme',
    };
    prisma.telegramAdvertiser.create.mockResolvedValue(advertiser);
    prisma.telegramAdvertiser.findFirst.mockResolvedValue(advertiser);
    prisma.telegramAdvertiserContact.create.mockResolvedValue({});
    prisma.telegramAdvertiserActivity.create.mockResolvedValue({});

    const result = await (service as any).resolveAdvertiserForSale(
      'ws-1',
      'user-1',
      {
        advertiserId: null,
        advertiserName: 'Acme',
        advertiserTelegram: '@acme',
        createAdvertiser: true,
      },
      'member-1',
    );

    expect(prisma.telegramAdvertiser.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        workspaceId: 'ws-1',
        displayName: 'Acme',
        telegramUsername: 'acme',
      }),
    });
    expect(result.id).toBe('advertiser-created');
  });

  it('rejects an unsupported sale origin', async () => {
    const dto = plainToInstance(CreateTelegramAdSaleDto, {
      advertiserName: 'Advertiser',
      settlementCurrency: 'USD',
      origin: 'UNKNOWN_MARKETPLACE',
    });

    const errors = await validate(dto);

    expect(errors).toEqual(
      expect.arrayContaining([expect.objectContaining({ property: 'origin' })]),
    );
  });

  it('excludes deletion retries until their persisted backoff is due', async () => {
    const { service, prisma } = createService();
    prisma.telegramAdSalePlacement.findMany.mockResolvedValue([]);

    await expect(service.processDueDeletionBatch()).resolves.toEqual({
      processed: 0,
      failed: 0,
    });

    expect(prisma.telegramAdSalePlacement.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          OR: expect.arrayContaining([
            { lastDeletionAttemptAt: null },
            expect.objectContaining({
              lastDeletionAttemptAt: expect.any(Object),
            }),
          ]),
        }),
      }),
    );
  });

  it('rearms due deletions when publishing creates an earlier delete time', async () => {
    const { service, prisma, telegramChannelsService } = createService();
    const publishedAt = new Date('2026-08-19T08:00:00.000Z');
    const placement = makePlacement({
      managedPostId: 'managed-post-1',
      status: TelegramAdPlacementStatus.SCHEDULED,
      plannedDeleteAt: new Date('2026-08-25T08:00:00.000Z'),
    });
    prisma.telegramAdSalePlacement.findFirst.mockResolvedValue(placement);
    telegramChannelsService.publishManagedPostNow.mockResolvedValue({
      publishedAt,
    });
    prisma.telegramAdSalePlacement.update.mockResolvedValue(
      makePlacement({
        ...placement,
        status: TelegramAdPlacementStatus.PUBLISHED,
        publishedAt,
        plannedDeleteAt: new Date('2026-08-20T08:10:00.000Z'),
      }),
    );
    const wake = jest.fn();
    scheduledTaskWakeNotifier.on('changed', wake);
    try {
      await service.publishPlacement('user-1', 'sale-1', placement.id, {});
    } finally {
      scheduledTaskWakeNotifier.off('changed', wake);
    }

    expect(prisma.telegramAdSalePlacement.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          plannedDeleteAt: new Date('2026-08-20T09:00:00.000Z'),
        }),
      }),
    );
    expect(wake).toHaveBeenCalledWith('telegram_ad_sales.due_deletions');
  });

  it('schedules every future placement without publishing up to a minute early', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-08-27T07:30:00.000Z'));
    const { service, prisma } = createService();
    const placements = [
      makePlacement({
        id: 'placement-1',
        managedPostId: 'post-1',
        scheduledAt: new Date('2026-08-27T07:30:30.000Z'),
      }),
      makePlacement({
        id: 'placement-2',
        telegramChannelId: 'channel-2',
        managedPostId: 'post-2',
        scheduledAt: new Date('2026-08-27T07:30:30.000Z'),
      }),
    ];
    jest
      .spyOn(service as never, 'getSaleDetails' as never)
      .mockResolvedValue(makeSale({ placements }) as never);
    const publish = jest.spyOn(service, 'publishPlacement').mockImplementation(
      async (_userId, _saleId, placementId) =>
        ({
          status: TelegramAdPlacementStatus.PUBLISHED,
          scheduledAt: placements.find((item) => item.id === placementId)
            ?.scheduledAt,
        }) as never,
    );
    const schedule = jest
      .spyOn(service, 'schedulePlacement')
      .mockImplementation(
        async (_userId, _saleId, placementId) =>
          ({
            status: TelegramAdPlacementStatus.SCHEDULED,
            scheduledAt: placements.find((item) => item.id === placementId)
              ?.scheduledAt,
          }) as never,
      );

    const result = await service.scheduleSale('user-1', 'sale-1', {});

    expect(publish).not.toHaveBeenCalled();
    expect(schedule).toHaveBeenCalledTimes(2);
    expect(result.results).toEqual([
      expect.objectContaining({ placementId: 'placement-1', success: true }),
      expect.objectContaining({ placementId: 'placement-2', success: true }),
    ]);
    jest.useRealTimers();
  });

  it('persists deletion failure backoff before rearming the due scheduler', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-08-19T10:00:00.000Z'));
    const { service, prisma } = createService();
    prisma.telegramAdSalePlacement.findMany.mockResolvedValue([
      {
        id: 'placement-1',
        workspaceId: 'ws-1',
        scheduledAt: new Date('2026-08-18T08:00:00.000Z'),
        publishedAt: new Date('2026-08-18T08:00:00.000Z'),
        plannedDeleteAt: new Date('2026-08-19T09:00:00.000Z'),
        deleteAfterHoursSnapshot: 24,
        isPermanentSnapshot: false,
      },
    ]);
    jest
      .spyOn(service as any, 'deletePublishedPlacement')
      .mockRejectedValue(new Error('Telegram unavailable'));
    prisma.telegramAdSalePlacement.update.mockResolvedValue({});
    const wake = jest.fn();
    scheduledTaskWakeNotifier.on('changed', wake);
    try {
      await expect(service.processDueDeletionBatch()).resolves.toEqual({
        processed: 0,
        failed: 1,
      });
    } finally {
      scheduledTaskWakeNotifier.off('changed', wake);
    }

    expect(prisma.telegramAdSalePlacement.update).toHaveBeenCalledWith({
      where: { id: 'placement-1' },
      data: {
        lastDeletionAttemptAt: new Date('2026-08-19T10:00:00.000Z'),
        lastDeletionError: 'Telegram unavailable',
      },
    });
    expect(wake).toHaveBeenCalledWith('telegram_ad_sales.due_deletions');
  });

  it('deletes once the format duration plus its one-hour safety margin has elapsed', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-08-28T08:31:00.000Z'));
    const { service, prisma } = createService();
    prisma.telegramAdSalePlacement.findMany.mockResolvedValue([
      {
        id: 'placement-1',
        workspaceId: 'ws-1',
        scheduledAt: new Date('2026-08-27T07:30:00.000Z'),
        publishedAt: new Date('2026-08-27T07:31:00.000Z'),
        plannedDeleteAt: new Date('2026-08-28T08:31:00.000Z'),
        deleteAfterHoursSnapshot: 24,
        isPermanentSnapshot: false,
      },
    ]);
    prisma.telegramAdSalePlacement.update.mockResolvedValue({});
    const remove = jest
      .spyOn(service as any, 'deletePublishedPlacement')
      .mockResolvedValue({});

    await expect(service.processDueDeletionBatch()).resolves.toEqual({
      processed: 1,
      failed: 0,
    });

    expect(remove).toHaveBeenCalledWith('ws-1', 'placement-1', {
      notifyScheduler: false,
    });
  });

  it('deletes a Bot API placement through the connected source token resolver', async () => {
    const {
      service,
      prisma,
      sourceAccessService,
      telegramChannelAccessService,
      telegramBotApiClient,
    } = createService();
    prisma.telegramAdSalePlacement.findFirst.mockResolvedValue(
      makePlacement({
        status: TelegramAdPlacementStatus.PUBLISHED,
        publishedAt: new Date(),
        managedPost: {
          id: 'managed-post-1',
          telegramMessageIds: ['42'],
          telegramIdVerificationStatus: 'VERIFIED',
          sourceType: 'BOT',
          sourceId: 'system-bot',
          publishedAt: new Date(),
        },
        telegramChannel: {
          telegramChatId: '-100123',
          username: 'channel',
        },
      }),
    );
    jest.spyOn(service as any, 'reconcilePlacementMetrics').mockResolvedValue({
      actualViews24h: 10,
      actualViews48h: 10,
      actualViewsFinal: 10,
      actualReactionsFinal: 1,
      actualCpm: decimal(10),
    });
    jest.spyOn(service as any, 'getSaleDetails').mockResolvedValue(makeSale());
    sourceAccessService.sourcesForChannel.mockResolvedValue([
      {
        sourceType: 'BOT',
        sourceId: 'system-bot',
        permissions: { canDeleteMessages: true },
      },
    ]);
    telegramChannelAccessService.botTokenForSource.mockResolvedValue(
      'connected-token',
    );

    await (service as any).deletePublishedPlacement('ws-1', 'placement-1');

    expect(telegramChannelAccessService.botTokenForSource).toHaveBeenCalledWith(
      'ws-1',
      'system-bot',
    );
    expect(telegramBotApiClient.deleteMessage).toHaveBeenCalledWith(
      'connected-token',
      { chat_id: '-100123', message_id: 42 },
    );
    expect(prisma.telegramBotRuntimeInstance.findFirst).not.toHaveBeenCalled();
  });

  it('completes an expired Bot API placement when Telegram says the post is already absent', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-08-27T18:05:00.000Z'));
    const {
      service,
      prisma,
      sourceAccessService,
      telegramChannelAccessService,
      telegramBotApiClient,
    } = createService();
    prisma.telegramAdSalePlacement.findFirst.mockResolvedValue(
      makePlacement({
        status: TelegramAdPlacementStatus.PUBLISHED,
        publishedAt: new Date('2026-08-25T17:00:00.000Z'),
        plannedDeleteAt: new Date('2026-08-27T18:00:00.000Z'),
        managedPost: {
          id: 'managed-post-1',
          telegramMessageIds: ['42'],
          telegramIdVerificationStatus: 'VERIFIED',
          sourceType: 'BOT',
          sourceId: 'system-bot',
          publishedAt: new Date('2026-08-25T17:00:00.000Z'),
        },
        telegramChannel: {
          telegramChatId: '-100123',
          username: 'channel',
        },
      }),
    );
    jest.spyOn(service as any, 'reconcilePlacementMetrics').mockResolvedValue({
      actualViews24h: 740,
      actualViews48h: 740,
      actualViewsFinal: 740,
      actualReactionsFinal: 4,
      actualCpm: decimal(10),
    });
    jest.spyOn(service as any, 'getSaleDetails').mockResolvedValue(makeSale());
    sourceAccessService.sourcesForChannel.mockResolvedValue([
      {
        sourceType: 'BOT',
        sourceId: 'system-bot',
        permissions: { canDeleteMessages: true },
      },
    ]);
    telegramChannelAccessService.botTokenForSource.mockResolvedValue(
      'connected-token',
    );
    telegramBotApiClient.deleteMessage.mockRejectedValue(
      new Error('Bad Request: message to delete not found'),
    );

    await expect(
      (service as any).deletePublishedPlacement('ws-1', 'placement-1'),
    ).resolves.toBeDefined();

    expect(prisma.telegramAdSalePlacement.update).toHaveBeenCalledWith({
      where: { id: 'placement-1' },
      data: expect.objectContaining({
        deletedAt: new Date('2026-08-27T18:05:00.000Z'),
        status: TelegramAdPlacementStatus.COMPLETED,
        completedAt: new Date('2026-08-27T18:05:00.000Z'),
        lastDeletionError: null,
      }),
    });
    expect(prisma.telegramManagedPost.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ telegramRemoteStatus: 'MISSING' }),
      }),
    );
  });

  it('completes a due legacy placement from its linked Telegram post when the managed shell has no ids', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-08-28T18:05:00.000Z'));
    const {
      service,
      prisma,
      sourceAccessService,
      telegramChannelAccessService,
      telegramBotApiClient,
    } = createService();
    prisma.telegramAdSalePlacement.findMany.mockResolvedValue([
      {
        id: 'legacy-placement',
        workspaceId: 'ws-1',
        scheduledAt: new Date('2026-08-26T17:00:00.000Z'),
        publishedAt: new Date('2026-08-26T17:00:00.000Z'),
        plannedDeleteAt: new Date('2026-08-27T18:00:00.000Z'),
        deleteAfterHoursSnapshot: 24,
        isPermanentSnapshot: false,
      },
    ]);
    prisma.telegramAdSalePlacement.findFirst.mockResolvedValue(
      makePlacement({
        id: 'legacy-placement',
        status: TelegramAdPlacementStatus.PUBLISHED,
        publishedAt: new Date('2026-08-26T17:00:00.000Z'),
        plannedDeleteAt: new Date('2026-08-27T18:00:00.000Z'),
        managedPost: {
          id: 'legacy-managed-shell',
          telegramMessageIds: [],
          telegramIdVerificationStatus: 'UNVERIFIED',
          sourceType: 'BOT',
          sourceId: 'system-bot',
          publishedAt: null,
        },
        telegramPost: {
          id: 'telegram-post-8411',
          telegramMessageId: '8411',
        },
        telegramChannel: {
          telegramChatId: '-100123',
          username: 'channel',
        },
      }),
    );
    jest.spyOn(service as any, 'reconcilePlacementMetrics').mockResolvedValue({
      actualViews24h: 740,
      actualViews48h: 740,
      actualViewsFinal: 740,
      actualReactionsFinal: 4,
      actualCpm: decimal(10),
    });
    jest.spyOn(service as any, 'getSaleDetails').mockResolvedValue(makeSale());
    sourceAccessService.sourcesForChannel.mockResolvedValue([
      {
        sourceType: 'BOT',
        sourceId: 'system-bot',
        permissions: { canDeleteMessages: true },
      },
    ]);
    telegramChannelAccessService.botTokenForSource.mockResolvedValue(
      'connected-token',
    );
    telegramBotApiClient.deleteMessage.mockRejectedValue(
      new Error('Bad Request: message to delete not found'),
    );

    await expect(service.processDueDeletionBatch()).resolves.toEqual({
      processed: 1,
      failed: 0,
    });

    expect(telegramBotApiClient.deleteMessage).toHaveBeenCalledWith(
      'connected-token',
      { chat_id: '-100123', message_id: 8411 },
    );
    expect(prisma.telegramAdSalePlacement.update).toHaveBeenCalledWith({
      where: { id: 'legacy-placement' },
      data: expect.objectContaining({
        status: TelegramAdPlacementStatus.COMPLETED,
        deletedAt: new Date('2026-08-28T18:05:00.000Z'),
        lastDeletionError: null,
      }),
    });
  });

  it('falls back to MTProto when Bot API cannot access the channel', async () => {
    const {
      service,
      prisma,
      sourceAccessService,
      telegramChannelAccessService,
      telegramBotApiClient,
      mtprotoClient,
      encryptionService,
    } = createService();
    const telegramChannel = {
      telegramChatId: '3976683330',
      username: null,
      telegramAccessHash: 'access-hash',
    };
    prisma.telegramAdSalePlacement.findFirst.mockResolvedValue(
      makePlacement({
        status: TelegramAdPlacementStatus.PUBLISHED,
        publishedAt: new Date(),
        managedPost: {
          id: 'managed-post-1',
          telegramMessageIds: ['86'],
          telegramIdVerificationStatus: 'VERIFIED',
          sourceType: 'BOT',
          sourceId: 'system-bot',
          publishedAt: new Date(),
        },
        telegramChannel,
      }),
    );
    jest.spyOn(service as any, 'reconcilePlacementMetrics').mockResolvedValue({
      actualViews24h: 10,
      actualViews48h: 10,
      actualViewsFinal: 10,
      actualReactionsFinal: 1,
      actualCpm: decimal(10),
    });
    jest.spyOn(service as any, 'getSaleDetails').mockResolvedValue(makeSale());
    sourceAccessService.sourcesForChannel.mockResolvedValue([
      {
        sourceType: 'BOT',
        sourceId: 'system-bot',
        permissions: { canDeleteMessages: true },
      },
      {
        sourceType: 'MTPROTO',
        sourceId: 'account-1',
        permissions: { canDeleteMessages: true },
      },
    ]);
    telegramChannelAccessService.botTokenForSource.mockResolvedValue(
      'connected-token',
    );
    telegramBotApiClient.deleteMessage.mockRejectedValue(
      new Error('Bad Request: chat not found'),
    );
    prisma.telegramUserAccountIntegration.findFirst.mockResolvedValue({
      id: 'account-1',
      apiId: 123,
      apiHashEncrypted: 'api-hash',
      apiHashIv: 'api-hash-iv',
      apiHashAuthTag: 'api-hash-tag',
      sessionEncrypted: 'session',
      sessionIv: 'session-iv',
      sessionAuthTag: 'session-tag',
    });
    encryptionService.decrypt
      .mockReturnValueOnce('decrypted-api-hash')
      .mockReturnValueOnce('decrypted-session');

    await (service as any).deletePublishedPlacement('ws-1', 'placement-1');

    expect(mtprotoClient.deletePublishedMessages).toHaveBeenCalledWith({
      apiId: 123,
      apiHash: 'decrypted-api-hash',
      session: 'decrypted-session',
      channel: telegramChannel,
      messageIds: ['86'],
    });
  });

  it('recreates legacy MTProto scheduled ad posts through Bot API', async () => {
    const { service, telegramChannelsService, telegramChannelAccessService } =
      createService();
    const sale = makeSale({
      placements: [
        makePlacement({
          id: 'placement-1',
          status: TelegramAdPlacementStatus.SCHEDULED,
          scheduledAt: new Date('2026-08-28T13:30:00.000Z'),
          managedPost: {
            id: 'managed-post-1',
            sourceType: 'MTPROTO',
            telegramScheduledMessageIds: ['123'],
          },
        }),
      ],
    });
    jest.spyOn(service as any, 'getSaleDetails').mockResolvedValue(sale);
    jest.spyOn(service, 'getSale').mockResolvedValue(sale as never);
    telegramChannelAccessService.checkProductionBotPublishingAccess.mockResolvedValue(
      { canPublishWithInlineButtons: true },
    );

    await service.recreateScheduledPostsViaBot('user-1', 'sale-1');

    expect(
      telegramChannelAccessService.checkProductionBotPublishingAccess,
    ).toHaveBeenCalledWith('user-1', 'channel-1');
    expect(
      telegramChannelsService.returnManagedPostToDraft,
    ).toHaveBeenCalledWith('user-1', 'channel-1', 'managed-post-1');
    expect(telegramChannelsService.scheduleManagedPost).toHaveBeenCalledWith(
      'user-1',
      'channel-1',
      'managed-post-1',
      { scheduledAt: '2026-08-28T13:30:00.000Z' },
    );
  });

  it('accepts analytics from/to aliases with whitelist validation and maps them into the range', async () => {
    const dto = plainToInstance(TelegramAdAnalyticsQueryDto, {
      from: '2026-08-01T00:00:00.000Z',
      to: '2026-08-07T23:59:59.000Z',
      timezone: 'UTC',
      networkId: 'network-1',
    });

    const errors = await validate(dto, {
      whitelist: true,
      forbidNonWhitelisted: true,
    });

    expect(errors).toHaveLength(0);
    const { service } = createService();
    const range = (service as any).analyticsRange(dto);
    expect(range.from.toISOString()).toBe('2026-08-01T00:00:00.000Z');
    expect(range.to.toISOString()).toBe('2026-08-07T23:59:59.000Z');
    expect(dto.networkId).toBe('network-1');

    const alertsDto = plainToInstance(TelegramAdAlertsQueryDto, {
      dateFrom: '2026-08-01T00:00:00.000Z',
      dateTo: '2026-08-07T23:59:59.000Z',
      networkId: 'network-1',
    });

    await expect(
      validate(alertsDto, { whitelist: true, forbidNonWhitelisted: true }),
    ).resolves.toHaveLength(0);
  });

  it('accepts comma-separated analytics channel ids under whitelist validation', async () => {
    const dto = plainToInstance(TelegramAdAnalyticsSeriesQueryDto, {
      dateFrom: '2026-08-01T00:00:00.000Z',
      dateTo: '2026-08-07T23:59:59.000Z',
      channelIds: 'channel-1, channel-2',
    });

    const errors = await validate(dto, {
      whitelist: true,
      forbidNonWhitelisted: true,
    });

    expect(errors).toHaveLength(0);
    expect(dto.channelIds).toEqual(['channel-1', 'channel-2']);
  });

  it('enforces workspace isolation for channel products', async () => {
    const { service, prisma } = createService();
    prisma.telegramChannel.findFirst.mockResolvedValue(null);

    await expect(
      service.listChannelProducts('user-1', 'channel-1'),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('returns the active channel setup as one read model', async () => {
    const { service } = createService();
    const baseline = { channelId: 'channel-1', pricing: {} };
    const policy = { telegramChannelId: 'channel-1' };
    const products = [{ id: 'product-1', telegramChannelId: 'channel-1' }];
    jest
      .spyOn(service, 'getChannelBaseline')
      .mockResolvedValue(baseline as any);
    jest.spyOn(service, 'getPolicy').mockResolvedValue(policy as any);
    jest
      .spyOn(service, 'listChannelProducts')
      .mockResolvedValue(products as any);

    await expect(
      service.getChannelSetup('user-1', 'channel-1'),
    ).resolves.toEqual({
      baseline,
      policy,
      products,
    });
  });

  it('requires manual reason when price is below minimum', async () => {
    const { service, prisma } = createService();
    prisma.telegramAdSalePlacement.findFirst.mockResolvedValue(
      makePlacement({
        agreedPrice: decimal(100),
        minimumPrice: decimal(120),
        manualPriceReason: null,
      }),
    );

    await expect(
      service.updatePlacement('user-1', 'sale-1', 'placement-1', {
        agreedPrice: 90,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('allows unrelated edits on a legacy placement already below minimum', async () => {
    const { service, prisma } = createService();
    prisma.telegramAdSalePlacement.findFirst.mockResolvedValue(
      makePlacement({
        agreedPrice: decimal(100),
        minimumPrice: decimal(120),
        manualPriceReason: null,
      }),
    );
    prisma.telegramAdSalePlacement.update.mockResolvedValue(
      makePlacement({ agreedPrice: decimal(100), minimumPrice: decimal(120) }),
    );

    await expect(
      service.updatePlacement('user-1', 'sale-1', 'placement-1', {
        agreedPrice: 100,
        minimumPrice: 120,
      }),
    ).resolves.toBeDefined();
  });

  it('projects exactly one notification for a fresh persisted MISSED transition', async () => {
    const { service, prisma, notificationProjector } = createService();
    const scheduled = makePlacement({
      status: TelegramAdPlacementStatus.SCHEDULED,
    });
    const missed = makePlacement({ status: TelegramAdPlacementStatus.MISSED });
    prisma.telegramAdSalePlacement.findFirst.mockResolvedValue(scheduled);
    prisma.telegramAdSalePlacement.updateMany.mockResolvedValue({ count: 1 });
    prisma.telegramAdSalePlacement.findUniqueOrThrow.mockResolvedValue(missed);
    prisma.telegramAdSale.findFirst.mockResolvedValue({
      advertiserId: 'contact-1',
    });

    await service.updatePlacement('user-1', 'sale-1', 'placement-1', {
      status: TelegramAdPlacementStatus.MISSED,
    });

    expect(notificationProjector.placementMissed).toHaveBeenCalledTimes(1);
    expect(notificationProjector.placementMissed).toHaveBeenCalledWith(
      prisma,
      expect.objectContaining({
        id: 'placement-1',
        advertiserId: 'contact-1',
      }),
    );
    expect(notificationProjector.publish).toHaveBeenCalledWith([
      'notification-1',
    ]);
  });

  it('does not project placement failure for an unchanged MISSED row', async () => {
    const { service, prisma, notificationProjector } = createService();
    const missed = makePlacement({ status: TelegramAdPlacementStatus.MISSED });
    prisma.telegramAdSalePlacement.findFirst.mockResolvedValue(missed);
    prisma.telegramAdSalePlacement.update.mockResolvedValue(missed);

    await service.updatePlacement('user-1', 'sale-1', 'placement-1', {
      status: TelegramAdPlacementStatus.MISSED,
    });

    expect(notificationProjector.placementMissed).not.toHaveBeenCalled();
    expect(notificationProjector.publish).toHaveBeenCalledWith([]);
  });

  it('creates advertising managed posts inside the channel Advertise system group', async () => {
    const {
      service,
      prisma,
      telegramChannelsService,
      telegramPostGroupsService,
    } = createService();
    jest.spyOn(service as any, 'getSaleDetails').mockResolvedValue(
      makeSale({
        assignedMemberId: 'member-1',
        placements: [makePlacement()],
      }),
    );
    telegramChannelsService.createManagedPost.mockResolvedValue({
      id: 'managed-post-1',
    });
    prisma.telegramAdSalePlacement.update.mockResolvedValue({});

    await service.createManagedPostFromPlacement(
      'user-1',
      'sale-1',
      'placement-1',
      { title: 'Advertising post' },
    );

    expect(
      telegramPostGroupsService.ensureAdvertiseSystemGroup,
    ).toHaveBeenCalledWith('ws-1', 'channel-1', 'member-1');
    expect(telegramChannelsService.createManagedPost).toHaveBeenCalledWith(
      'user-1',
      'channel-1',
      expect.objectContaining({ title: 'Advertising post' }),
      { groupId: 'advertise-group-1' },
    );
  });

  it('attaches a published managed post to a past placement and marks it published', async () => {
    const { service, prisma, telegramPostGroupsService } = createService();
    const placement = makePlacement({
      status: TelegramAdPlacementStatus.RESERVED,
      scheduledAt: new Date('2026-08-01T10:00:00.000Z'),
    });
    jest
      .spyOn(service as any, 'ensurePlacementBelongsToSale')
      .mockResolvedValue(placement);
    prisma.telegramManagedPost.findFirst.mockResolvedValue({
      id: 'managed-post-1',
      workspaceId: 'ws-1',
      telegramChannelId: 'channel-1',
      status: 'PUBLISHED',
      telegramIdVerificationStatus: 'VERIFIED',
      publishedAt: new Date('2026-08-01T18:00:00.000Z'),
      telegramMessageIds: ['42'],
    });
    prisma.telegramPost.findFirst.mockResolvedValue({
      id: 'post-1',
      workspaceId: 'ws-1',
      telegramChannelId: 'channel-1',
      telegramMessageId: '42',
    });
    prisma.telegramAdSalePlacement.update.mockResolvedValue(
      makePlacement({
        status: TelegramAdPlacementStatus.PUBLISHED,
        managedPostId: 'managed-post-1',
        telegramPostId: 'post-1',
        publishedAt: new Date('2026-08-01T18:00:00.000Z'),
      }),
    );

    const wake = jest.fn();
    scheduledTaskWakeNotifier.on('changed', wake);
    try {
      await service.attachManagedPost('user-1', 'sale-1', 'placement-1', {
        managedPostId: 'managed-post-1',
      });
    } finally {
      scheduledTaskWakeNotifier.off('changed', wake);
    }

    expect(prisma.telegramAdSalePlacement.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'placement-1' },
        data: expect.objectContaining({
          managedPostId: 'managed-post-1',
          status: TelegramAdPlacementStatus.PUBLISHED,
          telegramPostId: 'post-1',
          publishedAt: new Date('2026-08-01T18:00:00.000Z'),
          plannedDeleteAt: new Date('2026-08-02T19:00:00.000Z'),
        }),
      }),
    );
    expect(wake).toHaveBeenCalledWith('telegram_ad_sales.due_deletions');
    expect(telegramPostGroupsService.addPostsToGroup).toHaveBeenCalledWith(
      'user-1',
      'advertise-group-1',
      { postIds: ['managed-post-1'] },
    );
  });

  it('rejects a Telegram post URL from another channel with a clear message', async () => {
    const { service, prisma } = createService();
    jest
      .spyOn(service as any, 'ensurePlacementBelongsToSale')
      .mockResolvedValue(makePlacement());
    prisma.telegramChannel.findFirst.mockResolvedValue({
      username: '@expected_channel',
      telegramChatId: '-1003988203250',
    });

    await expect(
      service.attachManagedPost('user-1', 'sale-1', 'placement-1', {
        telegramPostUrl: 'https://t.me/another_channel/42',
      }),
    ).rejects.toThrow('This post does not belong to this channel.');
  });

  it('creates immutable price snapshots', async () => {
    const { service, prisma } = createService();
    prisma.telegramChannel.findFirst.mockResolvedValue({
      id: 'channel-1',
      workspaceId: 'ws-1',
      timePosts: [],
      language: 'UTC',
      adBaseCpm: decimal(10),
      adBaseCurrency: 'USD',
    });
    prisma.$queryRaw.mockResolvedValue(
      pricingSourceRows([
        {
          id: 'post-1',
          telegramChannelId: 'channel-1',
          postDate: new Date('2026-08-01T00:00:00.000Z'),
          viewsCount: 900,
          manualOwnViews: 0,
          excludeFromAnalytics: false,
          adSalePlacements: [],
          metricSnapshots: [],
        },
        {
          id: 'post-2',
          telegramChannelId: 'channel-1',
          postDate: new Date('2026-07-31T00:00:00.000Z'),
          viewsCount: 1000,
          manualOwnViews: 0,
          excludeFromAnalytics: false,
          adSalePlacements: [],
          metricSnapshots: [],
        },
        {
          id: 'post-3',
          telegramChannelId: 'channel-1',
          postDate: new Date('2026-07-30T00:00:00.000Z'),
          viewsCount: 1100,
          manualOwnViews: 0,
          excludeFromAnalytics: false,
          adSalePlacements: [],
          metricSnapshots: [],
        },
      ]),
    );
    prisma.telegramChannelAudienceSnapshot.findFirst.mockResolvedValue({
      avgViewsAdjusted: 1000,
      dataQuality: 'normal',
    });
    prisma.telegramAdPriceSnapshot.create
      .mockResolvedValueOnce({
        id: 'snapshot-1',
        expectedViews: 1000,
        targetCpm: decimal(10),
        recommendedPrice: decimal(10),
        minimumPrice: decimal(10),
        currency: 'USD',
        calculatedAt: new Date('2026-08-01T00:00:00.000Z'),
        createdAt: new Date('2026-08-01T00:00:00.000Z'),
      })
      .mockResolvedValueOnce({
        id: 'snapshot-2',
        expectedViews: 1000,
        targetCpm: decimal(10),
        recommendedPrice: decimal(10),
        minimumPrice: decimal(10),
        currency: 'USD',
        calculatedAt: new Date('2026-08-01T00:01:00.000Z'),
        createdAt: new Date('2026-08-01T00:01:00.000Z'),
      });

    const first = await service.createQuote('user-1', {
      telegramChannelId: 'channel-1',
      targetCpm: 10,
    });
    const second = await service.createQuote('user-1', {
      telegramChannelId: 'channel-1',
      targetCpm: 10,
    });

    expect(first.snapshotId).not.toBe(second.snapshotId);
    expect(prisma.telegramAdPriceSnapshot.create).toHaveBeenCalledTimes(2);
  });

  it('prices quote from post metrics available at scheduled time', async () => {
    const { service, prisma } = createService();
    const scheduledAt = new Date('2026-08-02T12:00:00.000Z');
    prisma.telegramChannel.findFirst.mockResolvedValue({
      id: 'channel-1',
      workspaceId: 'ws-1',
      timePosts: [],
      adBaseCpm: decimal(10),
      adBaseCurrency: 'UAH',
      currentSubscribersCount: 10000,
      ownViewsPerPost: null,
    });
    prisma.$queryRaw.mockResolvedValue(
      pricingSourceRows([
        {
          id: 'post-future',
          telegramChannelId: 'channel-1',
          postDate: new Date('2026-08-03T10:00:00.000Z'),
          viewsCount: 5000,
          manualOwnViews: null,
          excludeFromAnalytics: false,
          adSalePlacements: [],
          metricSnapshots: [
            {
              viewsCount: 5000,
              collectedAt: new Date('2026-08-03T12:00:00.000Z'),
            },
          ],
        },
        {
          id: 'post-1',
          telegramChannelId: 'channel-1',
          postDate: new Date('2026-08-01T10:00:00.000Z'),
          viewsCount: 9000,
          manualOwnViews: null,
          excludeFromAnalytics: false,
          adSalePlacements: [],
          metricSnapshots: [
            {
              viewsCount: 1000,
              collectedAt: new Date('2026-08-01T12:00:00.000Z'),
            },
            {
              viewsCount: 9000,
              collectedAt: new Date('2026-08-03T12:00:00.000Z'),
            },
          ],
        },
        {
          id: 'post-2',
          telegramChannelId: 'channel-1',
          postDate: new Date('2026-07-31T10:00:00.000Z'),
          viewsCount: 9100,
          manualOwnViews: null,
          excludeFromAnalytics: false,
          adSalePlacements: [],
          metricSnapshots: [
            {
              viewsCount: 1100,
              collectedAt: new Date('2026-07-31T12:00:00.000Z'),
            },
          ],
        },
        {
          id: 'post-3',
          telegramChannelId: 'channel-1',
          postDate: new Date('2026-07-30T10:00:00.000Z'),
          viewsCount: 9200,
          manualOwnViews: null,
          excludeFromAnalytics: false,
          adSalePlacements: [],
          metricSnapshots: [
            {
              viewsCount: 1200,
              collectedAt: new Date('2026-07-30T12:00:00.000Z'),
            },
          ],
        },
      ]),
    );
    prisma.telegramAdPriceSnapshot.create.mockImplementation(
      async ({ data }: any) => ({
        id: 'snapshot-historical',
        expectedViews: data.expectedViews,
        targetCpm: data.targetCpm,
        recommendedPrice: data.recommendedPrice,
        minimumPrice: data.minimumPrice,
        currency: data.currency,
        calculatedAt: new Date('2026-08-08T00:00:00.000Z'),
        createdAt: new Date('2026-08-08T00:00:00.000Z'),
      }),
    );

    const quote = await service.createQuote('user-1', {
      telegramChannelId: 'channel-1',
      targetCpm: 10,
      currency: 'UAH',
      scheduledAt: scheduledAt.toISOString(),
    });

    const pricingStatement = prisma.$queryRaw.mock.calls[0][0] as {
      sql: string;
      values: unknown[];
    };
    expect(pricingStatement.sql).toContain('post."postDate" <=');
    expect(pricingStatement.sql).toContain('snapshot."collectedAt" <=');
    expect(pricingStatement.values).toContainEqual(scheduledAt);
    expect(prisma.telegramPost.findMany).not.toHaveBeenCalled();
    expect(prisma.telegramAdPriceSnapshot.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          expectedViews: 1100,
          recommendedPrice: decimal(11),
          currency: 'UAH',
        }),
      }),
    );
    expect(quote.expectedViews).toBe(1100);
    expect(quote.recommendedPrice).toBe('11');
  });

  it('uses latest available pricing when a future quote has no scheduled-time sample yet', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-08-08T12:00:00.000Z'));
    const { service, prisma } = createService();
    prisma.telegramChannel.findFirst.mockResolvedValue({
      id: 'channel-1',
      workspaceId: 'ws-1',
      timePosts: [],
      adBaseCpm: decimal(10),
      adBaseCurrency: 'UAH',
      currentSubscribersCount: 10000,
      ownViewsPerPost: null,
    });
    prisma.$queryRaw
      .mockResolvedValueOnce(
        pricingSourceRows([
          {
            id: 'post-no-snapshot',
            telegramChannelId: 'channel-1',
            postDate: new Date('2026-08-05T10:00:00.000Z'),
            viewsCount: 7750,
            manualOwnViews: null,
            excludeFromAnalytics: false,
            adSalePlacements: [],
            metricSnapshots: [],
          },
        ]),
      )
      .mockResolvedValueOnce(
        pricingSourceRows([
          {
            id: 'post-1',
            telegramChannelId: 'channel-1',
            postDate: new Date('2026-08-05T10:00:00.000Z'),
            viewsCount: 7700,
            manualOwnViews: null,
            excludeFromAnalytics: false,
            adSalePlacements: [],
            metricSnapshots: [],
          },
          {
            id: 'post-2',
            telegramChannelId: 'channel-1',
            postDate: new Date('2026-08-04T10:00:00.000Z'),
            viewsCount: 7750,
            manualOwnViews: null,
            excludeFromAnalytics: false,
            adSalePlacements: [],
            metricSnapshots: [],
          },
          {
            id: 'post-3',
            telegramChannelId: 'channel-1',
            postDate: new Date('2026-08-03T10:00:00.000Z'),
            viewsCount: 7800,
            manualOwnViews: null,
            excludeFromAnalytics: false,
            adSalePlacements: [],
            metricSnapshots: [],
          },
        ]),
      );
    prisma.telegramAdPriceSnapshot.create.mockImplementation(
      async ({ data }: any) => ({
        id: 'snapshot-future-fallback',
        expectedViews: data.expectedViews,
        targetCpm: data.targetCpm,
        recommendedPrice: data.recommendedPrice,
        minimumPrice: data.minimumPrice,
        currency: data.currency,
        calculatedAt: new Date('2026-08-08T12:00:00.000Z'),
        createdAt: new Date('2026-08-08T12:00:00.000Z'),
      }),
    );

    const quote = await service.createQuote('user-1', {
      telegramChannelId: 'channel-1',
      targetCpm: 10,
      currency: 'UAH',
      scheduledAt: '2026-08-15T12:00:00.000Z',
    });

    expect(prisma.$queryRaw).toHaveBeenCalledTimes(2);
    expect(prisma.telegramPost.findMany).not.toHaveBeenCalled();
    expect(quote.expectedViews).toBe(7750);
    expect(quote.recommendedPrice).toBe('77.5');
    jest.useRealTimers();
  });

  it('allows multiple reservations for the same channel and time', async () => {
    const { service, prisma } = createService();
    const placement = makePlacement({
      status: TelegramAdPlacementStatus.DRAFT,
    });
    const draftSale = makeSale({
      status: TelegramAdSaleStatus.DRAFT,
      placements: [placement],
    });
    const reservedSale = makeSale({
      status: TelegramAdSaleStatus.RESERVED,
      placements: [
        { ...placement, status: TelegramAdPlacementStatus.RESERVED },
      ],
    });
    prisma.telegramAdSale.findFirst.mockResolvedValue(draftSale);
    const findConflict = jest.fn().mockResolvedValue({
      id: 'conflict-1',
      telegramAdSaleId: 'sale-2',
      scheduledAt: new Date('2026-08-02T10:00:00.000Z'),
      status: TelegramAdPlacementStatus.RESERVED,
    });
    const updatePlacement = jest.fn();
    prisma.$transaction.mockImplementation(async (callback: any) =>
      callback({
        $executeRaw: jest.fn(),
        telegramAdSalePlacement: {
          findFirst: findConflict,
          update: updatePlacement,
        },
        telegramAdSale: {
          update: jest.fn(),
          findUniqueOrThrow: jest.fn().mockResolvedValue(reservedSale),
        },
      }),
    );

    await expect(service.reserveSale('user-1', 'sale-1', {})).resolves.toEqual(
      expect.objectContaining({ status: TelegramAdSaleStatus.RESERVED }),
    );
    expect(updatePlacement).toHaveBeenCalledWith({
      where: { id: placement.id },
      data: {
        scheduledAt: placement.scheduledAt,
        status: TelegramAdPlacementStatus.RESERVED,
      },
    });
    expect(findConflict).not.toHaveBeenCalled();
  });

  it('supports network placements with multiple channels', async () => {
    const { service, prisma } = createService();
    prisma.telegramAdSale.findFirst.mockResolvedValue(
      makeSale({
        placements: [],
      }),
    );
    prisma.telegramChannel.findFirst.mockResolvedValue({
      id: 'channel-1',
      workspaceId: 'ws-1',
      timePosts: [],
    });
    prisma.telegramChannelNetwork.findFirst.mockResolvedValue({
      id: 'network-1',
      workspaceId: 'ws-1',
      channels: [
        { telegramChannelId: 'channel-1' },
        { telegramChannelId: 'channel-2' },
      ],
    });
    prisma.telegramAdSalePlacement.create.mockResolvedValue(
      makePlacement({
        telegramChannelNetworkId: 'network-1',
      }),
    );

    const result = await service.addPlacement('user-1', 'sale-1', {
      telegramChannelId: 'channel-1',
      telegramChannelNetworkId: 'network-1',
      scheduledAt: '2026-08-02T10:00:00.000Z',
      timezone: 'UTC',
    });

    expect(result.telegramChannelNetworkId).toBe('network-1');
  });

  it('creates payment transactions with allocations', async () => {
    const { service, prisma, financeCategoriesService } = createService();
    prisma.telegramAdSale.findFirst.mockResolvedValue(
      makeSale({
        status: TelegramAdSaleStatus.CONFIRMED,
        placements: [
          makePlacement({
            agreedPrice: decimal(200),
            paymentAllocations: [],
          }),
        ],
      }),
    );
    prisma.account.findFirst.mockResolvedValue({
      id: 'account-1',
      workspaceId: 'ws-1',
      name: 'Main account',
      currency: 'USD',
      isActive: true,
    });
    prisma.workspace.findUnique.mockResolvedValue({ primaryCurrency: 'USD' });
    prisma.transactionCategory.findFirst.mockResolvedValue({
      id: 'category-1',
      name: 'Channel Advertising Revenue',
    });
    prisma.telegramAdSalePayment.findFirst.mockResolvedValue(null);
    prisma.$transaction.mockImplementation(async (callback: any) =>
      callback({
        transaction: {
          create: jest.fn().mockResolvedValue({
            id: 'tx-1',
          }),
        },
        telegramAdSalePayment: {
          create: jest.fn().mockResolvedValue(
            makePayment({
              amount: decimal(120),
              allocations: [
                {
                  id: 'allocation-1',
                  workspaceId: 'ws-1',
                  telegramAdSalePaymentId: 'payment-1',
                  telegramAdSalePlacementId: 'placement-1',
                  amount: decimal(120),
                  currency: 'USD',
                  amountInPrimaryCurrency: decimal(120),
                  createdAt: new Date('2026-08-01T09:00:00.000Z'),
                },
              ],
            }),
          ),
        },
      }),
    );

    const payment = await service.createPayment('user-1', 'sale-1', {
      accountId: 'account-1',
      amount: 120,
      currency: 'USD',
      paidAt: '2026-08-01T09:00:00.000Z',
      notes: 'First tranche',
      allocations: [{ placementId: 'placement-1', amount: 120 }],
      idempotencyKey: 'idem-1',
    });

    expect(
      financeCategoriesService.ensureSystemCategories,
    ).toHaveBeenCalledWith('ws-1');
    expect(payment.amount).toBe('120');
    expect(payment.allocations).toHaveLength(1);
    expect(payment.allocations[0].amount).toBe('120');
  });

  it('rejects payment allocations that exceed payment amount', async () => {
    const { service, prisma } = createService();
    prisma.telegramAdSale.findFirst.mockResolvedValue(
      makeSale({
        placements: [
          makePlacement({ agreedPrice: decimal(300), paymentAllocations: [] }),
        ],
      }),
    );
    prisma.account.findFirst.mockResolvedValue({
      id: 'account-1',
      workspaceId: 'ws-1',
      name: 'Main account',
      currency: 'USD',
      isActive: true,
    });
    prisma.workspace.findUnique.mockResolvedValue({ primaryCurrency: 'USD' });
    prisma.transactionCategory.findFirst.mockResolvedValue({
      id: 'category-1',
      name: 'Channel Advertising Revenue',
    });

    await expect(
      service.createPayment('user-1', 'sale-1', {
        accountId: 'account-1',
        amount: 100,
        currency: 'USD',
        paidAt: '2026-08-01T09:00:00.000Z',
        allocations: [{ placementId: 'placement-1', amount: 120 }],
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('reuses idempotent payments instead of creating duplicates', async () => {
    const { service, prisma } = createService();
    prisma.telegramAdSale.findFirst.mockResolvedValue(
      makeSale({
        placements: [
          makePlacement({ agreedPrice: decimal(200), paymentAllocations: [] }),
        ],
      }),
    );
    prisma.account.findFirst.mockResolvedValue({
      id: 'account-1',
      workspaceId: 'ws-1',
      name: 'Main account',
      currency: 'USD',
      isActive: true,
    });
    prisma.workspace.findUnique.mockResolvedValue({ primaryCurrency: 'USD' });
    prisma.transactionCategory.findFirst.mockResolvedValue({
      id: 'category-1',
      name: 'Channel Advertising Revenue',
    });
    prisma.telegramAdSalePayment.findFirst.mockResolvedValue(makePayment());

    const existing = await service.createPayment('user-1', 'sale-1', {
      accountId: 'account-1',
      amount: 120,
      currency: 'USD',
      paidAt: '2026-08-01T09:00:00.000Z',
      allocations: [{ placementId: 'placement-1', amount: 120 }],
      idempotencyKey: 'idem-1',
    });

    expect(existing.id).toBe('payment-1');
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('updates payment and its finance transaction together', async () => {
    const { service, prisma } = createService();
    prisma.telegramAdSale.findFirst.mockResolvedValue(
      makeSale({
        assignedMemberId: 'member-1',
        placements: [
          makePlacement({
            agreedPrice: decimal(200),
            paymentAllocations: [
              {
                id: 'allocation-1',
                telegramAdSalePaymentId: 'payment-1',
                amount: decimal(120),
                payment: { status: TelegramAdSalePaymentStatus.ACTIVE },
              },
            ],
          }),
        ],
      }),
    );
    prisma.telegramAdSalePayment.findFirst.mockResolvedValue(makePayment());
    prisma.account.findFirst.mockResolvedValue({
      id: 'account-2',
      workspaceId: 'ws-1',
      name: 'UAH account',
      currency: 'UAH',
      isActive: true,
    });
    prisma.workspace.findUnique.mockResolvedValue({ primaryCurrency: 'UAH' });
    const transactionUpdate = jest.fn();
    const allocationDeleteMany = jest.fn();
    const paymentUpdate = jest.fn().mockResolvedValue(
      makePayment({
        accountId: 'account-2',
        amount: decimal(150),
        currency: 'UAH',
        paidAt: new Date('2026-08-03T10:00:00.000Z'),
        allocations: [
          {
            id: 'allocation-2',
            workspaceId: 'ws-1',
            telegramAdSalePaymentId: 'payment-1',
            telegramAdSalePlacementId: 'placement-1',
            amount: decimal(150),
            currency: 'UAH',
            amountInPrimaryCurrency: decimal(150),
            createdAt: new Date('2026-08-03T10:00:00.000Z'),
          },
        ],
      }),
    );
    prisma.$transaction.mockImplementation(async (callback: any) =>
      callback({
        transaction: { update: transactionUpdate },
        telegramAdSalePaymentAllocation: { deleteMany: allocationDeleteMany },
        telegramAdSalePayment: { update: paymentUpdate },
      }),
    );

    const updated = await service.updatePayment(
      'user-1',
      'sale-1',
      'payment-1',
      {
        accountId: 'account-2',
        amount: 150,
        currency: 'UAH',
        paidAt: '2026-08-03T10:00:00.000Z',
        notes: 'Updated payment',
        allocations: [{ placementId: 'placement-1', amount: 150 }],
      },
    );

    expect(transactionUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'tx-1' },
        data: expect.objectContaining({
          accountId: 'account-2',
          amount: decimal(150),
          currency: 'UAH',
          date: new Date('2026-08-03T10:00:00.000Z'),
          description: 'Updated payment',
        }),
      }),
    );
    expect(allocationDeleteMany).toHaveBeenCalledWith({
      where: { telegramAdSalePaymentId: 'payment-1' },
    });
    expect(paymentUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          accountId: 'account-2',
          amount: decimal(150),
          currency: 'UAH',
          allocations: {
            create: [
              expect.objectContaining({
                telegramAdSalePlacementId: 'placement-1',
                amount: decimal(150),
                currency: 'UAH',
              }),
            ],
          },
        }),
      }),
    );
    expect(updated.amount).toBe('150');
  });

  it('voids a payment by creating a reversal transaction', async () => {
    const { service, prisma } = createService();
    prisma.telegramAdSalePayment.findFirst.mockResolvedValue(
      makePayment({
        account: {
          id: 'account-1',
          name: 'Main account',
          currency: 'USD',
        },
      }),
    );
    prisma.transactionCategory.findFirst.mockResolvedValue({
      id: 'category-2',
      name: 'Telegram ad sales reversal',
    });
    prisma.$transaction.mockImplementation(async (callback: any) =>
      callback({
        transaction: {
          create: jest.fn().mockResolvedValue({
            id: 'reversal-tx-1',
          }),
        },
        telegramAdSalePayment: {
          update: jest.fn().mockResolvedValue(
            makePayment({
              status: TelegramAdSalePaymentStatus.VOIDED,
              voidReason: 'Refunded',
              voidedAt: new Date('2026-08-01T10:00:00.000Z'),
              reversalTransactionId: 'reversal-tx-1',
              reversalTransaction: {
                id: 'reversal-tx-1',
                date: new Date('2026-08-01T10:00:00.000Z'),
                amount: decimal(120),
                type: TransactionType.expense,
                category: 'Telegram ad sales reversal',
              },
            }),
          ),
        },
      }),
    );

    const voided = await service.voidPayment('user-1', 'sale-1', 'payment-1', {
      reason: 'Refunded',
    });

    expect(voided.status).toBe(TelegramAdSalePaymentStatus.VOIDED);
    expect(voided.reversalTransactionId).toBe('reversal-tx-1');
  });

  it('reconciles sale metrics and stores actual cpm from telegram snapshots', async () => {
    const { service, prisma } = createService();
    prisma.telegramAdSale.findFirst.mockResolvedValue(
      makeSale({
        placements: [
          makePlacement({
            status: TelegramAdPlacementStatus.PUBLISHED,
            publishedAt: new Date('2026-08-01T09:00:00.000Z'),
            agreedPrice: decimal(100),
            managedPostId: 'managed-post-1',
            telegramPostId: 'post-1',
          }),
        ],
      }),
    );
    prisma.telegramAdSalePlacement.findFirst.mockResolvedValue(
      makePlacement({
        status: TelegramAdPlacementStatus.PUBLISHED,
        publishedAt: new Date('2026-08-01T09:00:00.000Z'),
        agreedPrice: decimal(100),
        managedPostId: 'managed-post-1',
        telegramPostId: 'post-1',
        telegramPost: {
          id: 'post-1',
          postDate: new Date('2026-08-01T09:00:00.000Z'),
          viewsCount: 500,
        },
      }),
    );
    prisma.telegramPostMetricSnapshot.findMany.mockResolvedValue([
      {
        id: 'metric-1',
        collectedAt: new Date('2026-08-02T08:00:00.000Z'),
        viewsCount: 480,
      },
      {
        id: 'metric-2',
        collectedAt: new Date('2026-08-03T08:00:00.000Z'),
        viewsCount: 500,
      },
    ]);
    prisma.telegramAdSalePlacement.update.mockResolvedValue(undefined);

    const metrics = await service.saleMetrics('user-1', 'sale-1');

    expect(metrics.placements[0]).toMatchObject({
      placementId: 'placement-1',
      actualViewsFinal: 500,
      actualCpm: '200',
    });
    expect(prisma.telegramAdSalePlacement.update).toHaveBeenCalled();
  });

  it.each(['UNVERIFIED', 'MISMATCH', 'MISSING'])(
    'does not read metrics through an existing Telegram post for a %s managed identity',
    async (telegramIdVerificationStatus) => {
      const { service, prisma } = createService();
      prisma.telegramAdSale.findFirst.mockResolvedValue(
        makeSale({
          placements: [
            makePlacement({
              managedPostId: 'managed-post-1',
              telegramPostId: 'post-1',
            }),
          ],
        }),
      );
      prisma.telegramAdSalePlacement.findFirst.mockResolvedValue(
        makePlacement({
          managedPostId: 'managed-post-1',
          telegramPostId: 'post-1',
          managedPost: {
            id: 'managed-post-1',
            status: TelegramManagedPostStatus.PUBLISHED,
            telegramIdVerificationStatus,
            telegramMessageIds: ['42'],
          },
          telegramPost: {
            id: 'post-1',
            postDate: new Date('2026-08-01T09:00:00.000Z'),
            viewsCount: 999,
          },
        }),
      );

      const metrics = await service.saleMetrics('user-1', 'sale-1');

      expect(metrics.placements[0]).toMatchObject({
        actualViews24h: null,
        actualViews48h: null,
        actualViewsFinal: null,
        actualCpm: null,
      });
      expect(prisma.telegramPostMetricSnapshot.findMany).not.toHaveBeenCalled();
    },
  );

  it.each([
    ['UNVERIFIED', 'post-1'],
    ['MISMATCH', 'post-1'],
    ['MISSING', 'post-1'],
    ['UNVERIFIED', null],
    ['MISMATCH', null],
    ['MISSING', null],
  ])(
    'does not bind a %s managed identity during sale sync (existing Telegram post: %s)',
    async (telegramIdVerificationStatus, telegramPostId) => {
      const { service, prisma, telegramChannelsService } = createService();
      const placement = makePlacement({
        managedPostId: 'managed-post-1',
        telegramPostId,
      });
      jest
        .spyOn(service as any, 'getSaleDetails')
        .mockResolvedValue(makeSale({ placements: [placement] }));
      jest
        .spyOn(service as any, 'reconcilePlacementMetrics')
        .mockResolvedValue({
          actualViews24h: null,
          actualViews48h: null,
          actualViewsFinal: null,
          actualCpm: null,
        });
      prisma.telegramManagedPost.findFirst.mockResolvedValue({
        id: 'managed-post-1',
        status: TelegramManagedPostStatus.PUBLISHED,
        publishedAt: new Date('2026-08-01T09:00:00.000Z'),
        telegramIdVerificationStatus,
        telegramMessageIds: ['42'],
      });
      prisma.telegramAdSalePlacement.update.mockResolvedValue(undefined);

      await service.reconcileSale('user-1', 'sale-1');

      expect(telegramChannelsService.syncManagedPosts).toHaveBeenCalledWith(
        'user-1',
        'channel-1',
      );
      expect(prisma.telegramPost.findFirst).not.toHaveBeenCalled();
      const data = prisma.telegramAdSalePlacement.update.mock.calls[0][0].data;
      expect(data.status).toBeUndefined();
      expect(data.telegramPost).toEqual(
        telegramPostId ? { disconnect: true } : undefined,
      );
    },
  );

  it('builds workspace analytics summary from aggregated placements and alerts', async () => {
    const { service, prisma } = createService();
    prisma.telegramAdSalePlacement.aggregate.mockResolvedValue({
      _sum: { agreedPrice: decimal(75) },
    });

    const datasetSpy = jest
      .spyOn(service as any, 'adAnalyticsDataset')
      .mockResolvedValue({
        placements: [
          {
            ...makePlacement({
              telegramChannelId: 'channel-1',
              agreedPrice: decimal(150),
              minimumPrice: decimal(120),
              recommendedPrice: decimal(160),
              expectedViews: 1000,
              actualViewsFinal: 900,
              paymentAllocations: [
                {
                  amount: decimal(100),
                  amountInPrimaryCurrency: decimal(100),
                  payment: { status: TelegramAdSalePaymentStatus.ACTIVE },
                },
              ],
              sale: {
                id: 'sale-1',
                advertiserName: 'Advertiser',
                status: TelegramAdSaleStatus.CONFIRMED,
                createdAt: new Date('2026-07-01T00:00:00.000Z'),
                settlementCurrency: 'USD',
              },
            }),
          },
        ],
        channels: [{ id: 'channel-1', title: 'Channel One', username: 'one' }],
      } as any);
    jest.spyOn(service as any, 'inventorySlotsForChannels').mockResolvedValue([
      { channelId: 'channel-1', state: 'AVAILABLE', existingPlacement: null },
      {
        channelId: 'channel-1',
        state: 'SOLD',
        existingPlacement: { status: TelegramAdPlacementStatus.PUBLISHED },
      },
      { channelId: 'channel-1', state: 'PAST', existingPlacement: null },
    ]);
    const result = await service.analyticsSummary('user-1', {
      rangeDays: 30,
      networkId: 'network-1',
    });

    expect(result.paidRevenue).toBe('100');
    expect(result.currency).toBe('USD');
    expect(result.accountsReceivable).toBe('50');
    expect(result.revenuePreviousMonth).toBe('75');
    expect(result.monthOverMonthChangePercent).toBe(100);
    expect(result.bestChannelByRevenue?.channelId).toBe('channel-1');
    expect(result.paymentOverdueCount).toBe(1);
    expect(datasetSpy).toHaveBeenCalledWith(
      expect.objectContaining({ networkId: 'network-1' }),
    );
    expect(datasetSpy).toHaveBeenCalledTimes(1);
    expect(prisma.telegramAdSalePlacement.aggregate).toHaveBeenCalledTimes(1);
  });

  it('scopes analytics summary to selected channel ids', async () => {
    const { service } = createService();
    const datasetSpy = jest
      .spyOn(service as any, 'adAnalyticsDataset')
      .mockResolvedValue({
        placements: [],
        channels: [],
      } as any);
    jest
      .spyOn(service as any, 'inventorySlotsForChannels')
      .mockResolvedValue([]);

    await service.analyticsSummary('user-1', {
      rangeDays: 30,
      channelIds: ['channel-1', 'channel-2'],
    });

    expect(datasetSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        channelIds: ['channel-1', 'channel-2'],
      }),
    );
  });

  it('keeps one networkless current source for network-filtered channel cards', async () => {
    const { service, prisma, workspaceService } = createService();
    const datasetSpy = jest
      .spyOn(service as any, 'adAnalyticsDataset')
      .mockResolvedValue({ placements: [], channels: [] });
    jest
      .spyOn(service as any, 'inventorySlotsForChannels')
      .mockResolvedValue([]);
    jest.spyOn(service as any, 'loadInventorySnapshots').mockResolvedValue([]);
    jest
      .spyOn((service as any).pricingReader, 'latestSnapshotsForChannels')
      .mockResolvedValue(new Map());
    prisma.telegramChannel.findMany.mockResolvedValue([
      { id: 'channel-1', title: 'One', photoUrl: null },
      { id: 'channel-2', title: 'Two', photoUrl: null },
    ]);

    const result = await service.analyticsOverview('user-1', {
      channelIds: ['channel-1', 'channel-2'],
      networkId: 'network-1',
    });

    expect(result.channels.map((channel) => channel.channelId)).toEqual([
      'channel-1',
      'channel-2',
    ]);
    expect(datasetSpy).toHaveBeenCalledTimes(2);
    expect(datasetSpy).toHaveBeenCalledWith(
      expect.objectContaining({ channelIds: ['channel-1', 'channel-2'] }),
    );
    expect(prisma.telegramAdSalePlacement.aggregate).toHaveBeenCalledTimes(1);
    expect(workspaceService.resolveWorkspaceIdForUser).toHaveBeenCalledTimes(1);
  });

  it('rejects analytics over the selected-channel limit instead of truncating', async () => {
    const { service, workspaceService } = createService();

    await expect(
      service.analyticsOverview('user-1', {
        channelIds: Array.from({ length: 7 }, (_, index) => `channel-${index}`),
      }),
    ).rejects.toThrow('Analytics supports at most 6 selected channels');

    expect(workspaceService.resolveWorkspaceIdForUser).not.toHaveBeenCalled();
  });

  it('expands the analytics overview to the full sale history when requested', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-08-26T12:00:00.000Z'));
    const { service, prisma } = createService();
    prisma.workspace.findUnique.mockResolvedValue({ id: 'ws-1' });
    prisma.telegramAdSale.findFirst.mockResolvedValue({
      createdAt: new Date('2024-01-10T09:00:00.000Z'),
    });
    prisma.telegramAdSalePlacement.findFirst.mockResolvedValue({
      scheduledAt: new Date('2023-12-20T18:00:00.000Z'),
    });
    const datasetSpy = jest
      .spyOn(service as any, 'adAnalyticsDataset')
      .mockResolvedValue({ placements: [], channels: [] });
    jest
      .spyOn(service as any, 'inventorySlotsForChannels')
      .mockResolvedValue([]);
    jest.spyOn(service as any, 'loadInventorySnapshots').mockResolvedValue([]);
    jest
      .spyOn(service as any, 'resolveAnalyticsChannelIds')
      .mockResolvedValue([]);

    await service.analyticsOverview('user-1', { allTime: true });

    expect(datasetSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        from: new Date('2023-12-20T00:00:00.000Z'),
        to: new Date('2026-08-26T12:00:00.000Z'),
      }),
    );
    expect(prisma.telegramAdSale.findFirst).toHaveBeenCalledWith({
      where: { workspaceId: 'ws-1' },
      orderBy: { createdAt: 'asc' },
      select: { createdAt: true },
    });
    jest.useRealTimers();
  });

  it('builds channel analytics with revenue, fill rate, and recent sales', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-08-08T12:00:00.000Z'));
    const { service, prisma } = createService();
    prisma.telegramChannel.findFirst.mockResolvedValueOnce({
      id: 'channel-1',
      workspaceId: 'ws-1',
      title: 'Channel One',
      username: 'one',
      timePosts: [],
    });
    prisma.telegramAdPriceSnapshot.findMany.mockResolvedValue([
      {
        id: 'snapshot-1',
        expectedViews: 1800,
        recommendedPrice: decimal(180),
        minimumPrice: decimal(140),
      },
    ]);
    jest.spyOn(service as any, 'adAnalyticsDataset').mockResolvedValue({
      placements: [
        {
          ...makePlacement({
            status: TelegramAdPlacementStatus.PUBLISHED,
            telegramChannelId: 'channel-1',
            agreedPrice: decimal(150),
            recommendedPrice: decimal(180),
            minimumPrice: decimal(140),
            expectedViews: 1000,
            actualViews24h: 700,
            actualViews48h: 850,
            actualViewsFinal: 900,
            paymentAllocations: [
              {
                amount: decimal(120),
                amountInPrimaryCurrency: decimal(120),
                payment: { status: TelegramAdSalePaymentStatus.ACTIVE },
              },
            ],
            sale: {
              id: 'sale-1',
              advertiserName: 'Advertiser',
              status: TelegramAdSaleStatus.CONFIRMED,
              createdAt: new Date('2026-07-20T00:00:00.000Z'),
              settlementCurrency: 'USD',
            },
          }),
        },
      ],
      payments: [],
      channels: [{ id: 'channel-1', title: 'Channel One', username: 'one' }],
    } as any);
    jest.spyOn(service as any, 'inventorySlotsForChannels').mockResolvedValue([
      {
        channelId: 'channel-1',
        state: 'PAST',
        scheduledAt: new Date('2026-08-01T10:00:00.000Z'),
        minimumPrice: '0',
        existingPlacement: null,
      },
      {
        channelId: 'channel-1',
        state: 'SOLD',
        scheduledAt: new Date('2026-08-02T10:00:00.000Z'),
        minimumPrice: '140',
        existingPlacement: { status: TelegramAdPlacementStatus.PUBLISHED },
      },
    ]);

    const result = await service.channelAnalytics('user-1', 'channel-1', {
      rangeDays: 30,
    });

    expect(result.revenue.totalAgreedRevenue).toBe('150');
    expect(result.revenue.currency).toBe('USD');
    expect(result.revenue.totalPaidRevenue).toBe('120');
    expect(result.revenue.elapsedMinimumRevenue).toBe('140');
    expect(result.revenue.elapsedSoldRevenue).toBe('150');
    expect(result.revenue.elapsedRevenueGap).toBe('0');
    expect(result.placements.slotsEligible).toBe(2);
    expect(result.placements.slotFillRate).toBe(50);
    expect(result.performance.actualViewsFinal).toBe(900);
    expect(result.recentSales[0]?.advertiserName).toBe('Advertiser');
  });

  it('calculates elapsed plan versus sold revenue only for past selected-period placements', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-08-08T12:00:00.000Z'));
    const { service, prisma } = createService();
    prisma.telegramChannel.findFirst.mockResolvedValueOnce({
      id: 'channel-1',
      workspaceId: 'ws-1',
      title: 'Channel One',
      username: 'one',
      timePosts: [],
    });
    prisma.telegramAdPriceSnapshot.findMany.mockResolvedValue([]);
    jest.spyOn(service as any, 'adAnalyticsDataset').mockResolvedValue({
      placements: [
        makePlacement({
          id: 'placement-past-1',
          status: TelegramAdPlacementStatus.PUBLISHED,
          telegramChannelId: 'channel-1',
          scheduledAt: new Date('2026-08-06T10:00:00.000Z'),
          minimumPrice: decimal(100),
          agreedPrice: decimal(60),
          sale: makeSale({
            id: 'sale-past-1',
            status: TelegramAdSaleStatus.CONFIRMED,
            settlementCurrency: 'USD',
          }),
        }),
        makePlacement({
          id: 'placement-past-2',
          status: TelegramAdPlacementStatus.COMPLETED,
          telegramChannelId: 'channel-1',
          scheduledAt: new Date('2026-08-07T10:00:00.000Z'),
          minimumPrice: decimal(75),
          agreedPrice: decimal(60),
          sale: makeSale({
            id: 'sale-past-2',
            status: TelegramAdSaleStatus.CONFIRMED,
            settlementCurrency: 'USD',
          }),
        }),
        makePlacement({
          id: 'placement-future',
          status: TelegramAdPlacementStatus.SCHEDULED,
          telegramChannelId: 'channel-1',
          scheduledAt: new Date('2026-08-09T10:00:00.000Z'),
          minimumPrice: decimal(70),
          agreedPrice: decimal(60),
          sale: makeSale({
            id: 'sale-future',
            status: TelegramAdSaleStatus.CONFIRMED,
            settlementCurrency: 'USD',
          }),
        }),
      ],
      payments: [],
      channels: [{ id: 'channel-1', title: 'Channel One', username: 'one' }],
    } as any);
    jest.spyOn(service as any, 'inventorySlotsForChannels').mockResolvedValue([
      {
        channelId: 'channel-1',
        state: 'SOLD',
        scheduledAt: new Date('2026-08-06T10:00:00.000Z'),
        minimumPrice: '100',
        existingPlacement: { status: TelegramAdPlacementStatus.PUBLISHED },
      },
      {
        channelId: 'channel-1',
        state: 'SOLD',
        scheduledAt: new Date('2026-08-07T10:00:00.000Z'),
        minimumPrice: '75',
        existingPlacement: { status: TelegramAdPlacementStatus.COMPLETED },
      },
      {
        channelId: 'channel-1',
        state: 'AVAILABLE',
        scheduledAt: new Date('2026-08-09T10:00:00.000Z'),
        minimumPrice: '70',
        existingPlacement: null,
      },
    ]);

    const result = await service.channelAnalytics('user-1', 'channel-1', {
      dateFrom: '2026-08-01T00:00:00.000Z',
      dateTo: '2026-08-31T23:59:59.999Z',
    });

    expect(result.revenue.elapsedMinimumRevenue).toBe('175');
    expect(result.revenue.elapsedSoldRevenue).toBe('120');
    expect(result.revenue.elapsedRevenueGap).toBe('55');
  });

  it('uses elapsed inventory slots for plan revenue when a channel has no sales', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-08-08T12:00:00.000Z'));
    const { service, prisma } = createService();
    prisma.telegramChannel.findFirst.mockResolvedValueOnce({
      id: 'channel-1',
      workspaceId: 'ws-1',
      title: 'Channel One',
      username: 'one',
      timePosts: [],
    });
    prisma.telegramAdPriceSnapshot.findMany.mockResolvedValue([]);
    jest.spyOn(service as any, 'adAnalyticsDataset').mockResolvedValue({
      placements: [],
      payments: [],
      channels: [{ id: 'channel-1', title: 'Channel One', username: 'one' }],
    } as any);
    jest.spyOn(service as any, 'inventorySlotsForChannels').mockResolvedValue([
      {
        channelId: 'channel-1',
        state: 'PAST',
        scheduledAt: new Date('2026-08-06T10:00:00.000Z'),
        minimumPrice: '100',
        currency: 'UAH',
        existingPlacement: null,
      },
    ]);

    const result = await service.channelAnalytics('user-1', 'channel-1', {
      dateFrom: '2026-08-01T00:00:00.000Z',
      dateTo: '2026-08-31T23:59:59.999Z',
    });

    expect(result.revenue.currency).toBe('UAH');
    expect(result.revenue.elapsedMinimumRevenue).toBe('100');
    expect(result.revenue.elapsedSoldRevenue).toBe('0');
    expect(result.revenue.elapsedRevenueGap).toBe('100');
  });

  it('keeps availability stable when product prices are hydrated as strings', async () => {
    const { service, prisma } = createService();
    prisma.telegramChannel.findMany.mockResolvedValue([
      {
        id: 'channel-1',
        workspaceId: 'ws-1',
        title: 'Channel One',
        username: 'one',
        language: 'UTC',
        timePosts: [{ time: '12:00', position: 0 }],
      },
    ]);
    prisma.telegramAdSchedulePolicy.findMany.mockResolvedValue([
      {
        telegramChannelId: 'channel-1',
        timezone: 'UTC',
        expectedOrganicPostsPerDay: null,
        useWorkspaceDefault: false,
        organicPostsPerAdSlot: 1,
        slotStrategy: 'FIXED_TIMES',
        fallbackSlotTimes: ['10:00'],
        allowManualSlots: false,
        maxAdsPerDay: 3,
        minHoursBetweenAds: 0,
        minDaysBetweenAds: 0,
      },
    ]);
    prisma.telegramAdProduct.findMany.mockResolvedValue([
      {
        id: 'product-1',
        telegramChannelId: 'channel-1',
        topDurationMinutes: 60,
        defaultPricingMode: TelegramAdPricingMode.CPM,
        defaultCpm: decimal(12),
        currency: 'USD',
        defaultFixedPrice: '125.50',
        minimumPrice: '100.25',
      },
    ]);
    prisma.telegramAdSchedulePolicy.findFirst.mockResolvedValue({
      id: 'policy-1',
      workspaceId: 'ws-1',
      telegramChannelId: 'channel-1',
      timezone: 'UTC',
      autoFrequencyEnabled: true,
      expectedOrganicPostsPerDay: null,
      useWorkspaceDefault: false,
      organicPostsPerAdSlot: 1,
      maxAdsPerDay: 3,
      minHoursBetweenAds: 0,
      minDaysBetweenAds: 0,
      slotStrategy: 'BEFORE_ORGANIC_POST',
      fallbackSlotTimes: [],
      allowManualSlots: false,
      createdAt: new Date('2026-08-01T00:00:00.000Z'),
      updatedAt: new Date('2026-08-01T00:00:00.000Z'),
    });
    prisma.telegramPost.findMany.mockResolvedValue([
      {
        id: 'post-1',
        telegramChannelId: 'channel-1',
        telegramMessageId: '100',
        postDate: new Date('2026-08-01T08:00:00.000Z'),
      },
    ]);
    prisma.telegramAdSalePlacement.findMany.mockResolvedValue([]);
    prisma.telegramManagedPost.findMany.mockResolvedValue([]);

    mockPricingPreview(service);

    const result = await service.availability('user-1', {
      from: '2026-08-01T00:00:00.000Z',
      to: '2026-08-01T23:59:59.000Z',
      channelIds: ['channel-1'],
    });

    expect(result.slots[0]).toMatchObject({
      channelId: 'channel-1',
      recommendedPrice: '18',
      minimumPrice: '18',
      currency: 'USD',
    });
  });

  it('seeds default channel formats before listing products', async () => {
    const { service, prisma } = createService();
    prisma.telegramChannel.findFirst.mockResolvedValue({
      id: 'channel-1',
      workspaceId: 'ws-1',
      title: 'Channel One',
      username: 'one',
      adBaseCurrency: 'USD',
      timePosts: [],
    });
    prisma.telegramAdProduct.findMany
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        {
          id: 'product-1',
          workspaceId: 'ws-1',
          telegramChannelId: 'channel-1',
          name: '1/24',
          description: null,
          topDurationMinutes: 60,
          feedDurationHours: 24,
          deleteAfterHours: 24,
          isPermanent: false,
          defaultPricingMode: TelegramAdPricingMode.CPM,
          defaultCpm: null,
          defaultFixedPrice: null,
          minimumPrice: null,
          currency: 'USD',
          isActive: true,
          position: 0,
          createdAt: new Date('2026-08-01T00:00:00.000Z'),
          updatedAt: new Date('2026-08-01T00:00:00.000Z'),
        },
      ]);
    prisma.telegramAdProduct.createMany.mockResolvedValue({ count: 4 });

    mockPricingPreview(service, {
      pricingWindowHours: 24,
      pricingWindowLabel: '24h placement',
      expectedViews: 300,
      recommendedPrice: '15',
    });

    const result = await service.listChannelProducts('user-1', 'channel-1');

    expect(prisma.telegramAdProduct.createMany).toHaveBeenCalledWith(
      expect.objectContaining({
        skipDuplicates: true,
        data: expect.arrayContaining([
          expect.objectContaining({ name: '1/24' }),
          expect.objectContaining({ name: '2/48' }),
          expect.objectContaining({ name: '3/72' }),
          expect.objectContaining({
            name: 'No auto-delete',
            isPermanent: true,
          }),
        ]),
      }),
    );
    expect(result[0]?.name).toBe('1/24');
  });

  it('loads products for multiple channels in one workspace-scoped query', async () => {
    const { service, prisma } = createService();
    prisma.telegramChannel.findMany.mockResolvedValue([
      {
        id: 'channel-1',
        workspaceId: 'ws-1',
        adBaseCurrency: 'USD',
      },
      {
        id: 'channel-2',
        workspaceId: 'ws-1',
        adBaseCurrency: 'UAH',
      },
    ]);
    mockPricingPreview(service, {
      pricingWindowHours: 24,
      pricingWindowLabel: '24h placement',
      expectedViews: 300,
      recommendedPrice: '15',
    });
    prisma.telegramAdProduct.findMany.mockResolvedValue([
      {
        id: 'product-1',
        workspaceId: 'ws-1',
        telegramChannelId: 'channel-1',
        name: '1/24',
        description: null,
        topDurationMinutes: 60,
        feedDurationHours: 24,
        deleteAfterHours: 24,
        isPermanent: false,
        defaultPricingMode: TelegramAdPricingMode.CPM,
        defaultCpm: null,
        defaultFixedPrice: null,
        minimumPrice: null,
        currency: 'USD',
        isActive: true,
        position: 0,
        createdAt: new Date('2026-08-01T00:00:00.000Z'),
        updatedAt: new Date('2026-08-01T00:00:00.000Z'),
      },
    ]);

    const result = await service.listProductsByChannels('user-1', [
      'channel-1',
      'channel-2',
      'channel-1',
    ]);

    expect(prisma.telegramChannel.findMany).toHaveBeenCalledWith({
      where: {
        workspaceId: 'ws-1',
        id: { in: ['channel-1', 'channel-2'] },
      },
    });
    expect(prisma.telegramAdProduct.findMany).toHaveBeenCalledTimes(2);
    expect(prisma.telegramAdProduct.createMany).toHaveBeenCalledTimes(1);
    expect(Object.keys(result)).toEqual(['channel-1', 'channel-2']);
    expect(result['channel-1']).toHaveLength(1);
    expect(result['channel-2']).toEqual([]);
  });

  it('carries cadence across days but caps a busy day at the channel typical frequency', async () => {
    const { service, prisma } = createService();
    prisma.telegramChannel.findMany.mockResolvedValue([
      {
        id: 'channel-1',
        workspaceId: 'ws-1',
        title: 'Channel One',
        username: 'one',
        language: 'UTC',
        timePosts: [{ time: '12:00', position: 0 }],
      },
    ]);
    prisma.telegramAdProduct.findMany.mockResolvedValue([]);
    prisma.telegramAdSchedulePolicy.findFirst.mockResolvedValue({
      id: 'policy-1',
      workspaceId: 'ws-1',
      telegramChannelId: 'channel-1',
      timezone: 'UTC',
      autoFrequencyEnabled: true,
      expectedOrganicPostsPerDay: null,
      useWorkspaceDefault: false,
      organicPostsPerAdSlot: 3,
      maxAdsPerDay: 10,
      minHoursBetweenAds: 0,
      minDaysBetweenAds: 0,
      slotStrategy: 'BEFORE_ORGANIC_POST',
      fallbackSlotTimes: [],
      allowManualSlots: false,
      createdAt: new Date('2026-08-01T00:00:00.000Z'),
      updatedAt: new Date('2026-08-01T00:00:00.000Z'),
    });
    prisma.telegramPost.findMany.mockResolvedValue([
      {
        id: 'post-1',
        telegramChannelId: 'channel-1',
        telegramMessageId: '101',
        postDate: new Date('2026-07-31T08:00:00.000Z'),
      },
      {
        id: 'post-2',
        telegramChannelId: 'channel-1',
        telegramMessageId: '102',
        postDate: new Date('2026-07-31T14:00:00.000Z'),
      },
      {
        id: 'post-3',
        telegramChannelId: 'channel-1',
        telegramMessageId: '103',
        postDate: new Date('2026-08-01T08:00:00.000Z'),
      },
      {
        id: 'post-4',
        telegramChannelId: 'channel-1',
        telegramMessageId: '104',
        postDate: new Date('2026-08-01T12:00:00.000Z'),
      },
      {
        id: 'post-5',
        telegramChannelId: 'channel-1',
        telegramMessageId: '105',
        postDate: new Date('2026-08-01T16:00:00.000Z'),
      },
      {
        id: 'post-6',
        telegramChannelId: 'channel-1',
        telegramMessageId: '106',
        postDate: new Date('2026-08-01T20:00:00.000Z'),
      },
    ]);
    prisma.telegramAdSalePlacement.findMany.mockResolvedValue([]);
    prisma.telegramManagedPost.findMany.mockResolvedValue([]);

    mockPricingPreview(service);

    const result = await service.availability('user-1', {
      from: '2026-07-31T00:00:00.000Z',
      to: '2026-08-01T23:59:59.000Z',
      channelIds: ['channel-1'],
    });

    const slotsByDate = result.slots.reduce<Record<string, number>>(
      (acc, slot) => {
        acc[slot.date] = (acc[slot.date] ?? 0) + 1;
        return acc;
      },
      {},
    );

    expect(slotsByDate['2026-07-31'] ?? 0).toBe(1);
    expect(slotsByDate['2026-08-01'] ?? 0).toBe(1);
  });

  it('keeps slots for a slower selected channel by accumulating its daily posts', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-08-02T00:00:00.000Z'));
    const { service, prisma } = createService();
    prisma.telegramChannel.findMany.mockResolvedValue([
      {
        id: 'channel-business',
        workspaceId: 'ws-1',
        title: 'Business Patterns',
        username: 'business_patterns',
        language: 'UTC',
        adBaseCurrency: 'USD',
        timePosts: [{ time: '12:00', position: 0 }],
      },
    ]);
    prisma.telegramAdProduct.findMany.mockResolvedValue([]);
    prisma.telegramAdSchedulePolicy.findFirst.mockResolvedValue({
      id: 'policy-business',
      workspaceId: 'ws-1',
      telegramChannelId: 'channel-business',
      timezone: 'UTC',
      autoFrequencyEnabled: true,
      expectedOrganicPostsPerDay: null,
      useWorkspaceDefault: false,
      organicPostsPerAdSlot: 3,
      maxAdsPerDay: 10,
      minHoursBetweenAds: 0,
      minDaysBetweenAds: 0,
      slotStrategy: 'BEFORE_ORGANIC_POST',
      fallbackSlotTimes: [],
      allowManualSlots: false,
      createdAt: new Date('2026-08-01T00:00:00.000Z'),
      updatedAt: new Date('2026-08-01T00:00:00.000Z'),
    });
    prisma.telegramPost.findMany.mockResolvedValue([]);
    prisma.telegramAdSalePlacement.findMany.mockResolvedValue([]);
    prisma.telegramManagedPost.findMany.mockResolvedValue([]);

    mockPricingPreview(service);

    const result = await service.availability('user-1', {
      from: '2026-08-03T00:00:00.000Z',
      to: '2026-08-08T23:59:59.000Z',
      channelIds: ['channel-business'],
    });

    expect(result.slots.map((slot) => slot.date)).toEqual([
      '2026-08-03',
      '2026-08-04',
      '2026-08-05',
      '2026-08-06',
      '2026-08-07',
      '2026-08-08',
    ]);
    jest.useRealTimers();
  });

  it('shows sold placements without adding a missed slot on past sold days', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-09-01T00:00:00.000Z'));
    const { service, prisma } = createService();
    prisma.telegramChannel.findMany.mockResolvedValue([
      {
        id: 'channel-1',
        workspaceId: 'ws-1',
        title: 'Mentor',
        username: 'mentor',
        language: 'UTC',
        adBaseCurrency: 'USD',
        timePosts: [],
      },
    ]);
    prisma.telegramAdProduct.findMany.mockResolvedValue([]);
    prisma.telegramAdSchedulePolicy.findFirst.mockResolvedValue({
      id: 'policy-1',
      workspaceId: 'ws-1',
      telegramChannelId: 'channel-1',
      timezone: 'UTC',
      autoFrequencyEnabled: true,
      expectedOrganicPostsPerDay: null,
      useWorkspaceDefault: false,
      organicPostsPerAdSlot: 3,
      maxAdsPerDay: 1,
      minHoursBetweenAds: 0,
      minDaysBetweenAds: 0,
      slotStrategy: 'BEFORE_ORGANIC_POST',
      fallbackSlotTimes: [],
      allowManualSlots: false,
      createdAt: new Date('2026-08-01T00:00:00.000Z'),
      updatedAt: new Date('2026-08-01T00:00:00.000Z'),
    });
    prisma.telegramPost.findMany.mockResolvedValue([]);
    prisma.telegramManagedPost.findMany.mockResolvedValue([]);
    prisma.telegramAdSalePlacement.findMany.mockResolvedValue([
      makePlacement({
        id: 'placement-18',
        telegramAdSaleId: 'sale-18',
        status: TelegramAdPlacementStatus.PUBLISHED,
        scheduledAt: new Date('2026-08-31T18:00:00.000Z'),
      }),
      makePlacement({
        id: 'placement-20',
        telegramAdSaleId: 'sale-20',
        status: TelegramAdPlacementStatus.PUBLISHED,
        scheduledAt: new Date('2026-08-31T20:00:00.000Z'),
      }),
    ]);
    mockPricingPreview(service);

    const result = await service.availability('user-1', {
      from: '2026-08-31T00:00:00.000Z',
      to: '2026-08-31T23:59:59.000Z',
      channelIds: ['channel-1'],
    });

    const daySlots = result.slots.filter((slot) => slot.date === '2026-08-31');
    expect(daySlots.filter((slot) => slot.existingPlacement)).toHaveLength(2);
    expect(daySlots).toHaveLength(2);
    expect(daySlots.some((slot) => slot.state === 'PAST')).toBe(false);
    jest.useRealTimers();
  });

  it('offers an extra future slot even when cadence produced no slots', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-08-01T00:00:00.000Z'));
    const { service, prisma } = createService();
    prisma.telegramChannel.findMany.mockResolvedValue([
      {
        id: 'channel-1',
        workspaceId: 'ws-1',
        title: 'Mentor',
        username: 'mentor',
        language: 'UTC',
        adBaseCurrency: 'USD',
        timePosts: [],
      },
    ]);
    prisma.telegramAdProduct.findMany.mockResolvedValue([]);
    prisma.telegramAdSchedulePolicy.findFirst.mockResolvedValue({
      id: 'policy-1',
      workspaceId: 'ws-1',
      telegramChannelId: 'channel-1',
      timezone: 'UTC',
      autoFrequencyEnabled: true,
      expectedOrganicPostsPerDay: null,
      useWorkspaceDefault: false,
      organicPostsPerAdSlot: 3,
      maxAdsPerDay: 1,
      minHoursBetweenAds: 0,
      minDaysBetweenAds: 0,
      slotStrategy: 'BEFORE_ORGANIC_POST',
      fallbackSlotTimes: [],
      allowManualSlots: false,
      createdAt: new Date('2026-08-01T00:00:00.000Z'),
      updatedAt: new Date('2026-08-01T00:00:00.000Z'),
    });
    prisma.telegramPost.findMany.mockResolvedValue([]);
    prisma.telegramManagedPost.findMany.mockResolvedValue([]);
    prisma.telegramAdSalePlacement.findMany.mockResolvedValue([
      makePlacement({
        id: 'placement-18',
        telegramAdSaleId: 'sale-18',
        status: TelegramAdPlacementStatus.PUBLISHED,
        scheduledAt: new Date('2026-08-31T18:00:00.000Z'),
      }),
    ]);
    mockPricingPreview(service);

    const result = await service.availability('user-1', {
      from: '2026-08-31T00:00:00.000Z',
      to: '2026-08-31T23:59:59.000Z',
      channelIds: ['channel-1'],
    });

    const daySlots = result.slots.filter((slot) => slot.date === '2026-08-31');
    expect(daySlots.filter((slot) => slot.existingPlacement)).toHaveLength(1);
    expect(daySlots.some((slot) => slot.state === 'AVAILABLE')).toBe(true);
    jest.useRealTimers();
  });

  it('projects future ad slots from posting cadence when future organic posts are not scheduled yet', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-08-02T00:00:00.000Z'));
    const { service, prisma } = createService();
    prisma.telegramChannel.findMany.mockResolvedValue([
      {
        id: 'channel-1',
        workspaceId: 'ws-1',
        title: 'Channel One',
        username: 'one',
        language: 'UTC',
        adBaseCurrency: 'USD',
        timePosts: [
          { time: '08:00', position: 0 },
          { time: '12:00', position: 1 },
          { time: '16:00', position: 2 },
        ],
      },
    ]);
    prisma.telegramAdProduct.findMany
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        {
          id: 'product-1',
          telegramChannelId: 'channel-1',
          topDurationMinutes: 60,
          defaultPricingMode: TelegramAdPricingMode.CPM,
          defaultCpm: decimal(12),
          currency: 'USD',
          defaultFixedPrice: null,
          minimumPrice: null,
          isActive: true,
          position: 0,
        },
      ]);
    prisma.telegramAdProduct.createMany.mockResolvedValue({ count: 3 });
    prisma.telegramAdSchedulePolicy.findFirst.mockResolvedValue({
      id: 'policy-1',
      workspaceId: 'ws-1',
      telegramChannelId: 'channel-1',
      timezone: 'UTC',
      autoFrequencyEnabled: true,
      expectedOrganicPostsPerDay: null,
      useWorkspaceDefault: false,
      organicPostsPerAdSlot: 3,
      maxAdsPerDay: 10,
      minHoursBetweenAds: 0,
      minDaysBetweenAds: 0,
      slotStrategy: 'BEFORE_ORGANIC_POST',
      fallbackSlotTimes: [],
      allowManualSlots: false,
      createdAt: new Date('2026-08-01T00:00:00.000Z'),
      updatedAt: new Date('2026-08-01T00:00:00.000Z'),
    });
    prisma.telegramPost.findMany.mockResolvedValue([
      {
        id: 'post-1',
        telegramChannelId: 'channel-1',
        telegramMessageId: '101',
        postDate: new Date('2026-08-01T08:00:00.000Z'),
      },
      {
        id: 'post-2',
        telegramChannelId: 'channel-1',
        telegramMessageId: '102',
        postDate: new Date('2026-08-01T12:00:00.000Z'),
      },
      {
        id: 'post-3',
        telegramChannelId: 'channel-1',
        telegramMessageId: '103',
        postDate: new Date('2026-08-01T16:00:00.000Z'),
      },
    ]);
    prisma.telegramAdSalePlacement.findMany.mockResolvedValue([]);
    prisma.telegramManagedPost.findMany.mockResolvedValue([]);

    mockPricingPreview(service);

    const result = await service.availability('user-1', {
      from: '2026-08-03T00:00:00.000Z',
      to: '2026-08-05T23:59:59.000Z',
      channelIds: ['channel-1'],
    });

    const slotsByDate = result.slots.reduce<Record<string, number>>(
      (acc, slot) => {
        acc[slot.date] = (acc[slot.date] ?? 0) + 1;
        return acc;
      },
      {},
    );

    expect(slotsByDate['2026-08-03'] ?? 0).toBe(1);
    expect(slotsByDate['2026-08-04'] ?? 0).toBe(1);
    expect(slotsByDate['2026-08-05'] ?? 0).toBe(1);
    jest.useRealTimers();
  });

  it('keeps the final local day availability when the request to-date is midnight UTC for that local day', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-08-02T20:00:00.000Z'));
    const { service, prisma } = createService();
    prisma.telegramChannel.findMany.mockResolvedValue([
      {
        id: 'channel-1',
        workspaceId: 'ws-1',
        title: 'Channel One',
        username: 'one',
        language: 'UTC',
        timePosts: [{ time: '12:00', position: 0 }],
      },
    ]);
    prisma.telegramAdProduct.findMany.mockResolvedValue([]);
    prisma.telegramAdSchedulePolicy.findFirst.mockResolvedValue({
      id: 'policy-1',
      workspaceId: 'ws-1',
      telegramChannelId: 'channel-1',
      timezone: 'Europe/Warsaw',
      autoFrequencyEnabled: true,
      expectedOrganicPostsPerDay: null,
      useWorkspaceDefault: false,
      organicPostsPerAdSlot: 3,
      maxAdsPerDay: 10,
      minHoursBetweenAds: 0,
      minDaysBetweenAds: 0,
      slotStrategy: 'BEFORE_ORGANIC_POST',
      fallbackSlotTimes: [],
      allowManualSlots: false,
      createdAt: new Date('2026-08-01T00:00:00.000Z'),
      updatedAt: new Date('2026-08-01T00:00:00.000Z'),
    });
    prisma.telegramPost.findMany.mockResolvedValue([
      {
        id: 'post-1',
        telegramChannelId: 'channel-1',
        telegramMessageId: '101',
        postDate: new Date('2026-08-02T04:15:00.000Z'),
      },
      {
        id: 'post-2',
        telegramChannelId: 'channel-1',
        telegramMessageId: '102',
        postDate: new Date('2026-08-02T08:15:00.000Z'),
      },
      {
        id: 'post-3',
        telegramChannelId: 'channel-1',
        telegramMessageId: '103',
        postDate: new Date('2026-08-02T13:15:00.000Z'),
      },
      {
        id: 'post-4',
        telegramChannelId: 'channel-1',
        telegramMessageId: '104',
        postDate: new Date('2026-08-02T15:30:00.000Z'),
      },
    ]);
    prisma.telegramAdSalePlacement.findMany.mockResolvedValue([]);
    prisma.telegramManagedPost.findMany.mockResolvedValue([]);

    mockPricingPreview(service);

    const result = await service.availability('user-1', {
      from: '2026-08-01T22:00:00.000Z',
      to: '2026-08-01T22:00:00.000Z',
      channelIds: ['channel-1'],
    });

    expect(
      result.summaries.find(
        (summary) =>
          summary.channelId === 'channel-1' && summary.date === '2026-08-02',
      ),
    ).toMatchObject({
      organicPostsCountForDay: 4,
      adsCountForDay: 1,
    });
    expect(
      result.slots.filter(
        (slot) => slot.channelId === 'channel-1' && slot.date === '2026-08-02',
      ),
    ).toHaveLength(1);
    expect(
      result.slots.find(
        (slot) => slot.channelId === 'channel-1' && slot.date === '2026-08-02',
      )?.state,
    ).toBe('AVAILABLE');
    jest.useRealTimers();
  });
});
