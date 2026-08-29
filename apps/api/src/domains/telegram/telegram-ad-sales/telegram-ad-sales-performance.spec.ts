import {
  Prisma,
  TelegramAdPricingMode,
  TelegramAdSlotStrategy,
} from '@prisma/client';
import {
  AD_SALES_PRICING_CHANNEL_BATCH_SIZE,
  MAX_AD_SALES_PRICING_POSTS_PER_CHANNEL,
  STANDARD_AD_SALES_PRICING_ROWS_PER_POST,
  STANDARD_AD_SALES_PRICING_WINDOW_HOURS,
  TelegramAdSalesPricingReader,
} from './telegram-ad-sales-pricing-reader';
import { TelegramAdSalesService } from './telegram-ad-sales.service';

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

function createPerformanceService() {
  const prisma = {
    workspace: {
      findUniqueOrThrow: jest.fn().mockResolvedValue({ timezone: 'UTC' }),
    },
    telegramChannel: { findMany: jest.fn(), findFirst: jest.fn() },
    telegramChannelNetwork: { findFirst: jest.fn() },
    telegramAdProduct: {
      findMany: jest.fn(),
      createMany: jest.fn(),
    },
    telegramAdSchedulePolicy: { findFirst: jest.fn(), findMany: jest.fn() },
    telegramAdSalesWorkspaceSettings: {
      findUnique: jest.fn().mockResolvedValue({
        workspaceId: 'ws-1',
        defaultOrganicPostsPerAdSlot: 3,
        createdAt: new Date('2026-08-01T00:00:00.000Z'),
        updatedAt: new Date('2026-08-01T00:00:00.000Z'),
      }),
      create: jest.fn(),
      upsert: jest.fn(),
    },
    telegramAdSalePlacement: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
      aggregate: jest.fn().mockResolvedValue({
        _sum: { agreedPrice: decimal(0) },
      }),
    },
    telegramAdSalePayment: { findMany: jest.fn() },
    telegramAdSale: { findFirst: jest.fn() },
    telegramAdPriceSnapshot: { findMany: jest.fn() },
    telegramAdInventoryDailySnapshot: { findMany: jest.fn() },
    telegramPost: { findMany: jest.fn() },
    telegramManagedPost: { findMany: jest.fn() },
    $queryRaw: jest.fn(),
  };
  const workspaceService = {
    resolveWorkspaceIdForUser: jest.fn().mockResolvedValue('ws-1'),
  };
  const responseCache = {
    getOrSet: jest.fn(
      async (_key: string, _ttl: number, load: () => Promise<unknown>) =>
        load(),
    ),
    clearByPrefix: jest.fn(),
  };
  const noop = {} as never;
  const service = new TelegramAdSalesService(
    prisma as never,
    workspaceService as never,
    { info: jest.fn() } as never,
    responseCache as never,
    noop,
    noop,
    noop,
    noop,
    noop,
    noop,
    noop,
    noop,
    noop,
    noop,
    noop,
  );
  return { service, prisma, workspaceService };
}

function channels(count: number) {
  return Array.from({ length: count }, (_, index) => ({
    id: `channel-${index + 1}`,
    workspaceId: 'ws-1',
    title: `Channel ${index + 1}`,
    photoUrl: null,
    currentSubscribersCount: 10_000,
    ownViewsPerPost: null,
    adBaseCpm: decimal(10),
    adBaseCurrency: 'USD',
    timePosts: [{ time: '12:00', position: 0 }],
  }));
}

function products(channelIds: string[], perChannel = 4) {
  const formats = [
    { name: '1/24', hours: 24, permanent: false },
    { name: '2/48', hours: 48, permanent: false },
    { name: '3/72', hours: 72, permanent: false },
    { name: 'No auto-delete', hours: null, permanent: true },
  ];
  return channelIds.flatMap((channelId) =>
    formats.slice(0, perChannel).map((format, index) => ({
      id: `${channelId}-product-${index + 1}`,
      workspaceId: 'ws-1',
      telegramChannelId: channelId,
      name: format.name,
      description: null,
      topDurationMinutes: 60,
      feedDurationHours: format.hours,
      deleteAfterHours: format.hours,
      isPermanent: format.permanent,
      defaultPricingMode: TelegramAdPricingMode.CPM,
      defaultCpm: decimal(10),
      defaultFixedPrice: null,
      minimumPrice: null,
      currency: 'USD',
      isActive: true,
      position: index,
      createdAt: new Date('2026-08-01T00:00:00.000Z'),
      updatedAt: new Date('2026-08-01T00:00:00.000Z'),
    })),
  );
}

function pricingPosts(channelIds: string[], now: Date) {
  return channelIds.flatMap((channelId) =>
    [0, 1, 2].map((index) => {
      const postDate = new Date(
        now.getTime() - (10 + index) * 24 * 60 * 60 * 1000,
      );
      const snapshot = (hours: number, viewsCount: number) => ({
        viewsCount,
        collectedAt: new Date(postDate.getTime() + hours * 60 * 60 * 1000),
      });
      return {
        id: `${channelId}-post-${index + 1}`,
        telegramChannelId: channelId,
        telegramMessageId: String(index + 1),
        postDate,
        viewsCount: 1000 + index * 100,
        manualOwnViews: 0,
        excludeFromAnalytics: false,
        adSalePlacements: [],
        metricSnapshots: [
          snapshot(24, 600 + index * 10),
          snapshot(48, 700 + index * 10),
          snapshot(72, 800 + index * 10),
          snapshot(168, 1000 + index * 100),
        ],
      };
    }),
  );
}

function pricingSourceRows(
  posts: ReturnType<typeof pricingPosts>,
): PricingSourceFixtureRow[] {
  return posts.flatMap<PricingSourceFixtureRow>((post) => {
    const base = {
      id: post.id,
      telegramChannelId: post.telegramChannelId,
      postDate: post.postDate,
      viewsCount: post.viewsCount,
      manualOwnViews: post.manualOwnViews,
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

function workspaceSettings(
  overrides: Partial<{
    workspaceId: string;
    defaultOrganicPostsPerAdSlot: number;
    createdAt: Date;
    updatedAt: Date;
  }> = {},
) {
  return {
    workspaceId: 'ws-1',
    defaultOrganicPostsPerAdSlot: 3,
    createdAt: new Date('2026-08-01T00:00:00.000Z'),
    updatedAt: new Date('2026-08-01T00:00:00.000Z'),
    ...overrides,
  };
}

describe('TelegramAdSalesService performance contracts', () => {
  it('reads established workspace settings with one query and zero writes', async () => {
    const { service, prisma } = createPerformanceService();

    const result = await service.getAdSalesWorkspaceSettings('user-1');

    expect(result).toEqual({
      workspaceId: 'ws-1',
      defaultOrganicPostsPerAdSlot: 3,
      createdAt: '2026-08-01T00:00:00.000Z',
      updatedAt: '2026-08-01T00:00:00.000Z',
    });
    expect(
      prisma.telegramAdSalesWorkspaceSettings.findUnique,
    ).toHaveBeenCalledWith({ where: { workspaceId: 'ws-1' } });
    expect({
      reads:
        prisma.telegramAdSalesWorkspaceSettings.findUnique.mock.calls.length,
      writes:
        prisma.telegramAdSalesWorkspaceSettings.create.mock.calls.length +
        prisma.telegramAdSalesWorkspaceSettings.upsert.mock.calls.length,
    }).toEqual({ reads: 1, writes: 0 });
  });

  it('creates workspace settings only when the workspace row is missing', async () => {
    const { service, prisma } = createPerformanceService();
    prisma.telegramAdSalesWorkspaceSettings.findUnique.mockResolvedValueOnce(
      null,
    );
    prisma.telegramAdSalesWorkspaceSettings.create.mockResolvedValue(
      workspaceSettings(),
    );

    await expect(
      service.getAdSalesWorkspaceSettings('user-1'),
    ).resolves.toEqual(
      expect.objectContaining({
        workspaceId: 'ws-1',
        defaultOrganicPostsPerAdSlot: 3,
      }),
    );

    expect(prisma.telegramAdSalesWorkspaceSettings.create).toHaveBeenCalledWith(
      {
        data: {
          workspaceId: 'ws-1',
          defaultOrganicPostsPerAdSlot: 3,
        },
      },
    );
    expect({
      reads:
        prisma.telegramAdSalesWorkspaceSettings.findUnique.mock.calls.length,
      writes: prisma.telegramAdSalesWorkspaceSettings.create.mock.calls.length,
    }).toEqual({ reads: 1, writes: 1 });
    expect(
      prisma.telegramAdSalesWorkspaceSettings.upsert,
    ).not.toHaveBeenCalled();
  });

  it('recovers a concurrent workspace-settings create from the winning row', async () => {
    const { service, prisma } = createPerformanceService();
    const winner = workspaceSettings({
      defaultOrganicPostsPerAdSlot: 5,
      updatedAt: new Date('2026-08-02T00:00:00.000Z'),
    });
    prisma.telegramAdSalesWorkspaceSettings.findUnique
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(winner);
    prisma.telegramAdSalesWorkspaceSettings.create.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('duplicate workspace settings', {
        code: 'P2002',
        clientVersion: 'test',
      }),
    );

    await expect(
      service.getAdSalesWorkspaceSettings('user-1'),
    ).resolves.toEqual({
      workspaceId: 'ws-1',
      defaultOrganicPostsPerAdSlot: 5,
      createdAt: '2026-08-01T00:00:00.000Z',
      updatedAt: '2026-08-02T00:00:00.000Z',
    });

    expect({
      reads:
        prisma.telegramAdSalesWorkspaceSettings.findUnique.mock.calls.length,
      createAttempts:
        prisma.telegramAdSalesWorkspaceSettings.create.mock.calls.length,
      upserts: prisma.telegramAdSalesWorkspaceSettings.upsert.mock.calls.length,
    }).toEqual({ reads: 2, createAttempts: 1, upserts: 0 });
  });

  it('reads an established workspace-default policy with four queries and zero writes', async () => {
    const { service, prisma } = createPerformanceService();
    prisma.telegramChannel.findFirst.mockResolvedValue(channels(1)[0]);
    prisma.telegramAdSchedulePolicy.findFirst.mockResolvedValue({
      id: 'policy-1',
      workspaceId: 'ws-1',
      telegramChannelId: 'channel-1',
      timezone: 'UTC',
      autoFrequencyEnabled: true,
      expectedOrganicPostsPerDay: null,
      useWorkspaceDefault: true,
      organicPostsPerAdSlot: 1,
      maxAdsPerDay: 3,
      minHoursBetweenAds: 0,
      minDaysBetweenAds: 0,
      slotStrategy: TelegramAdSlotStrategy.BEFORE_ORGANIC_POST,
      fallbackSlotTimes: [],
      allowManualSlots: false,
      createdAt: new Date('2026-08-01T00:00:00.000Z'),
      updatedAt: new Date('2026-08-01T00:00:00.000Z'),
    });

    await expect(service.getPolicy('user-1', 'channel-1')).resolves.toEqual(
      expect.objectContaining({ organicPostsPerAdSlot: 3 }),
    );
    expect({
      reads:
        prisma.telegramChannel.findFirst.mock.calls.length +
        prisma.workspace.findUniqueOrThrow.mock.calls.length +
        prisma.telegramAdSchedulePolicy.findFirst.mock.calls.length +
        prisma.telegramAdSalesWorkspaceSettings.findUnique.mock.calls.length,
      workspaceSettingsWrites:
        prisma.telegramAdSalesWorkspaceSettings.create.mock.calls.length +
        prisma.telegramAdSalesWorkspaceSettings.upsert.mock.calls.length,
    }).toEqual({ reads: 4, workspaceSettingsWrites: 0 });
  });

  it.each([1, 10, 50, 100])(
    'prices four products for %i channel(s) with four reads including workspace authorization',
    async (channelCount) => {
      jest.useFakeTimers().setSystemTime(new Date('2026-08-27T12:00:00.000Z'));
      const { service, prisma, workspaceService } = createPerformanceService();
      const selectedChannels = channels(channelCount);
      const channelIds = selectedChannels.map((channel) => channel.id);
      const selectedProducts = products(channelIds);
      const posts = pricingPosts(channelIds, new Date());
      prisma.telegramChannel.findMany.mockResolvedValue(selectedChannels);
      prisma.telegramAdProduct.findMany.mockResolvedValue(selectedProducts);
      prisma.$queryRaw.mockResolvedValue(pricingSourceRows(posts));

      const result = await service.listProductsByChannels('user-1', channelIds);

      const after =
        workspaceService.resolveWorkspaceIdForUser.mock.calls.length +
        prisma.telegramChannel.findMany.mock.calls.length +
        prisma.telegramAdProduct.findMany.mock.calls.length +
        prisma.$queryRaw.mock.calls.length;
      expect({ before: 3 + 9 * channelCount, after }).toEqual({
        before: 3 + 9 * channelCount,
        after: 4,
      });
      expect(Object.values(result).every((items) => items.length === 4)).toBe(
        true,
      );
      const firstChannelProducts = result[channelIds[0]] as unknown as Array<{
        estimatedViews: number;
      }>;
      expect(
        firstChannelProducts.map((product) => product.estimatedViews),
      ).toEqual([610, 710, 810, 1100]);
      expect(prisma.telegramAdProduct.createMany).not.toHaveBeenCalled();
      jest.useRealTimers();
    },
  );

  it('materializes first-use products for 100 channels with five reads and one write', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-08-27T12:00:00.000Z'));
    const { service, prisma, workspaceService } = createPerformanceService();
    const selectedChannels = channels(AD_SALES_PRICING_CHANNEL_BATCH_SIZE);
    const channelIds = selectedChannels.map((channel) => channel.id);
    const selectedProducts = products(channelIds);
    prisma.telegramChannel.findMany.mockResolvedValue(selectedChannels);
    prisma.telegramAdProduct.findMany
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce(selectedProducts);
    prisma.telegramAdProduct.createMany.mockResolvedValue({
      count: selectedProducts.length,
    });
    prisma.$queryRaw.mockResolvedValue(
      pricingSourceRows(pricingPosts(channelIds, new Date())),
    );

    const result = await service.listProductsByChannels('user-1', channelIds);

    const prismaReads =
      prisma.telegramChannel.findMany.mock.calls.length +
      prisma.telegramAdProduct.findMany.mock.calls.length +
      prisma.$queryRaw.mock.calls.length;
    const writes = prisma.telegramAdProduct.createMany.mock.calls.length;
    expect({
      workspaceAuthorization:
        workspaceService.resolveWorkspaceIdForUser.mock.calls.length,
      prismaReads,
      writes,
      totalDatabaseOperations:
        workspaceService.resolveWorkspaceIdForUser.mock.calls.length +
        prismaReads +
        writes,
    }).toEqual({
      workspaceAuthorization: 1,
      prismaReads: 4,
      writes: 1,
      totalDatabaseOperations: 6,
    });
    expect(Object.keys(result)).toHaveLength(
      AD_SALES_PRICING_CHANNEL_BATCH_SIZE,
    );
    expect(
      Object.values(result).every(
        (channelProducts) => channelProducts.length === 4,
      ),
    ).toBe(true);
    jest.useRealTimers();
  });

  it('prices 101 unique channels completely through two bounded SQL batches', async () => {
    const { service, prisma, workspaceService } = createPerformanceService();
    const selectedChannels = channels(AD_SALES_PRICING_CHANNEL_BATCH_SIZE + 1);
    const channelIds = selectedChannels.map((channel) => channel.id);
    const selectedProducts = products(channelIds);
    const posts = pricingPosts(channelIds, new Date());
    const lastChannelId = channelIds.at(-1);
    prisma.telegramChannel.findMany.mockResolvedValue(selectedChannels);
    prisma.telegramAdProduct.findMany.mockResolvedValue(selectedProducts);
    prisma.$queryRaw
      .mockResolvedValueOnce(
        pricingSourceRows(
          posts.filter((post) => post.telegramChannelId !== lastChannelId),
        ),
      )
      .mockResolvedValueOnce(
        pricingSourceRows(
          posts.filter((post) => post.telegramChannelId === lastChannelId),
        ),
      );

    const result = await service.listProductsByChannels('user-1', [
      ...channelIds,
      channelIds[0],
    ]);

    expect(workspaceService.resolveWorkspaceIdForUser).toHaveBeenCalledTimes(1);
    expect(prisma.$queryRaw).toHaveBeenCalledTimes(2);
    expect(Object.keys(result)).toEqual(channelIds);
    expect(Object.values(result).every((items) => items.length === 4)).toBe(
      true,
    );
    expect(prisma.telegramAdProduct.createMany).not.toHaveBeenCalled();
  });

  it('propagates a failed batched pricing read without materializing defaults', async () => {
    const { service, prisma } = createPerformanceService();
    const selectedChannels = channels(1);
    prisma.telegramChannel.findMany.mockResolvedValue(selectedChannels);
    prisma.telegramAdProduct.findMany.mockResolvedValue(
      products(['channel-1']),
    );
    prisma.$queryRaw.mockRejectedValue(new Error('database unavailable'));

    await expect(
      service.listProductsByChannels('user-1', ['channel-1']),
    ).rejects.toThrow('database unavailable');
    expect(prisma.telegramAdProduct.createMany).not.toHaveBeenCalled();
  });

  it.each([1, 10, 50])(
    'builds cache-miss availability for %i channel(s) with ten reads including authorization',
    async (channelCount) => {
      jest.useFakeTimers().setSystemTime(new Date('2026-08-19T12:00:00.000Z'));
      const { service, prisma, workspaceService } = createPerformanceService();
      const selectedChannels = channels(channelCount);
      const channelIds = selectedChannels.map((channel) => channel.id);
      const posts = pricingPosts(channelIds, new Date());
      prisma.telegramChannel.findMany.mockResolvedValue(selectedChannels);
      prisma.telegramAdSchedulePolicy.findMany.mockResolvedValue(
        channelIds.map((telegramChannelId) => ({
          telegramChannelId,
          timezone: 'UTC',
          expectedOrganicPostsPerDay: null,
          useWorkspaceDefault: false,
          organicPostsPerAdSlot: 1,
          maxAdsPerDay: 3,
          minHoursBetweenAds: 0,
          minDaysBetweenAds: 0,
          slotStrategy: TelegramAdSlotStrategy.BEFORE_ORGANIC_POST,
          fallbackSlotTimes: [],
          allowManualSlots: false,
        })),
      );
      prisma.telegramAdProduct.findMany.mockResolvedValue(products(channelIds));
      prisma.telegramAdSalePlacement.findMany.mockResolvedValue([]);
      prisma.telegramManagedPost.findMany.mockResolvedValue([]);
      prisma.$queryRaw.mockResolvedValue(pricingSourceRows(posts));
      prisma.telegramPost.findMany.mockResolvedValue(posts);

      const result = await service.availability('user-1', {
        from: '2026-08-20T00:00:00.000Z',
        to: '2026-08-20T23:59:59.000Z',
        channelIds,
      });

      const after =
        workspaceService.resolveWorkspaceIdForUser.mock.calls.length +
        prisma.telegramChannel.findMany.mock.calls.length +
        prisma.workspace.findUniqueOrThrow.mock.calls.length +
        prisma.telegramAdSalesWorkspaceSettings.findUnique.mock.calls.length +
        prisma.telegramAdSchedulePolicy.findMany.mock.calls.length +
        prisma.telegramAdProduct.findMany.mock.calls.length +
        prisma.telegramAdSalePlacement.findMany.mock.calls.length +
        prisma.telegramPost.findMany.mock.calls.length +
        prisma.telegramManagedPost.findMany.mock.calls.length +
        prisma.$queryRaw.mock.calls.length;
      expect({ before: 7 + 5 * channelCount, after }).toEqual({
        before: 7 + 5 * channelCount,
        after: 10,
      });
      expect(new Set(result.slots.map((slot) => slot.channelId)).size).toBe(
        channelCount,
      );
      expect(prisma.telegramAdProduct.createMany).not.toHaveBeenCalled();
      expect(
        prisma.telegramAdSalesWorkspaceSettings.upsert,
      ).not.toHaveBeenCalled();
      jest.useRealTimers();
    },
  );

  it('rejects availability ranges beyond 93 days before starting database work', async () => {
    const { service, prisma } = createPerformanceService();

    await expect(
      service.availability('user-1', {
        from: '2026-01-01T00:00:00.000Z',
        to: '2026-04-05T00:00:00.000Z',
        channelIds: ['channel-1'],
      }),
    ).rejects.toThrow('Availability range cannot exceed 93 days');
    expect(prisma.telegramChannel.findMany).not.toHaveBeenCalled();
  });

  it.each([0, 6])(
    'loads the analytics current/prior sources once for K=%i selected channels',
    async (selectedCount) => {
      const { service, prisma, workspaceService } = createPerformanceService();
      const selectedChannels = channels(selectedCount);
      const channelIds = selectedChannels.map((channel) => channel.id);
      const internals = service as unknown as {
        adAnalyticsDataset: (params: unknown) => Promise<{
          placements: never[];
          channels: never[];
        }>;
        analyticsDatasetReader: {
          sumAgreedRevenue: (params: unknown) => Promise<Prisma.Decimal>;
        };
        inventorySlotsForChannels: (params: unknown) => Promise<never[]>;
        loadInventorySnapshots: (params: unknown) => Promise<never[]>;
        resolveAnalyticsChannelIds: (params: unknown) => Promise<string[]>;
        pricingReader: {
          latestSnapshotsForChannels: (
            workspaceId: string,
            channelIds: string[],
          ) => Promise<Map<string, never>>;
        };
      };
      const datasetSpy = jest
        .spyOn(internals, 'adAnalyticsDataset')
        .mockResolvedValue({ placements: [], channels: [] });
      const previousRevenueSpy = jest
        .spyOn(internals.analyticsDatasetReader, 'sumAgreedRevenue')
        .mockResolvedValue(decimal(0));
      jest.spyOn(internals, 'inventorySlotsForChannels').mockResolvedValue([]);
      jest.spyOn(internals, 'loadInventorySnapshots').mockResolvedValue([]);
      jest.spyOn(internals, 'resolveAnalyticsChannelIds').mockResolvedValue([]);
      jest
        .spyOn(internals.pricingReader, 'latestSnapshotsForChannels')
        .mockResolvedValue(new Map<string, never>());
      prisma.telegramChannel.findMany.mockResolvedValue(selectedChannels);

      const result = await service.analyticsOverview('user-1', { channelIds });

      expect({
        before: 4 + selectedCount,
        currentDatasets: datasetSpy.mock.calls.length,
        priorAggregates: previousRevenueSpy.mock.calls.length,
      }).toEqual({
        before: 4 + selectedCount,
        currentDatasets: 1,
        priorAggregates: 1,
      });
      expect(result.channels.map((channel) => channel.channelId)).toEqual(
        channelIds,
      );
      expect(result.revenueSeries.points).toEqual([]);
      expect(result.alerts.items).toEqual([]);
      expect(workspaceService.resolveWorkspaceIdForUser).toHaveBeenCalledTimes(
        1,
      );
    },
  );
});

describe('TelegramAdSalesPricingReader bounded snapshot contract', () => {
  it('chunks a direct 101-channel read into complete batches of at most 100', async () => {
    const { prisma } = createPerformanceService();
    const reader = new TelegramAdSalesPricingReader(prisma as never);
    const selectedChannels = channels(AD_SALES_PRICING_CHANNEL_BATCH_SIZE + 1);
    const statements: Array<{ values: unknown[] }> = [];
    prisma.$queryRaw.mockImplementation((query: unknown) => {
      statements.push(query as { values: unknown[] });
      return Promise.resolve([]);
    });

    const result = await reader.sourcesForChannels('ws-1', selectedChannels);

    expect(result.size).toBe(selectedChannels.length);
    expect(statements).toHaveLength(2);
    const channelIds = selectedChannels.map((channel) => channel.id);
    const idsPerStatement = statements.map((statement) =>
      channelIds.filter((channelId) => statement.values.includes(channelId)),
    );
    expect(idsPerStatement.map((ids) => ids.length)).toEqual([100, 1]);
    expect(new Set(idsPerStatement.flat())).toEqual(new Set(channelIds));
  });

  it('unions standard and stored product windows before selecting exact indexed edge candidates', async () => {
    const { prisma } = createPerformanceService();
    const reader = new TelegramAdSalesPricingReader(prisma as never);
    let statement!: { sql: string; values: unknown[] };
    prisma.$queryRaw.mockImplementation((query: unknown) => {
      statement = query as typeof statement;
      return Promise.resolve([]);
    });

    await reader.sourcesForChannels('ws-1', channels(1));

    const sql = statement.sql.replace(/\s+/g, ' ');
    expect(sql).toContain('WITH "requiredWindows"("targetHours") AS');
    expect(sql).toContain('UNION SELECT DISTINCT CASE');
    expect(sql).toContain('FROM "TelegramAdProduct" AS product');
    expect(sql).toContain('product."workspaceId" =');
    expect(sql).toContain('product."telegramChannelId" IN');
    expect(sql).toContain('ROW_NUMBER() OVER');
    expect(sql).toContain('FROM "requiredWindows" AS requiredWindow');
    expect(sql).toContain('LEFT JOIN LATERAL');
    expect(sql).toContain('CROSS JOIN LATERAL');
    expect(sql).toContain('ABS( EXTRACT( EPOCH FROM');
    expect(sql).toMatch(
      /snapshot\."collectedAt" DESC, snapshot\."id" ASC LIMIT 1/,
    );
    expect(sql).toMatch(
      /snapshot\."collectedAt" ASC, snapshot\."id" ASC LIMIT 1/,
    );
    expect(sql.match(/LIMIT 1/g)).toHaveLength(4);
    expect(statement.values).toContain(MAX_AD_SALES_PRICING_POSTS_PER_CHANNEL);
    expect(statement.values).toEqual(
      expect.arrayContaining([...STANDARD_AD_SALES_PRICING_WINDOW_HOURS]),
    );
    expect(prisma.telegramPost.findMany).not.toHaveBeenCalled();
    expect(
      AD_SALES_PRICING_CHANNEL_BATCH_SIZE *
        MAX_AD_SALES_PRICING_POSTS_PER_CHANNEL *
        STANDARD_AD_SALES_PRICING_ROWS_PER_POST,
    ).toBe(30_000);
  });

  it.each([
    {
      historical: false,
      expectedLatest: 1101,
      expectedHydratedRowsPerPost: 6,
    },
    {
      historical: true,
      expectedLatest: 1001,
      expectedHydratedRowsPerPost: 5,
    },
  ])(
    'preserves standard and stored 96h pricing windows with W+1 candidates (historical=$historical)',
    async ({ historical, expectedLatest, expectedHydratedRowsPerPost }) => {
      const postDate = new Date('2026-08-01T00:00:00.000Z');
      const atHour = (hours: number) =>
        new Date(postDate.getTime() + hours * 60 * 60 * 1000);
      const fullPosts = [0, 1, 2].map((index) => ({
        id: `post-${index + 1}`,
        telegramChannelId: 'channel-1',
        postDate,
        viewsCount: 1200 + index,
        manualOwnViews: 0,
        excludeFromAnalytics: false,
        adSalePlacements: [] as Array<{ id: string }>,
        metricSnapshots: [
          {
            id: `s-${index}-16`,
            viewsCount: 500 + index,
            collectedAt: atHour(16),
          },
          {
            id: `s-${index}-20`,
            viewsCount: 600 + index,
            collectedAt: atHour(20),
          },
          {
            id: `s-${index}-28`,
            viewsCount: 610 + index,
            collectedAt: atHour(28),
          },
          {
            id: `s-${index}-42`,
            viewsCount: 700 + index,
            collectedAt: atHour(42),
          },
          {
            id: `s-${index}-54`,
            viewsCount: 710 + index,
            collectedAt: atHour(54),
          },
          {
            id: `s-${index}-72`,
            viewsCount: 800 + index,
            collectedAt: atHour(72),
          },
          {
            id: `s-${index}-96`,
            viewsCount: 900 + index,
            collectedAt: atHour(96),
          },
          {
            id: `s-${index}-168`,
            viewsCount: 1000 + index,
            collectedAt: atHour(168),
          },
          {
            id: `s-${index}-200`,
            viewsCount: 1100 + index,
            collectedAt: atHour(200),
          },
        ],
      }));
      const boundedHours = historical
        ? [20, 42, 72, 96, 168, 168]
        : [20, 42, 72, 96, 168, 200];
      const boundedRows = fullPosts.flatMap((post) =>
        boundedHours.map((hours) => {
          const snapshot = post.metricSnapshots.find(
            (item) => item.collectedAt.getTime() === atHour(hours).getTime(),
          )!;
          return {
            id: post.id,
            telegramChannelId: post.telegramChannelId,
            postDate: post.postDate,
            viewsCount: post.viewsCount,
            manualOwnViews: post.manualOwnViews,
            excludeFromAnalytics: post.excludeFromAnalytics,
            adPlacementLinked: false,
            metricSnapshotId: snapshot.id,
            metricSnapshotViewsCount: snapshot.viewsCount,
            metricSnapshotCollectedAt: snapshot.collectedAt,
          };
        }),
      );
      const asOf = historical ? atHour(170) : undefined;
      jest.useFakeTimers().setSystemTime(atHour(240));
      const { prisma } = createPerformanceService();
      prisma.$queryRaw.mockResolvedValue(boundedRows);
      const reader = new TelegramAdSalesPricingReader(prisma as never);
      const channel = channels(1)[0];

      const boundedSource = (
        await reader.sourcesForChannels('ws-1', [channel], asOf)
      ).get(channel.id)!;
      const fullSource = {
        channel,
        posts: fullPosts,
        ...(asOf ? { asOf } : {}),
      };

      for (const targetHours of [24, 48, 72, 96, 168, null] as const) {
        expect(reader.expectedViews(boundedSource, targetHours)).toEqual(
          reader.expectedViews(fullSource, targetHours),
        );
      }
      expect(reader.expectedViews(boundedSource, 24).expectedViews).toBe(601);
      expect(reader.expectedViews(boundedSource, 48).expectedViews).toBe(701);
      expect(reader.expectedViews(boundedSource, 96).expectedViews).toBe(901);
      const withoutCustomCandidate = {
        ...boundedSource,
        posts: boundedSource.posts.map((post) => ({
          ...post,
          metricSnapshots: post.metricSnapshots.filter(
            (snapshot) =>
              snapshot.collectedAt.getTime() !== atHour(96).getTime(),
          ),
        })),
      };
      expect(
        reader.expectedViews(withoutCustomCandidate, 96).expectedViews,
      ).toBe(801);
      expect(reader.expectedViews(boundedSource, null).expectedViews).toBe(
        expectedLatest,
      );
      expect(
        boundedSource.posts.every(
          (post) => post.metricSnapshots.length === expectedHydratedRowsPerPost,
        ),
      ).toBe(true);
      expect(boundedRows).toHaveLength(3 * (5 + 1));
      jest.useRealTimers();
    },
  );
});
