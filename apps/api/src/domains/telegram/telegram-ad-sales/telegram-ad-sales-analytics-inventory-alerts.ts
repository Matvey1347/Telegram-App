import {
  TelegramAdPlacementStatus,
  TelegramAdSalePaymentStatus,
} from '@prisma/client';
import { decimal, decimalToString } from './domain/decimal';
import { AdSalesAnalyticsDataset } from './telegram-ad-sales-analytics-dataset-reader';
import { listUtcDatesInRange } from './telegram-ad-sales-analytics-utils';

type InventorySnapshot = {
  date: Date;
  telegramChannelId: string;
  eligibleSlots: number;
  bookedSlots: number;
  publishedSlots: number;
  blockedSlots: number;
  missedSlots: number;
};

export function buildAdSalesInventoryAnalytics(params: {
  snapshots: InventorySnapshot[];
  from: Date;
  to: Date;
  timezone: string;
}) {
  const expectedDays = listUtcDatesInRange(params.from, params.to).length;
  const coveredDays = new Set(
    params.snapshots.map((snapshot) =>
      snapshot.date.toISOString().slice(0, 10),
    ),
  ).size;
  return {
    dateFrom: params.from.toISOString(),
    dateTo: params.to.toISOString(),
    timezone: params.timezone,
    points: params.snapshots.map((snapshot) => ({
      date: snapshot.date.toISOString().slice(0, 10),
      channelId: snapshot.telegramChannelId,
      eligibleSlots: snapshot.eligibleSlots,
      availableSlots: Math.max(
        0,
        snapshot.eligibleSlots - snapshot.bookedSlots,
      ),
      reservedSlots: Math.max(
        0,
        snapshot.bookedSlots - snapshot.publishedSlots,
      ),
      soldSlots: snapshot.bookedSlots,
      publishedSlots: snapshot.publishedSlots,
      blockedSlots: snapshot.blockedSlots,
      pastUnusedSlots: snapshot.missedSlots,
      bookingFillRate: snapshot.eligibleSlots
        ? Number(
            ((snapshot.bookedSlots / snapshot.eligibleSlots) * 100).toFixed(2),
          )
        : 0,
      publishedFillRate: snapshot.eligibleSlots
        ? Number(
            ((snapshot.publishedSlots / snapshot.eligibleSlots) * 100).toFixed(
              2,
            ),
          )
        : 0,
    })),
    dataQuality: {
      level:
        params.snapshots.length >= expectedDays
          ? 'GOOD'
          : params.snapshots.length > 0
            ? 'PARTIAL'
            : 'LOW',
      missingSnapshotDays: expectedDays - coveredDays,
      missingPriceDays: 0,
      missingActualViewsPlacements: 0,
      incompletePaymentAllocations: 0,
      coveragePercent: expectedDays
        ? Number(((coveredDays / expectedDays) * 100).toFixed(2))
        : 100,
      warnings:
        params.snapshots.length >= expectedDays
          ? []
          : [
              'Some daily inventory snapshots are missing for the selected period.',
            ],
    },
  };
}

export type AdSalesInventoryAnalytics = ReturnType<
  typeof buildAdSalesInventoryAnalytics
>;

export function buildAdSalesAnalyticsAlerts(params: {
  dataset: AdSalesAnalyticsDataset;
  inventory: AdSalesInventoryAnalytics;
  from: Date;
  to: Date;
  timezone: string;
  kinds?: Array<
    | 'OVERDUE_PAYMENT'
    | 'MISSED_PLACEMENT'
    | 'DELETION_FAILURE'
    | 'UNDERPRICED_PLACEMENT'
    | 'UNUSED_INVENTORY'
  >;
  now?: Date;
}) {
  const now = params.now ?? new Date();
  const overdueCutoff = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const items = [
    ...params.dataset.placements
      .filter((placement) => {
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
      })
      .map((placement) => ({
        kind: 'OVERDUE_PAYMENT' as const,
        severity: 'warn' as const,
        channelId: placement.telegramChannelId,
        saleId: placement.telegramAdSaleId,
        placementId: placement.id,
        title: 'Overdue unpaid sale',
        details: `${placement.sale.advertiserName} still has unpaid balance`,
        scheduledAt: placement.scheduledAt.toISOString(),
        amount: decimalToString(decimal(placement.agreedPrice)),
        currency: placement.currency,
      })),
    ...params.dataset.placements
      .filter(
        (placement) => placement.status === TelegramAdPlacementStatus.MISSED,
      )
      .map((placement) => ({
        kind: 'MISSED_PLACEMENT' as const,
        severity: 'error' as const,
        channelId: placement.telegramChannelId,
        saleId: placement.telegramAdSaleId,
        placementId: placement.id,
        title: 'Missed placement',
        details: `${placement.sale.advertiserName} missed scheduled publication`,
        scheduledAt: placement.scheduledAt.toISOString(),
        amount: decimalToString(decimal(placement.agreedPrice)),
        currency: placement.currency,
      })),
    ...params.dataset.placements
      .filter((placement) => placement.lastDeletionError)
      .map((placement) => ({
        kind: 'DELETION_FAILURE' as const,
        severity: 'error' as const,
        channelId: placement.telegramChannelId,
        saleId: placement.telegramAdSaleId,
        placementId: placement.id,
        title: 'Deletion failed',
        details: placement.lastDeletionError || 'Deletion failed',
        scheduledAt: placement.plannedDeleteAt?.toISOString() ?? null,
        amount: decimalToString(decimal(placement.agreedPrice)),
        currency: placement.currency,
      })),
    ...params.dataset.placements
      .filter((placement) =>
        decimal(placement.agreedPrice).lt(decimal(placement.minimumPrice)),
      )
      .map((placement) => ({
        kind: 'UNDERPRICED_PLACEMENT' as const,
        severity: 'warn' as const,
        channelId: placement.telegramChannelId,
        saleId: placement.telegramAdSaleId,
        placementId: placement.id,
        title: 'Placement sold below minimum',
        details: `${placement.sale.advertiserName} booked below minimum price`,
        scheduledAt: placement.scheduledAt.toISOString(),
        amount: decimalToString(
          decimal(placement.minimumPrice).sub(decimal(placement.agreedPrice)),
        ),
        currency: placement.currency,
      })),
    ...params.inventory.points
      .filter((point) => point.pastUnusedSlots > 0)
      .map((point) => ({
        kind: 'UNUSED_INVENTORY' as const,
        severity: 'info' as const,
        channelId: point.channelId,
        saleId: null,
        placementId: null,
        title: 'Unused inventory',
        details: `${point.pastUnusedSlots} slot(s) passed unused on ${point.date}`,
        scheduledAt: point.date,
        amount: null,
        currency: null,
      })),
  ].filter((item) =>
    params.kinds?.length ? params.kinds.includes(item.kind) : true,
  );
  return {
    dateFrom: params.from.toISOString(),
    dateTo: params.to.toISOString(),
    timezone: params.timezone,
    items,
  };
}
