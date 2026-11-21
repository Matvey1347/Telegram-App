import { BadRequestException } from '@nestjs/common';
import { TelegramAdSalePaymentStatus, TelegramAdPlacementStatus, WorkspaceRole } from '@prisma/client';
import { TelegramAdInventoryRebuildDto, TelegramAdPriceFillCorrelationQueryDto } from './dto';
import { decimal, decimalToString } from './domain/decimal';
import { ACTIVE_TELEGRAM_AD_PLACEMENT_STATUSES } from './telegram-ad-sales-reservation';
import { bucketAdSalesAnalyticsDate, endOfUtcDay, startOfUtcDay } from './telegram-ad-sales-analytics-utils';
import type { TelegramAdSalesOperations } from './telegram-ad-sales.service';

export async function resolveAnalyticsChannelIds(
  operations: Pick<TelegramAdSalesOperations, 'findWorkspaceNetwork' | 'prisma'>,
  params: {
    workspaceId: string;
    channelId?: string;
    networkId?: string;
    networkMode?: 'SALE_CONTEXT' | 'CURRENT_CHANNELS';
  },
) {
  if (params.channelId) return [params.channelId];
  if (params.networkId) {
    const network = await operations.findWorkspaceNetwork(params.workspaceId, params.networkId);
    return network.channels.map((item) => item.telegramChannelId);
  }
  return (
    await operations.prisma.telegramChannel.findMany({
      where: { workspaceId: params.workspaceId, isActive: true },
      select: { id: true },
    })
  ).map((channel) => channel.id);
}

export async function buildInventorySnapshotForDate(
  operations: Pick<
    TelegramAdSalesOperations,
    | 'endOfUtcDay'
    | 'findWorkspaceChannel'
    | 'inventorySlotsForChannels'
    | 'prisma'
    | 'resolvePolicy'
    | 'startOfUtcDay'
    | 'summarizeInventory'
  >,
  params: {
    workspaceId: string;
    channelId: string;
    date: Date;
    force?: boolean;
  },
) {
  const dayStart = operations.startOfUtcDay(params.date);
  const dayEnd = operations.endOfUtcDay(params.date);
  await operations.findWorkspaceChannel(params.workspaceId, params.channelId);
  const policy =
    (await operations.prisma.telegramAdSchedulePolicy.findFirst({
      where: {
        workspaceId: params.workspaceId,
        telegramChannelId: params.channelId,
      },
    })) ?? (await operations.resolvePolicy(params.workspaceId, params.channelId, 'UTC'));
  const products = await operations.prisma.telegramAdProduct.findMany({
    where: {
      workspaceId: params.workspaceId,
      telegramChannelId: params.channelId,
      isActive: true,
    },
    select: {
      id: true,
      name: true,
      isActive: true,
      currency: true,
    },
    orderBy: [{ position: 'asc' }, { createdAt: 'asc' }],
  });
  const slots = await operations.inventorySlotsForChannels({
    workspaceId: params.workspaceId,
    channelIds: [params.channelId],
    from: dayStart,
    to: dayEnd,
  });
  const channelSlots = slots.filter((slot) => slot.channelId === params.channelId);
  const placements = await operations.prisma.telegramAdSalePlacement.findMany({
    where: {
      workspaceId: params.workspaceId,
      telegramChannelId: params.channelId,
      scheduledAt: { gte: dayStart, lte: dayEnd },
    },
    select: {
      id: true,
      status: true,
      expectedViews: true,
      actualViewsFinal: true,
      actualReactionsFinal: true,
      recommendedPrice: true,
      minimumPrice: true,
      agreedPrice: true,
      paymentAllocations: {
        select: {
          amount: true,
          payment: { select: { status: true } },
        },
      },
    },
  });
  const inventory = operations.summarizeInventory(channelSlots);
  const bookedPlacements = placements.filter((placement) =>
    ACTIVE_TELEGRAM_AD_PLACEMENT_STATUSES.includes(placement.status),
  );
  const publishedPlacements = placements.filter(
    (placement) =>
      placement.status === TelegramAdPlacementStatus.PUBLISHED ||
      placement.status === TelegramAdPlacementStatus.COMPLETED,
  );
  const cancelledPlacements = placements.filter(
    (placement) => placement.status === TelegramAdPlacementStatus.CANCELLED,
  );
  const agreedRevenue = publishedPlacements.reduce(
    (sum, placement) => sum.add(decimal(placement.agreedPrice)),
    decimal(0),
  );
  const paidRevenue = publishedPlacements.reduce(
    (sum, placement) =>
      sum.add(
        placement.paymentAllocations.reduce(
          (inner, allocation) =>
            allocation.payment.status === TelegramAdSalePaymentStatus.VOIDED
              ? inner
              : inner.add(decimal(allocation.amount)),
          decimal(0),
        ),
      ),
    decimal(0),
  );
  const underpricingLoss = bookedPlacements.reduce((sum, placement) => {
    const recommended = decimal(placement.recommendedPrice);
    const agreed = decimal(placement.agreedPrice);
    return sum.add(recommended.gt(agreed) ? recommended.sub(agreed) : decimal(0));
  }, decimal(0));
  const recommendedInventoryRevenue = channelSlots.reduce(
    (sum, slot) => (slot.state === 'MANUAL_ONLY' ? sum : sum.add(decimal(slot.recommendedPrice))),
    decimal(0),
  );
  const minimumInventoryRevenue = channelSlots.reduce(
    (sum, slot) => (slot.state === 'MANUAL_ONLY' ? sum : sum.add(decimal(slot.minimumPrice))),
    decimal(0),
  );
  const unsoldInventoryOpportunity = channelSlots.reduce((sum, slot) => {
    if (slot.state === 'AVAILABLE' || slot.state === 'PAST') {
      return sum.add(decimal(slot.recommendedPrice));
    }
    return sum;
  }, decimal(0));
  const expectedViews = bookedPlacements.reduce((sum, placement) => sum + placement.expectedViews, 0);
  const actualViews = publishedPlacements.reduce(
    (sum, placement) => sum + (placement.actualViewsFinal ?? 0),
    0,
  );

  return {
    workspaceId: params.workspaceId,
    telegramChannelId: params.channelId,
    date: dayStart,
    timezone: policy.timezone,
    eligibleSlots: inventory.eligibleSlots,
    bookedSlots: bookedPlacements.length,
    publishedSlots: publishedPlacements.length,
    cancelledSlots: cancelledPlacements.length,
    missedSlots: inventory.pastUnusedSlots,
    blockedSlots: inventory.blockedSlots,
    recommendedInventoryRevenue,
    minimumInventoryRevenue,
    agreedRevenue,
    paidRevenue,
    outstandingRevenue: agreedRevenue.sub(paidRevenue),
    underpricingLoss,
    unsoldInventoryOpportunity,
    expectedViews,
    actualViews,
    policySnapshot: {
      timezone: policy.timezone,
      maxAdsPerDay: policy.maxAdsPerDay,
      minHoursBetweenAds: policy.minHoursBetweenAds,
      minDaysBetweenAds: policy.minDaysBetweenAds,
      slotStrategy: policy.slotStrategy,
      fallbackSlotTimes: policy.fallbackSlotTimes,
    },
    productSnapshot: products.map((product) => ({
      id: product.id,
      name: product.name,
      isActive: product.isActive,
      currency: product.currency,
    })),
    pricingSnapshot: {
      eligibleSlots: channelSlots.map((slot) => ({
        scheduledAt: slot.scheduledAt.toISOString(),
        recommendedPrice: slot.recommendedPrice,
        minimumPrice: slot.minimumPrice,
      })),
    },
    calculationVersion: 'inventory-v1',
    calculatedAt: new Date(),
  };
}

export async function saveInventorySnapshot(
  operations: Pick<TelegramAdSalesOperations, 'prisma' | 'startOfUtcDay'>,
  snapshot: Awaited<ReturnType<typeof buildInventorySnapshotForDate>>,
  options?: { force?: boolean },
) {
  const recalculationCutoff = operations.startOfUtcDay(new Date());
  recalculationCutoff.setUTCDate(recalculationCutoff.getUTCDate() - 7);
  const canOverwrite = options?.force || snapshot.date >= recalculationCutoff;
  const existing = await operations.prisma.telegramAdInventoryDailySnapshot.findFirst({
    where: {
      workspaceId: snapshot.workspaceId,
      telegramChannelId: snapshot.telegramChannelId,
      date: snapshot.date,
    },
    select: { id: true },
  });
  if (existing && !canOverwrite) {
    return { status: 'skipped' as const, snapshotId: existing.id };
  }
  const saved = existing
    ? await operations.prisma.telegramAdInventoryDailySnapshot.update({
        where: { id: existing.id },
        data: snapshot,
      })
    : await operations.prisma.telegramAdInventoryDailySnapshot.create({
        data: snapshot,
      });
  return {
    status: existing ? ('updated' as const) : ('created' as const),
    snapshotId: saved.id,
  };
}

export async function loadInventorySnapshots(
  operations: Pick<TelegramAdSalesOperations, 'prisma' | 'startOfUtcDay'>,
  params: {
    workspaceId: string;
    channelIds: string[];
    from: Date;
    to: Date;
  },
) {
  return operations.prisma.telegramAdInventoryDailySnapshot.findMany({
    where: {
      workspaceId: params.workspaceId,
      telegramChannelId: { in: params.channelIds },
      date: {
        gte: operations.startOfUtcDay(params.from),
        lte: operations.startOfUtcDay(params.to),
      },
    },
    orderBy: [{ date: 'asc' }, { telegramChannelId: 'asc' }],
  });
}

export function aggregateInventorySnapshots(_operations: unknown, items: Array<any>) {
  const zero = decimal(0);
  const total = items.reduce(
    (acc, item) => ({
      eligibleSlots: acc.eligibleSlots + item.eligibleSlots,
      bookedSlots: acc.bookedSlots + item.bookedSlots,
      publishedSlots: acc.publishedSlots + item.publishedSlots,
      cancelledSlots: acc.cancelledSlots + item.cancelledSlots,
      missedSlots: acc.missedSlots + item.missedSlots,
      blockedSlots: acc.blockedSlots + item.blockedSlots,
      recommendedInventoryRevenue: acc.recommendedInventoryRevenue.add(item.recommendedInventoryRevenue),
      minimumInventoryRevenue: acc.minimumInventoryRevenue.add(item.minimumInventoryRevenue),
      agreedRevenue: acc.agreedRevenue.add(item.agreedRevenue),
      paidRevenue: acc.paidRevenue.add(item.paidRevenue),
      outstandingRevenue: acc.outstandingRevenue.add(item.outstandingRevenue),
      underpricingLoss: acc.underpricingLoss.add(item.underpricingLoss),
      unsoldInventoryOpportunity: acc.unsoldInventoryOpportunity.add(item.unsoldInventoryOpportunity),
      expectedViews: acc.expectedViews + item.expectedViews,
      actualViews: acc.actualViews + item.actualViews,
    }),
    {
      eligibleSlots: 0,
      bookedSlots: 0,
      publishedSlots: 0,
      cancelledSlots: 0,
      missedSlots: 0,
      blockedSlots: 0,
      recommendedInventoryRevenue: zero,
      minimumInventoryRevenue: zero,
      agreedRevenue: zero,
      paidRevenue: zero,
      outstandingRevenue: zero,
      underpricingLoss: zero,
      unsoldInventoryOpportunity: zero,
      expectedViews: 0,
      actualViews: 0,
    },
  );
  const averageAgreedPrice = total.bookedSlots > 0 ? total.agreedRevenue.div(total.bookedSlots) : zero;
  const averageRecommendedPrice =
    total.eligibleSlots > 0 ? total.recommendedInventoryRevenue.div(total.eligibleSlots) : zero;
  const averageMinimumPrice =
    total.eligibleSlots > 0 ? total.minimumInventoryRevenue.div(total.eligibleSlots) : zero;
  return {
    ...total,
    bookingFillRate: total.eligibleSlots ? (total.bookedSlots / total.eligibleSlots) * 100 : 0,
    publishedFillRate: total.eligibleSlots ? (total.publishedSlots / total.eligibleSlots) * 100 : 0,
    cancellationRate: total.bookedSlots ? (total.cancelledSlots / total.bookedSlots) * 100 : 0,
    averageAgreedPrice,
    medianAgreedPrice: averageAgreedPrice,
    averageRecommendedPrice,
    averageMinimumPrice,
    revenuePerEligibleSlot: total.eligibleSlots > 0 ? total.agreedRevenue.div(total.eligibleSlots) : zero,
    revenuePerPublishedSlot: total.publishedSlots > 0 ? total.agreedRevenue.div(total.publishedSlots) : zero,
    inventoryRevenueEfficiency: total.recommendedInventoryRevenue.gt(0)
      ? Number(total.agreedRevenue.div(total.recommendedInventoryRevenue).mul(100).toFixed(2))
      : 0,
    totalMonetizationGap: total.unsoldInventoryOpportunity.add(total.underpricingLoss),
    expectedCpm: total.expectedViews > 0 ? total.agreedRevenue.div(total.expectedViews).mul(1000) : zero,
    effectiveCpm: total.actualViews > 0 ? total.agreedRevenue.div(total.actualViews).mul(1000) : zero,
  };
}

export async function rebuildInventorySnapshots(
  operations: Pick<
    TelegramAdSalesOperations,
    | 'buildInventorySnapshotForDate'
    | 'endOfUtcDay'
    | 'findWorkspaceNetwork'
    | 'listDatesInRange'
    | 'logger'
    | 'prisma'
    | 'saveInventorySnapshot'
    | 'startOfUtcDay'
    | 'workspaceService'
  >,
  userId: string,
  dto: TelegramAdInventoryRebuildDto,
) {
  const membership = await operations.workspaceService.requireWorkspaceRole(userId, [
    WorkspaceRole.owner,
    WorkspaceRole.admin,
  ]);
  const workspaceId = membership.workspaceId;
  const from = operations.startOfUtcDay(new Date(dto.dateFrom));
  const to = operations.endOfUtcDay(new Date(dto.dateTo));
  const days = operations.listDatesInRange(from, to);
  if (days.length > 366) {
    throw new BadRequestException('Rebuild range cannot exceed 366 days');
  }
  const channelIds = dto.channelIds?.length
    ? dto.channelIds
    : dto.networkId
      ? (await operations.findWorkspaceNetwork(workspaceId, dto.networkId)).channels.map(
          (item) => item.telegramChannelId,
        )
      : [];
  if (channelIds.length > 50) {
    throw new BadRequestException('Rebuild cannot exceed 50 channels');
  }
  const uniqueChannelIds = [...new Set(channelIds)];
  const jobRunId = `inventory-rebuild:${Date.now()}`;
  if (dto.dryRun) {
    const existing = await operations.prisma.telegramAdInventoryDailySnapshot.count({
      where: {
        workspaceId,
        telegramChannelId: { in: uniqueChannelIds },
        date: { gte: from, lte: operations.startOfUtcDay(to) },
      },
    });
    return {
      dryRun: true,
      force: dto.force,
      jobRunId,
      channels: uniqueChannelIds.length,
      days: days.length,
      estimatedChanges: uniqueChannelIds.length * days.length,
      existingSnapshots: existing,
    };
  }
  if (dto.force !== true) {
    throw new BadRequestException('force must be explicitly true for a rebuild run');
  }
  let processed = 0;
  let success = 0;
  let failed = 0;
  let skipped = 0;
  for (const channelId of uniqueChannelIds) {
    for (const date of days) {
      processed += 1;
      try {
        const snapshot = await operations.buildInventorySnapshotForDate({
          workspaceId,
          channelId,
          date,
          force: dto.force,
        });
        const result = await operations.saveInventorySnapshot(snapshot, {
          force: dto.force,
        });
        if (result.status === 'skipped') skipped += 1;
        else success += 1;
      } catch (error) {
        failed += 1;
      }
    }
  }
  operations.logger.info({
    event: 'telegram_ad_sales.inventory_rebuild',
    message: `Inventory rebuild finished: ${jobRunId}`,
    metadata: {
      jobRunId,
      workspaceId,
      processed,
      success,
      failed,
      skipped,
      channelIds: uniqueChannelIds,
      dateFrom: from.toISOString(),
      dateTo: to.toISOString(),
    },
  });
  return {
    dryRun: false,
    force: dto.force,
    jobRunId,
    processed,
    success,
    failed,
    skipped,
  };
}

export async function priceFillCorrelation(
  operations: Pick<
    TelegramAdSalesOperations,
    | 'aggregateInventorySnapshots'
    | 'analyticsRange'
    | 'loadInventorySnapshots'
    | 'resolveAnalyticsChannelIds'
    | 'workspace'
  >,
  userId: string,
  query: TelegramAdPriceFillCorrelationQueryDto,
) {
  const workspaceId = await operations.workspace(userId);
  const { from, to, timezone } = operations.analyticsRange(query);
  const bucketMap = { DAY: 'day', WEEK: 'week', MONTH: 'month' } as const;
  const granularity = bucketMap[query.bucket ?? 'DAY'];
  const channelIds = await operations.resolveAnalyticsChannelIds({
    workspaceId,
    channelId: query.channelId,
    networkId: query.networkId,
    networkMode: query.networkMode,
  });
  const snapshots = await operations.loadInventorySnapshots({
    workspaceId,
    channelIds,
    from,
    to,
  });
  const grouped = new Map<string, any[]>();
  for (const snapshot of snapshots) {
    const key = bucketAdSalesAnalyticsDate(snapshot.date, granularity);
    grouped.set(key, [...(grouped.get(key) ?? []), snapshot]);
  }
  const points = [...grouped.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, items]) => {
      const metrics = operations.aggregateInventorySnapshots(items);
      return {
        periodStart: key,
        periodEnd: key,
        eligibleSlots: metrics.eligibleSlots,
        bookedSlots: metrics.bookedSlots,
        publishedSlots: metrics.publishedSlots,
        fillRate: Number(metrics.bookingFillRate.toFixed(2)),
        averageAgreedPrice: decimalToString(metrics.averageAgreedPrice),
        medianAgreedPrice: decimalToString(metrics.medianAgreedPrice),
        averageRecommendedPrice: decimalToString(metrics.averageRecommendedPrice),
        agreedRevenue: decimalToString(metrics.agreedRevenue),
        paidRevenue: decimalToString(metrics.paidRevenue),
        revenuePerEligibleSlot: decimalToString(metrics.revenuePerEligibleSlot),
        revenuePerPublishedSlot: decimalToString(metrics.revenuePerPublishedSlot),
        unsoldInventoryOpportunity: decimalToString(metrics.unsoldInventoryOpportunity),
        underpricingLoss: decimalToString(metrics.underpricingLoss),
      };
    });
  const correlation = (pairs: Array<{ x: number; y: number }>) => {
    if (pairs.length < 2) return null;
    const xMean = pairs.reduce((sum, pair) => sum + pair.x, 0) / pairs.length;
    const yMean = pairs.reduce((sum, pair) => sum + pair.y, 0) / pairs.length;
    const numerator = pairs.reduce((sum, pair) => sum + (pair.x - xMean) * (pair.y - yMean), 0);
    const xDenominator = Math.sqrt(pairs.reduce((sum, pair) => sum + (pair.x - xMean) ** 2, 0));
    const yDenominator = Math.sqrt(pairs.reduce((sum, pair) => sum + (pair.y - yMean) ** 2, 0));
    if (xDenominator === 0 || yDenominator === 0) return null;
    return Number((numerator / (xDenominator * yDenominator)).toFixed(4));
  };
  const priceFillPairs = points.map((point) => ({
    x: Number(point.averageAgreedPrice ?? 0),
    y: point.fillRate,
  }));
  const priceRevenuePairs = points.map((point) => ({
    x: Number(point.averageAgreedPrice ?? 0),
    y: Number(point.agreedRevenue ?? 0),
  }));
  const fillRevenuePairs = points.map((point) => ({
    x: point.fillRate,
    y: Number(point.agreedRevenue ?? 0),
  }));
  const sampleSize = points.length;
  return {
    dateFrom: from.toISOString(),
    dateTo: to.toISOString(),
    timezone,
    sampleSize,
    confidence: sampleSize < 6 ? 'INSUFFICIENT_DATA' : sampleSize < 12 ? 'LOW' : 'NORMAL',
    warnings:
      sampleSize < 6
        ? ['Observed correlation is unavailable because fewer than 6 buckets were found.']
        : sampleSize < 12
          ? ['Observed correlation is based on a small sample and has low confidence.']
          : ['Observed correlation does not prove causation.'],
    priceFillCorrelation: correlation(priceFillPairs),
    priceRevenueCorrelation: correlation(priceRevenuePairs),
    fillRevenueCorrelation: correlation(fillRevenuePairs),
    points,
  };
}
