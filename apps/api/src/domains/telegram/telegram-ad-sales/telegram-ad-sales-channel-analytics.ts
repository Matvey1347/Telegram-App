import {
  Prisma,
  TelegramAdPlacementStatus,
  TelegramAdSalePaymentStatus,
} from '@prisma/client';
import { decimal, decimalToString } from './domain/decimal';
import { AdSalesAnalyticsDataset } from './telegram-ad-sales-analytics-dataset-reader';
import {
  AdSalesInventorySlot,
  summarizeAdSalesInventory,
} from './telegram-ad-sales-inventory-reader';
import {
  adSalesAnalyticsDateRules,
  commonAdSalesCurrency,
  medianAdSalesDecimal,
} from './telegram-ad-sales-analytics-utils';

export function buildAdSalesChannelAnalytics(params: {
  channel: { id: string; title: string; photoUrl?: string | null };
  dataset: AdSalesAnalyticsDataset;
  inventorySlots: AdSalesInventorySlot[];
  latestPrice?: {
    expectedViews: number;
    recommendedPrice: Prisma.Decimal;
    minimumPrice: Prisma.Decimal;
  } | null;
  from: Date;
  to: Date;
  timezone: string;
  now?: Date;
}) {
  const now = params.now ?? new Date();
  const placements = params.dataset.placements;
  const inventory = summarizeAdSalesInventory(params.inventorySlots);
  const totalAgreed = placements.reduce(
    (sum, placement) => sum.add(decimal(placement.agreedPrice)),
    decimal(0),
  );
  const totalPaid = placements.reduce(
    (sum, placement) =>
      sum.add(
        placement.paymentAllocations.reduce((inner, allocation) => {
          return allocation.payment?.status ===
            TelegramAdSalePaymentStatus.VOIDED
            ? inner
            : inner.add(decimal(allocation.amount));
        }, decimal(0)),
      ),
    decimal(0),
  );
  const totalPrimary = placements.reduce(
    (sum, placement) =>
      sum.add(
        placement.paymentAllocations.reduce((inner, allocation) => {
          return allocation.payment?.status ===
            TelegramAdSalePaymentStatus.VOIDED
            ? inner
            : inner.add(decimal(allocation.amountInPrimaryCurrency));
        }, decimal(0)),
      ),
    decimal(0),
  );
  const underpricingAmount = placements.reduce((sum, placement) => {
    const recommended = decimal(placement.recommendedPrice);
    const agreed = decimal(placement.agreedPrice);
    return sum.add(
      recommended.gt(agreed) ? recommended.sub(agreed) : decimal(0),
    );
  }, decimal(0));
  const expectedViews = placements.reduce(
    (sum, placement) => sum + placement.expectedViews,
    0,
  );
  const actualViews24h = placements.reduce(
    (sum, placement) => sum + (placement.actualViews24h ?? 0),
    0,
  );
  const actualViews48h = placements.reduce(
    (sum, placement) => sum + (placement.actualViews48h ?? 0),
    0,
  );
  const actualViewsFinal = placements.reduce(
    (sum, placement) => sum + (placement.actualViewsFinal ?? 0),
    0,
  );
  const activeStatuses = new Set<TelegramAdPlacementStatus>([
    TelegramAdPlacementStatus.RESERVED,
    TelegramAdPlacementStatus.SCHEDULED,
    TelegramAdPlacementStatus.PUBLISHED,
    TelegramAdPlacementStatus.COMPLETED,
  ]);
  const elapsedPeriodEnd = params.to < now ? params.to : now;
  const elapsedPlacements = placements.filter(
    (placement) =>
      activeStatuses.has(placement.status) &&
      placement.scheduledAt >= params.from &&
      placement.scheduledAt <= elapsedPeriodEnd,
  );
  const elapsedSlots = params.inventorySlots.filter(
    (slot) =>
      slot.state !== 'MANUAL_ONLY' &&
      slot.scheduledAt >= params.from &&
      slot.scheduledAt <= elapsedPeriodEnd,
  );
  const elapsedMinimumRevenue = elapsedSlots.reduce(
    (sum, slot) => sum.add(decimal(slot.minimumPrice)),
    decimal(0),
  );
  const elapsedSoldRevenue = elapsedPlacements.reduce(
    (sum, placement) => sum.add(decimal(placement.agreedPrice)),
    decimal(0),
  );
  const elapsedRevenueGap = elapsedMinimumRevenue.gt(elapsedSoldRevenue)
    ? elapsedMinimumRevenue.sub(elapsedSoldRevenue)
    : decimal(0);
  const revenueCurrency =
    commonAdSalesCurrency(placements) ??
    commonAdSalesCurrency(params.inventorySlots);
  const overdueCutoff = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

  return {
    channelId: params.channel.id,
    title: params.channel.title,
    iconPresentation: params.channel.photoUrl
      ? {
          type: 'image' as const,
          id: params.channel.id,
          url: params.channel.photoUrl,
          name: params.channel.title,
        }
      : null,
    dateFrom: params.from.toISOString(),
    dateTo: params.to.toISOString(),
    timezone: params.timezone,
    dateRules: adSalesAnalyticsDateRules(),
    revenue: {
      currency: revenueCurrency,
      totalAgreedRevenue: decimalToString(totalAgreed),
      totalPaidRevenue: decimalToString(totalPaid),
      totalRevenueInPrimaryCurrency: decimalToString(totalPrimary),
      periodRevenue: decimalToString(totalAgreed),
      outstandingRevenue: decimalToString(totalAgreed.sub(totalPaid)),
      refundedRevenue: '0',
      averageSalePrice: decimalToString(
        placements.length ? totalAgreed.div(placements.length) : decimal(0),
      ),
      medianSalePrice: decimalToString(
        medianAdSalesDecimal(
          placements.map((placement) => decimal(placement.agreedPrice)),
        ),
      ),
      elapsedMinimumRevenue: decimalToString(elapsedMinimumRevenue),
      elapsedSoldRevenue: decimalToString(elapsedSoldRevenue),
      elapsedRevenueGap: decimalToString(elapsedRevenueGap),
    },
    placements: {
      sold: placements.filter((placement) =>
        activeStatuses.has(placement.status),
      ).length,
      published: placements.filter(
        (placement) => placement.status === TelegramAdPlacementStatus.PUBLISHED,
      ).length,
      completed: placements.filter(
        (placement) => placement.status === TelegramAdPlacementStatus.COMPLETED,
      ).length,
      cancelled: placements.filter(
        (placement) => placement.status === TelegramAdPlacementStatus.CANCELLED,
      ).length,
      slotsEligible: inventory.eligibleSlots,
      slotsAvailable: inventory.availableSlots,
      slotsReserved: inventory.reservedSlots,
      slotFillRate: Number((inventory.bookingFillRate * 100).toFixed(2)),
      bookingFillRate: Number((inventory.bookingFillRate * 100).toFixed(2)),
      publishedFillRate: Number((inventory.publishedFillRate * 100).toFixed(2)),
      cancellationRate: placements.length
        ? Number(
            (
              (placements.filter(
                (placement) =>
                  placement.status === TelegramAdPlacementStatus.CANCELLED,
              ).length /
                placements.length) *
              100
            ).toFixed(2),
          )
        : 0,
    },
    pricing: {
      currentExpectedViews: params.latestPrice?.expectedViews ?? 0,
      currentRecommendedPrice: decimalToString(
        params.latestPrice?.recommendedPrice ?? decimal(0),
      ),
      currentMinimumPrice: decimalToString(
        params.latestPrice?.minimumPrice ?? decimal(0),
      ),
      averageAgreedPrice: decimalToString(
        placements.length ? totalAgreed.div(placements.length) : decimal(0),
      ),
      averageDiscountFromRecommendedPercent:
        placements.length && underpricingAmount.gt(0) && totalAgreed.gt(0)
          ? Number(underpricingAmount.div(totalAgreed).mul(100).toFixed(2))
          : 0,
      underpricingAmount: decimalToString(underpricingAmount),
      underpricingPercent: totalAgreed.gt(0)
        ? Number(underpricingAmount.div(totalAgreed).mul(100).toFixed(2))
        : 0,
      lostPotentialRevenue: decimalToString(underpricingAmount),
    },
    performance: {
      expectedViews,
      actualViews24h,
      actualViews48h,
      actualViewsFinal,
      expectedCpm: decimalToString(
        expectedViews > 0
          ? totalAgreed.div(expectedViews).mul(1000)
          : decimal(0),
      ),
      actualCpm: decimalToString(
        actualViewsFinal > 0
          ? totalAgreed.div(actualViewsFinal).mul(1000)
          : decimal(0),
      ),
      varianceExpectedVsActualPercent:
        expectedViews > 0
          ? Number(
              (
                ((actualViewsFinal - expectedViews) / expectedViews) *
                100
              ).toFixed(2),
            )
          : 0,
    },
    operations: {
      upcomingPlacements: placements.filter(
        (placement) => placement.scheduledAt > now,
      ).length,
      upcomingDeletions: placements.filter(
        (placement) =>
          placement.plannedDeleteAt &&
          placement.plannedDeleteAt > now &&
          !placement.deletedAt,
      ).length,
      overdueUnpaidSales: [
        ...new Set(
          placements
            .filter((placement) => {
              const allocated = placement.paymentAllocations.reduce(
                (sum, allocation) =>
                  allocation.payment?.status ===
                  TelegramAdSalePaymentStatus.VOIDED
                    ? sum
                    : sum.add(decimal(allocation.amount)),
                decimal(0),
              );
              return (
                placement.sale.createdAt < overdueCutoff &&
                allocated.lt(decimal(placement.agreedPrice))
              );
            })
            .map((placement) => placement.telegramAdSaleId),
        ),
      ].length,
      missedPlacements: placements.filter(
        (placement) => placement.status === TelegramAdPlacementStatus.MISSED,
      ).length,
      deletionFailures: placements.filter((placement) =>
        Boolean(placement.lastDeletionError),
      ).length,
    },
    recentSales: placements
      .slice(-5)
      .reverse()
      .map((placement) => ({
        saleId: placement.telegramAdSaleId,
        placementId: placement.id,
        advertiserName: placement.sale.advertiserName,
        scheduledAt: placement.scheduledAt.toISOString(),
        agreedPrice: decimalToString(decimal(placement.agreedPrice)),
        paidAllocatedAmount: decimalToString(
          placement.paymentAllocations.reduce(
            (sum, allocation) =>
              allocation.payment?.status === TelegramAdSalePaymentStatus.VOIDED
                ? sum
                : sum.add(decimal(allocation.amount)),
            decimal(0),
          ),
        ),
        status: placement.status,
        currency: placement.currency,
      })),
  };
}
