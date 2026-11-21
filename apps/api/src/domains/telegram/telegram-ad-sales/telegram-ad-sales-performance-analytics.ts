import { BadRequestException, NotFoundException } from '@nestjs/common';
import { TELEGRAM_AD_ANALYTICS_MAX_SELECTED_CHANNELS } from '@telegram-system/shared';
import { Prisma, TelegramAdSalePaymentStatus } from '@prisma/client';
import { createPaginatedResponse, normalizePagination } from '../../../common/pagination/pagination.utils';
import {
  TelegramAdAlertsQueryDto,
  TelegramAdAnalyticsQueryDto,
  TelegramAdAnalyticsSeriesQueryDto,
  TelegramAdInventoryDetailsQueryDto,
  TelegramAdNetworkAnalyticsQueryDto,
  TelegramAdRevenueScenarioDto,
} from './dto';
import { decimal, decimalToString } from './domain/decimal';
import {
  summarizeAdSalesInventory,
  TelegramAdSalesInventoryReader,
} from './telegram-ad-sales-inventory-reader';
import { AdSalesAnalyticsDatasetParams } from './telegram-ad-sales-analytics-dataset-reader';
import {
  bucketAdSalesAnalyticsDate,
  endOfUtcDay as utcDayEnd,
  listUtcDatesInRange,
  resolveAdSalesAnalyticsRange,
  selectedAdSalesAnalyticsChannelIds,
  startOfUtcDay as utcDayStart,
  sumAdSalesPaidAllocations,
} from './telegram-ad-sales-analytics-utils';
import {
  buildAdSalesAnalyticsSummary,
  buildAdSalesRevenueSeries,
} from './telegram-ad-sales-analytics-summary';
import {
  buildAdSalesAnalyticsAlerts,
  buildAdSalesInventoryAnalytics,
} from './telegram-ad-sales-analytics-inventory-alerts';
import { buildAdSalesChannelAnalytics } from './telegram-ad-sales-channel-analytics';
import type { TelegramAdSalesOperations } from './telegram-ad-sales.service';

export function analyticsRange(_operations: unknown, query?: TelegramAdAnalyticsQueryDto) {
  return resolveAdSalesAnalyticsRange(query);
}

export function inventorySlotsForChannels(
  operations: Pick<TelegramAdSalesOperations, 'inventoryReader'>,
  params: {
    workspaceId: string;
    channelIds: string[];
    from: Date;
    to: Date;
  },
) {
  return operations.inventoryReader.slotsForChannels(params);
}

export function summarizeInventory(
  _operations: unknown,
  slots: Awaited<ReturnType<TelegramAdSalesInventoryReader['slotsForChannels']>>,
) {
  return summarizeAdSalesInventory(slots);
}

export function adAnalyticsDataset(
  operations: Pick<TelegramAdSalesOperations, 'analyticsDatasetReader'>,
  params: AdSalesAnalyticsDatasetParams,
) {
  return operations.analyticsDatasetReader.read(params);
}

export function analyticsChannelIds(_operations: unknown, query: TelegramAdAnalyticsQueryDto) {
  return selectedAdSalesAnalyticsChannelIds(query);
}

export function startOfUtcDay(_operations: unknown, value: Date) {
  return utcDayStart(value);
}

export function endOfUtcDay(_operations: unknown, value: Date) {
  return utcDayEnd(value);
}

export function listDatesInRange(_operations: unknown, from: Date, to: Date) {
  return listUtcDatesInRange(from, to);
}

export async function analyticsSummary(
  operations: Pick<
    TelegramAdSalesOperations,
    | 'adAnalyticsDataset'
    | 'analyticsChannelIds'
    | 'analyticsDatasetReader'
    | 'analyticsRange'
    | 'inventorySlotsForChannels'
    | 'workspace'
  >,
  userId: string,
  query: TelegramAdAnalyticsQueryDto,
) {
  const workspaceId = await operations.workspace(userId);
  const { from, to, timezone } = operations.analyticsRange(query);
  const periodMs = Math.max(1, to.getTime() - from.getTime());
  const sourceParams = {
    workspaceId,
    channelIds: operations.analyticsChannelIds(query),
    networkId: query.networkId ?? null,
  };
  const [dataset, previousRevenue] = await Promise.all([
    operations.adAnalyticsDataset({ ...sourceParams, from, to }),
    operations.analyticsDatasetReader.sumAgreedRevenue({
      ...sourceParams,
      from: new Date(from.getTime() - periodMs),
      to: new Date(from.getTime() - 1),
    }),
  ]);
  const now = new Date();
  const nextSevenDays = await operations.inventorySlotsForChannels({
    workspaceId,
    channelIds: dataset.channels.map((channel) => channel.id),
    from: now,
    to: new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000),
  });
  return buildAdSalesAnalyticsSummary({
    dataset,
    previousRevenue,
    nextSevenDays,
    from,
    to,
    timezone,
    now,
  });
}

export async function channelAnalytics(
  operations: Pick<
    TelegramAdSalesOperations,
    | 'adAnalyticsDataset'
    | 'analyticsRange'
    | 'findWorkspaceChannel'
    | 'inventorySlotsForChannels'
    | 'prisma'
    | 'workspace'
  >,
  userId: string,
  channelId: string,
  query: TelegramAdAnalyticsQueryDto,
) {
  const workspaceId = await operations.workspace(userId);
  const { from, to, timezone } = operations.analyticsRange(query);
  const [channel, dataset, inventorySlots, priceHistory] = await Promise.all([
    operations.findWorkspaceChannel(workspaceId, channelId),
    operations.adAnalyticsDataset({
      workspaceId,
      from,
      to,
      channelIds: [channelId],
    }),
    operations.inventorySlotsForChannels({
      workspaceId,
      channelIds: [channelId],
      from,
      to,
    }),
    operations.prisma.telegramAdPriceSnapshot.findMany({
      where: { workspaceId, telegramChannelId: channelId },
      orderBy: { calculatedAt: 'desc' },
      take: 1,
    }),
  ]);
  return buildAdSalesChannelAnalytics({
    channel,
    dataset,
    inventorySlots,
    latestPrice: priceHistory[0] ?? null,
    from,
    to,
    timezone,
  });
}

export async function analyticsOverview(
  operations: Pick<
    TelegramAdSalesOperations,
    | 'adAnalyticsDataset'
    | 'analyticsChannelIds'
    | 'analyticsDatasetReader'
    | 'analyticsRange'
    | 'inventorySlotsForChannels'
    | 'loadInventorySnapshots'
    | 'pricingReader'
    | 'prisma'
    | 'resolveAnalyticsChannelIds'
    | 'workspace'
  >,
  userId: string,
  query: TelegramAdAnalyticsSeriesQueryDto,
) {
  const selectedChannelIds = [...new Set(query.channelIds ?? [])];
  if (selectedChannelIds.length > TELEGRAM_AD_ANALYTICS_MAX_SELECTED_CHANNELS) {
    throw new BadRequestException(
      `Analytics supports at most ${TELEGRAM_AD_ANALYTICS_MAX_SELECTED_CHANNELS} selected channels`,
    );
  }
  const workspaceId = await operations.workspace(userId);
  let effectiveQuery = query;
  if (query.allTime) {
    const [earliestSale, earliestPlacement] = await Promise.all([
      operations.prisma.telegramAdSale.findFirst({
        where: { workspaceId },
        orderBy: { createdAt: 'asc' },
        select: { createdAt: true },
      }),
      operations.prisma.telegramAdSalePlacement.findFirst({
        where: { workspaceId },
        orderBy: { scheduledAt: 'asc' },
        select: { scheduledAt: true },
      }),
    ]);
    const now = new Date();
    const historyFrom = new Date(
      Math.min(
        earliestSale?.createdAt.getTime() ?? now.getTime(),
        earliestPlacement?.scheduledAt.getTime() ?? now.getTime(),
      ),
    );
    historyFrom.setUTCHours(0, 0, 0, 0);
    effectiveQuery = {
      ...query,
      dateFrom: historyFrom.toISOString(),
      dateTo: now.toISOString(),
      granularity: query.granularity ?? 'month',
    };
  }
  const { from, to, timezone } = operations.analyticsRange(effectiveQuery);
  const periodMs = Math.max(1, to.getTime() - from.getTime());
  const sourceParams = {
    workspaceId,
    channelIds: operations.analyticsChannelIds(effectiveQuery),
    networkId: effectiveQuery.networkId ?? null,
  };
  const [dataset, previousRevenue, networklessChannelDataset] = await Promise.all([
    operations.adAnalyticsDataset({ ...sourceParams, from, to }),
    operations.analyticsDatasetReader.sumAgreedRevenue({
      ...sourceParams,
      from: new Date(from.getTime() - periodMs),
      to: new Date(from.getTime() - 1),
    }),
    effectiveQuery.networkId && selectedChannelIds.length
      ? operations.adAnalyticsDataset({
          workspaceId,
          from,
          to,
          channelIds: selectedChannelIds,
        })
      : Promise.resolve(null),
  ]);
  const channelDataset = networklessChannelDataset ?? dataset;
  const inventoryChannelIds = effectiveQuery.channelIds?.length
    ? effectiveQuery.channelIds
    : await operations.resolveAnalyticsChannelIds({
        workspaceId,
        channelId: effectiveQuery.channelId,
        networkId: effectiveQuery.networkId,
      });
  const now = new Date();
  const [nextSevenDays, snapshots, selectedChannels, selectedInventorySlots, latestPrices] =
    await Promise.all([
      operations.inventorySlotsForChannels({
        workspaceId,
        channelIds: dataset.channels.map((channel) => channel.id),
        from: now,
        to: new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000),
      }),
      operations.loadInventorySnapshots({
        workspaceId,
        channelIds: inventoryChannelIds,
        from,
        to,
      }),
      selectedChannelIds.length
        ? operations.prisma.telegramChannel.findMany({
            where: { workspaceId, id: { in: selectedChannelIds } },
            select: { id: true, title: true, photoUrl: true },
          })
        : Promise.resolve([]),
      operations.inventorySlotsForChannels({
        workspaceId,
        channelIds: selectedChannelIds,
        from,
        to,
      }),
      operations.pricingReader.latestSnapshotsForChannels(workspaceId, selectedChannelIds),
    ]);
  if (selectedChannels.length !== selectedChannelIds.length) {
    throw new NotFoundException('Telegram channel not found');
  }
  const inventory = buildAdSalesInventoryAnalytics({
    snapshots,
    from,
    to,
    timezone,
  });
  const summary = buildAdSalesAnalyticsSummary({
    dataset,
    previousRevenue,
    nextSevenDays,
    from,
    to,
    timezone,
    now,
  });
  const revenueSeries = buildAdSalesRevenueSeries({
    dataset,
    from,
    to,
    timezone,
    granularity: effectiveQuery.granularity ?? 'day',
  });
  const alerts = buildAdSalesAnalyticsAlerts({
    dataset,
    inventory,
    from,
    to,
    timezone,
    now,
  });
  const channelsById = new Map<string, (typeof selectedChannels)[number]>(
    selectedChannels.map((channel) => [channel.id, channel] as const),
  );
  const channels = selectedChannelIds.map((channelId) =>
    buildAdSalesChannelAnalytics({
      channel: channelsById.get(channelId)!,
      dataset: {
        ...channelDataset,
        placements: channelDataset.placements.filter(
          (placement) => placement.telegramChannelId === channelId,
        ),
        channels: channelDataset.channels.filter((channel) => channel.id === channelId),
      },
      inventorySlots: selectedInventorySlots.filter((slot) => slot.channelId === channelId),
      latestPrice: latestPrices.get(channelId) ?? null,
      from,
      to,
      timezone,
      now,
    }),
  );
  return { summary, revenueSeries, inventory, alerts, channels };
}

export async function networkAnalytics(
  operations: Pick<
    TelegramAdSalesOperations,
    | 'adAnalyticsDataset'
    | 'analyticsRange'
    | 'findWorkspaceNetwork'
    | 'inventorySlotsForChannels'
    | 'summarizeInventory'
    | 'workspace'
  >,
  userId: string,
  networkId: string,
  query: TelegramAdNetworkAnalyticsQueryDto,
) {
  const workspaceId = await operations.workspace(userId);
  const network = await operations.findWorkspaceNetwork(workspaceId, networkId);
  const { from, to, timezone } = operations.analyticsRange(query);
  const mode = query.mode ?? 'SALE_CONTEXT';
  const dataset = await operations.adAnalyticsDataset({
    workspaceId,
    from,
    to,
    networkId,
    networkMode: mode,
    channelIds:
      mode === 'CURRENT_CHANNELS' ? network.channels.map((channel) => channel.telegramChannelId) : undefined,
  });
  const inventorySlots = await operations.inventorySlotsForChannels({
    workspaceId,
    channelIds: network.channels.map((channel) => channel.telegramChannelId),
    from,
    to,
  });
  const inventory = operations.summarizeInventory(inventorySlots);
  const totalRevenue = dataset.placements.reduce(
    (sum, placement) => sum.add(decimal(placement.agreedPrice)),
    decimal(0),
  );
  const paidRevenue = sumAdSalesPaidAllocations(dataset.placements);
  const actualViews = dataset.placements.reduce(
    (sum, placement) => sum + (placement.actualViewsFinal ?? 0),
    0,
  );
  const expectedViews = dataset.placements.reduce((sum, placement) => sum + placement.expectedViews, 0);

  const channels = await Promise.all(
    dataset.channels.map(async (channel) => {
      const channelPlacements = dataset.placements.filter(
        (placement) => placement.telegramChannelId === channel.id,
      );
      const channelRevenue = channelPlacements.reduce(
        (sum, placement) => sum.add(decimal(placement.agreedPrice)),
        decimal(0),
      );
      const nextAvailable = inventorySlots
        .filter((slot) => slot.channelId === channel.id && slot.state === 'AVAILABLE')
        .sort((left, right) => left.scheduledAt.getTime() - right.scheduledAt.getTime())[0];
      return {
        channelId: channel.id,
        title: channel.title,
        revenue: decimalToString(channelRevenue),
        revenueSharePercent: totalRevenue.gt(0)
          ? Number(channelRevenue.div(totalRevenue).mul(100).toFixed(2))
          : 0,
        placementsCount: channelPlacements.length,
        fillRate: inventory.eligibleSlots
          ? Number(
              (
                (inventorySlots.filter((slot) => slot.channelId === channel.id && slot.state === 'SOLD')
                  .length /
                  Math.max(1, inventorySlots.filter((slot) => slot.channelId === channel.id).length)) *
                100
              ).toFixed(2),
            )
          : 0,
        nextAvailableSlotAt: nextAvailable?.scheduledAt.toISOString() ?? null,
      };
    }),
  );

  return {
    networkId: network.id,
    name: network.name,
    mode,
    dateFrom: from.toISOString(),
    dateTo: to.toISOString(),
    timezone,
    totalRevenue: decimalToString(totalRevenue),
    paidRevenue: decimalToString(paidRevenue),
    outstandingRevenue: decimalToString(totalRevenue.sub(paidRevenue)),
    placementsCount: dataset.placements.length,
    fillRate: Number((inventory.bookingFillRate * 100).toFixed(2)),
    expectedViews,
    actualViews,
    blendedExpectedCpm: expectedViews > 0 ? decimalToString(totalRevenue.div(expectedViews).mul(1000)) : '0',
    blendedActualCpm: actualViews > 0 ? decimalToString(totalRevenue.div(actualViews).mul(1000)) : '0',
    underpricingLoss: decimalToString(
      dataset.placements.reduce((sum, placement) => {
        const recommended = decimal(placement.recommendedPrice);
        const agreed = decimal(placement.agreedPrice);
        return sum.add(recommended.gt(agreed) ? recommended.sub(agreed) : decimal(0));
      }, decimal(0)),
    ),
    channels,
  };
}

export async function revenueSeries(
  operations: Pick<
    TelegramAdSalesOperations,
    'adAnalyticsDataset' | 'analyticsChannelIds' | 'analyticsRange' | 'workspace'
  >,
  userId: string,
  query: TelegramAdAnalyticsSeriesQueryDto,
) {
  const workspaceId = await operations.workspace(userId);
  const { from, to, timezone } = operations.analyticsRange(query);
  const granularity = query.granularity ?? 'day';
  const dataset = await operations.adAnalyticsDataset({
    workspaceId,
    from,
    to,
    channelIds: query.channelId ? [query.channelId] : operations.analyticsChannelIds(query),
    networkId: query.networkId ?? null,
  });
  return buildAdSalesRevenueSeries({
    dataset,
    from,
    to,
    timezone,
    granularity,
  });
}

export async function pricingSeries(
  operations: Pick<TelegramAdSalesOperations, 'analyticsRange' | 'prisma' | 'workspace'>,
  userId: string,
  query: TelegramAdAnalyticsSeriesQueryDto,
) {
  const workspaceId = await operations.workspace(userId);
  const { from, to, timezone } = operations.analyticsRange(query);
  const granularity = query.granularity ?? 'day';
  const history = await operations.prisma.telegramAdPriceSnapshot.findMany({
    where: {
      workspaceId,
      calculatedAt: { gte: from, lte: to },
      ...(query.channelId ? { telegramChannelId: query.channelId } : {}),
      ...(query.telegramAdProductId ? { telegramAdProductId: query.telegramAdProductId } : {}),
    },
    orderBy: [{ calculatedAt: 'asc' }, { id: 'asc' }],
    select: {
      id: true,
      telegramChannelId: true,
      telegramAdProductId: true,
      calculatedAt: true,
      expectedViews: true,
      recommendedPrice: true,
      minimumPrice: true,
      targetCpm: true,
      minimumCpm: true,
      postsSampleCount: true,
      methodVersion: true,
    },
  });
  const deduped = new Map<string, any>();
  for (const point of history) {
    const key = `${bucketAdSalesAnalyticsDate(point.calculatedAt, granularity)}:${point.telegramChannelId}:${point.telegramAdProductId ?? 'default'}`;
    deduped.set(key, point);
  }
  return {
    dateFrom: from.toISOString(),
    dateTo: to.toISOString(),
    timezone,
    granularity,
    points: [...deduped.values()].map((point) => ({
      date: bucketAdSalesAnalyticsDate(point.calculatedAt, granularity),
      channelId: point.telegramChannelId,
      productId: point.telegramAdProductId,
      expectedViews: point.expectedViews,
      recommendedPrice: decimalToString(point.recommendedPrice),
      minimumPrice: decimalToString(point.minimumPrice),
      targetCpm: decimalToString(point.targetCpm),
      minimumCpm: decimalToString(point.minimumCpm),
      sampleCount: point.postsSampleCount,
      methodVersion: point.methodVersion,
    })),
  };
}

export async function inventoryAnalytics(
  operations: Pick<
    TelegramAdSalesOperations,
    'analyticsRange' | 'loadInventorySnapshots' | 'resolveAnalyticsChannelIds' | 'workspace'
  >,
  userId: string,
  query: TelegramAdAnalyticsSeriesQueryDto,
) {
  const workspaceId = await operations.workspace(userId);
  const { from, to, timezone } = operations.analyticsRange(query);
  const channelIds = query.channelIds?.length
    ? query.channelIds
    : await operations.resolveAnalyticsChannelIds({
        workspaceId,
        channelId: query.channelId,
        networkId: query.networkId,
      });
  const snapshots = await operations.loadInventorySnapshots({
    workspaceId,
    channelIds,
    from,
    to,
  });
  return buildAdSalesInventoryAnalytics({ snapshots, from, to, timezone });
}

export async function analyticsAlerts(
  operations: Pick<
    TelegramAdSalesOperations,
    'adAnalyticsDataset' | 'analyticsChannelIds' | 'analyticsRange' | 'inventoryAnalytics' | 'workspace'
  >,
  userId: string,
  query: TelegramAdAlertsQueryDto,
) {
  const workspaceId = await operations.workspace(userId);
  const { from, to, timezone } = operations.analyticsRange(query);
  const [dataset, inventory] = await Promise.all([
    operations.adAnalyticsDataset({
      workspaceId,
      from,
      to,
      channelIds: operations.analyticsChannelIds(query),
      networkId: query.networkId ?? null,
    }),
    operations.inventoryAnalytics(userId, query),
  ]);
  return buildAdSalesAnalyticsAlerts({
    dataset,
    inventory,
    from,
    to,
    timezone,
    kinds: query.kinds,
  });
}

export async function revenueScenario(
  operations: Pick<
    TelegramAdSalesOperations,
    | 'aggregateInventorySnapshots'
    | 'endOfUtcDay'
    | 'loadInventorySnapshots'
    | 'resolveAnalyticsChannelIds'
    | 'startOfUtcDay'
    | 'workspace'
  >,
  userId: string,
  dto: TelegramAdRevenueScenarioDto,
) {
  const workspaceId = await operations.workspace(userId);
  const from = operations.startOfUtcDay(new Date(dto.dateFrom));
  const to = operations.endOfUtcDay(new Date(dto.dateTo));
  const channelIds = await operations.resolveAnalyticsChannelIds({
    workspaceId,
    channelId: dto.channelId,
    networkId: dto.networkId,
    networkMode: dto.networkMode,
  });
  const snapshots = await operations.loadInventorySnapshots({
    workspaceId,
    channelIds,
    from,
    to,
  });
  const metrics = operations.aggregateInventorySnapshots(snapshots);
  const currentAveragePrice = Number(decimalToString(metrics.averageAgreedPrice) ?? 0);
  const currentFillRate = metrics.bookingFillRate;
  const proposedAveragePrice =
    dto.proposedFixedPrice ??
    Number((currentAveragePrice * (1 + (dto.proposedPriceChangePercent ?? 0) / 100)).toFixed(2));
  const assumedFillRate =
    dto.assumedFillRate ??
    (dto.useHistoricalElasticity && snapshots.length >= 12
      ? Math.max(0, Math.min(100, currentFillRate))
      : currentFillRate);
  const projectedBookedSlots = Math.round(metrics.eligibleSlots * (assumedFillRate / 100));
  const projectedRevenue = decimal(proposedAveragePrice).mul(projectedBookedSlots);
  return {
    currentAveragePrice: currentAveragePrice.toFixed(2),
    currentFillRate: Number(currentFillRate.toFixed(2)),
    currentEligibleSlots: metrics.eligibleSlots,
    currentRevenue: decimalToString(metrics.agreedRevenue),
    proposedAveragePrice: proposedAveragePrice.toFixed(2),
    assumedFillRate: Number(assumedFillRate.toFixed(2)),
    projectedBookedSlots,
    projectedRevenue: decimalToString(projectedRevenue),
    projectedRevenuePerEligibleSlot:
      metrics.eligibleSlots > 0 ? decimalToString(projectedRevenue.div(metrics.eligibleSlots)) : '0',
    difference: decimalToString(projectedRevenue.sub(metrics.agreedRevenue)),
    differencePercent: metrics.agreedRevenue.gt(0)
      ? Number(projectedRevenue.sub(metrics.agreedRevenue).div(metrics.agreedRevenue).mul(100).toFixed(2))
      : null,
    warnings:
      dto.useHistoricalElasticity && snapshots.length < 12
        ? ['Historical elasticity was not applied because the sample is too small.']
        : ['Scenario analysis is a projection, not a forecast.'],
    methodology:
      dto.useHistoricalElasticity && snapshots.length >= 12
        ? 'Historical fill rate was used as an observed reference. Correlation does not imply causation.'
        : 'Projection uses the provided or current fill rate assumption with transparent arithmetic.',
  };
}

export async function inventoryDetails(
  operations: Pick<
    TelegramAdSalesOperations,
    'endOfUtcDay' | 'prisma' | 'resolveAnalyticsChannelIds' | 'startOfUtcDay' | 'workspace'
  >,
  userId: string,
  query: TelegramAdInventoryDetailsQueryDto,
) {
  const workspaceId = await operations.workspace(userId);
  const pagination = normalizePagination(query);
  const from = query.dateFrom ? operations.startOfUtcDay(new Date(query.dateFrom)) : undefined;
  const to = query.dateTo ? operations.endOfUtcDay(new Date(query.dateTo)) : undefined;
  const channelIds = await operations.resolveAnalyticsChannelIds({
    workspaceId,
    channelId: query.channelId,
    networkId: query.networkId,
  });
  const where: Prisma.TelegramAdSalePlacementWhereInput = {
    workspaceId,
    telegramChannelId: { in: channelIds },
    ...(from || to
      ? {
          scheduledAt: {
            ...(from ? { gte: from } : {}),
            ...(to ? { lte: to } : {}),
          },
        }
      : {}),
  };
  const [items, totalItems] = await operations.prisma.$transaction([
    operations.prisma.telegramAdSalePlacement.findMany({
      where,
      orderBy: [{ scheduledAt: 'desc' }, { id: 'desc' }],
      skip: pagination.skip,
      take: pagination.take,
      select: {
        id: true,
        telegramAdSaleId: true,
        telegramChannelId: true,
        status: true,
        scheduledAt: true,
        agreedPrice: true,
        recommendedPrice: true,
        expectedViews: true,
        actualViewsFinal: true,
        actualReactionsFinal: true,
        actualCpm: true,
        currency: true,
        sale: {
          select: {
            advertiserName: true,
          },
        },
        paymentAllocations: {
          select: {
            amount: true,
            payment: { select: { status: true } },
          },
        },
      },
    }),
    operations.prisma.telegramAdSalePlacement.count({ where }),
  ]);
  return createPaginatedResponse(
    items.map((item) => ({
      placementId: item.id,
      saleId: item.telegramAdSaleId,
      channelId: item.telegramChannelId,
      advertiserName: item.sale.advertiserName,
      agreedPrice: decimalToString(item.agreedPrice),
      recommendedPrice: decimalToString(item.recommendedPrice),
      status: item.status,
      scheduledAt: item.scheduledAt.toISOString(),
      paidAmount: decimalToString(
        item.paymentAllocations.reduce(
          (sum, allocation) =>
            allocation.payment.status === TelegramAdSalePaymentStatus.VOIDED
              ? sum
              : sum.add(decimal(allocation.amount)),
          decimal(0),
        ),
      ),
      expectedViews: item.expectedViews,
      actualViews: item.actualViewsFinal,
      cpm: decimalToString(item.actualCpm),
      currency: item.currency,
    })),
    totalItems,
    pagination,
  );
}
