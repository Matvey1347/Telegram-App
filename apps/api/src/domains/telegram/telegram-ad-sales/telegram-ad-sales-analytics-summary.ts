import { TelegramAdSalePaymentStatus, type Prisma } from '@prisma/client';
import { decimal, decimalToString } from './domain/decimal';
import { AdSalesAnalyticsDataset } from './telegram-ad-sales-analytics-dataset-reader';
import {
  AdSalesInventorySlot,
  summarizeAdSalesInventory,
} from './telegram-ad-sales-inventory-reader';
import {
  bucketAdSalesAnalyticsDate,
  commonAdSalesCurrency,
  sumAdSalesPaidAllocations,
} from './telegram-ad-sales-analytics-utils';

export function buildAdSalesAnalyticsSummary(params: {
  dataset: AdSalesAnalyticsDataset;
  previousRevenue: Prisma.Decimal.Value;
  nextSevenDays: AdSalesInventorySlot[];
  from: Date;
  to: Date;
  timezone: string;
  now?: Date;
}) {
  const now = params.now ?? new Date();
  const inventory = summarizeAdSalesInventory(params.nextSevenDays);
  const channelRollup = params.dataset.channels.map((channel) => {
    const placements = params.dataset.placements.filter(
      (placement) => placement.telegramChannelId === channel.id,
    );
    const revenue = placements.reduce(
      (sum, placement) => sum.add(decimal(placement.agreedPrice)),
      decimal(0),
    );
    const actualViews = placements.reduce(
      (sum, placement) => sum + (placement.actualViewsFinal ?? 0),
      0,
    );
    return {
      channel,
      revenue,
      actualCpm:
        actualViews > 0 ? revenue.div(actualViews).mul(1000) : decimal(0),
      unusedSlots: params.nextSevenDays.filter(
        (slot) => slot.channelId === channel.id && slot.state === 'PAST',
      ).length,
    };
  });
  const paidRevenue = sumAdSalesPaidAllocations(params.dataset.placements);
  const totalRevenue = params.dataset.placements.reduce(
    (sum, placement) => sum.add(decimal(placement.agreedPrice)),
    decimal(0),
  );
  const outstanding = params.dataset.placements.reduce((sum, placement) => {
    const allocated = placement.paymentAllocations
      .filter(
        (allocation) =>
          allocation.payment?.status !== TelegramAdSalePaymentStatus.VOIDED,
      )
      .reduce(
        (inner, allocation) => inner.add(decimal(allocation.amount)),
        decimal(0),
      );
    return sum.add(decimal(placement.agreedPrice).sub(allocated));
  }, decimal(0));
  const actualViews = params.dataset.placements.reduce(
    (sum, placement) => sum + (placement.actualViewsFinal ?? 0),
    0,
  );
  const averageCpm =
    actualViews > 0 ? totalRevenue.div(actualViews).mul(1000) : decimal(0);
  const underpricingLoss = params.dataset.placements.reduce(
    (sum, placement) => {
      const minimum = decimal(placement.minimumPrice);
      const agreed = decimal(placement.agreedPrice);
      return sum.add(minimum.gt(agreed) ? minimum.sub(agreed) : decimal(0));
    },
    decimal(0),
  );
  const overdueCutoff = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const paymentOverdueCount = params.dataset.placements.filter((placement) => {
    const paid = placement.paymentAllocations.reduce(
      (sum, allocation) =>
        allocation.payment?.status === TelegramAdSalePaymentStatus.VOIDED
          ? sum
          : sum.add(decimal(allocation.amount)),
      decimal(0),
    );
    return (
      placement.sale.createdAt < overdueCutoff &&
      paid.lt(decimal(placement.agreedPrice))
    );
  }).length;
  const previousRevenue = decimal(params.previousRevenue);
  const byRevenue = [...channelRollup].sort((left, right) =>
    right.revenue.comparedTo(left.revenue),
  )[0];
  const byCpm = [...channelRollup].sort((left, right) =>
    right.actualCpm.comparedTo(left.actualCpm),
  )[0];
  const byUnused = [...channelRollup].sort(
    (left, right) => right.unusedSlots - left.unusedSlots,
  )[0];
  return {
    dateFrom: params.from.toISOString(),
    dateTo: params.to.toISOString(),
    timezone: params.timezone,
    currency: commonAdSalesCurrency(params.dataset.placements),
    revenueThisMonth: decimalToString(totalRevenue),
    revenuePreviousMonth: decimalToString(previousRevenue),
    monthOverMonthChangePercent: previousRevenue.gt(0)
      ? Number(
          totalRevenue
            .sub(previousRevenue)
            .div(previousRevenue)
            .mul(100)
            .toFixed(2),
        )
      : null,
    paidRevenue: decimalToString(paidRevenue),
    accountsReceivable: decimalToString(outstanding),
    upcomingPlacements: params.dataset.placements.filter(
      (placement) => placement.scheduledAt > now,
    ).length,
    availableSlotsNext7Days: inventory.availableSlots,
    slotFillRate: Number((inventory.bookingFillRate * 100).toFixed(2)),
    averageCpm: decimalToString(averageCpm),
    underpricingLoss: decimalToString(underpricingLoss),
    bestChannelByRevenue: byRevenue
      ? {
          channelId: byRevenue.channel.id,
          title: byRevenue.channel.title,
          value: decimalToString(byRevenue.revenue),
        }
      : null,
    bestChannelByActualCpm: byCpm
      ? {
          channelId: byCpm.channel.id,
          title: byCpm.channel.title,
          value: decimalToString(byCpm.actualCpm),
        }
      : null,
    channelWithMostUnusedInventory: byUnused
      ? {
          channelId: byUnused.channel.id,
          title: byUnused.channel.title,
          unusedSlots: byUnused.unusedSlots,
        }
      : null,
    paymentOverdueCount,
    deletionFailuresCount: params.dataset.placements.filter((placement) =>
      Boolean(placement.lastDeletionError),
    ).length,
  };
}

export function buildAdSalesRevenueSeries(params: {
  dataset: AdSalesAnalyticsDataset;
  from: Date;
  to: Date;
  timezone: string;
  granularity: 'day' | 'week' | 'month';
}) {
  const points = new Map<
    string,
    {
      date: string;
      agreedRevenue: ReturnType<typeof decimal>;
      paidRevenue: ReturnType<typeof decimal>;
      outstandingRevenue: ReturnType<typeof decimal>;
      placements: number;
      expectedViews: number;
      actualViews: number;
    }
  >();
  for (const placement of params.dataset.placements) {
    const key = bucketAdSalesAnalyticsDate(
      placement.scheduledAt,
      params.granularity,
    );
    const point = points.get(key) ?? {
      date: key,
      agreedRevenue: decimal(0),
      paidRevenue: decimal(0),
      outstandingRevenue: decimal(0),
      placements: 0,
      expectedViews: 0,
      actualViews: 0,
    };
    const allocated = placement.paymentAllocations.reduce(
      (sum, allocation) =>
        allocation.payment?.status === TelegramAdSalePaymentStatus.VOIDED
          ? sum
          : sum.add(decimal(allocation.amount)),
      decimal(0),
    );
    point.agreedRevenue = point.agreedRevenue.add(
      decimal(placement.agreedPrice),
    );
    point.paidRevenue = point.paidRevenue.add(allocated);
    point.outstandingRevenue = point.outstandingRevenue.add(
      decimal(placement.agreedPrice).sub(allocated),
    );
    point.placements += 1;
    point.expectedViews += placement.expectedViews;
    point.actualViews += placement.actualViewsFinal ?? 0;
    points.set(key, point);
  }
  return {
    dateFrom: params.from.toISOString(),
    dateTo: params.to.toISOString(),
    timezone: params.timezone,
    granularity: params.granularity,
    points: [...points.values()]
      .sort((left, right) => left.date.localeCompare(right.date))
      .map((point) => ({
        ...point,
        agreedRevenue: decimalToString(point.agreedRevenue),
        paidRevenue: decimalToString(point.paidRevenue),
        outstandingRevenue: decimalToString(point.outstandingRevenue),
      })),
  };
}
