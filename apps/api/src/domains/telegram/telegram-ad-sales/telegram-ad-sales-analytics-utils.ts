import { BadRequestException } from '@nestjs/common';
import { Prisma, TelegramAdSalePaymentStatus } from '@prisma/client';
import { TelegramAdAnalyticsQueryDto } from './dto';
import { decimal } from './domain/decimal';

export function resolveAdSalesAnalyticsRange(
  query?: TelegramAdAnalyticsQueryDto,
) {
  const timezone = query?.timezone?.trim() || 'UTC';
  const now = new Date();
  const fallbackDays = Math.max(1, Math.min(366, query?.rangeDays ?? 30));
  const fallbackFrom = new Date(
    now.getTime() - (fallbackDays - 1) * 24 * 60 * 60 * 1000,
  );
  const rawFrom =
    query?.dateFrom || query?.from
      ? new Date(query.dateFrom ?? query.from!)
      : fallbackFrom;
  const rawTo =
    query?.dateTo || query?.to ? new Date(query.dateTo ?? query.to!) : now;
  const from = Number.isNaN(rawFrom.getTime()) ? fallbackFrom : rawFrom;
  const to = Number.isNaN(rawTo.getTime()) ? now : rawTo;
  const normalized = from <= to ? { from, to } : { from: to, to: from };
  const days =
    Math.floor(
      (normalized.to.getTime() - normalized.from.getTime()) /
        (24 * 60 * 60 * 1000),
    ) + 1;
  if (days > 366 && !query?.allTime) {
    throw new BadRequestException('Analytics range cannot exceed 366 days');
  }
  return { ...normalized, timezone };
}

export function adSalesAnalyticsDateRules() {
  return [
    {
      metric: 'revenue.totalAgreedRevenue',
      dateField: 'placementScheduledAt',
      description:
        'Agreed placement revenue is attributed by placement scheduledAt.',
    },
    {
      metric: 'revenue.totalPaidRevenue',
      dateField: 'paymentPaidAt',
      description: 'Paid revenue is attributed by payment paidAt.',
    },
    {
      metric: 'placements.*',
      dateField: 'placementScheduledAt',
      description:
        'Placement and inventory metrics are attributed by placement scheduledAt.',
    },
    {
      metric: 'performance.actualViews*',
      dateField: 'placementPublishedAt',
      description:
        'Actual performance metrics are attributed by placement publishedAt when present.',
    },
    {
      metric: 'operations.overdueUnpaidSales',
      dateField: 'saleCreatedAt',
      description:
        'Overdue unpaid sales use sale createdAt for aging and current outstanding state.',
    },
  ] as const;
}

export function medianAdSalesDecimal(values: Prisma.Decimal[]) {
  if (!values.length) return decimal(0);
  const sorted = [...values].sort((left, right) => left.comparedTo(right));
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1
    ? sorted[middle]
    : sorted[middle - 1].add(sorted[middle]).div(2);
}

export function bucketAdSalesAnalyticsDate(
  value: Date,
  granularity: 'day' | 'week' | 'month',
) {
  const date = new Date(value);
  if (granularity === 'month') {
    date.setUTCDate(1);
  } else if (granularity === 'week') {
    const day = date.getUTCDay() || 7;
    date.setUTCDate(date.getUTCDate() - day + 1);
  }
  date.setUTCHours(0, 0, 0, 0);
  return date.toISOString().slice(0, 10);
}

export function selectedAdSalesAnalyticsChannelIds(
  query: TelegramAdAnalyticsQueryDto,
) {
  return query.channelIds?.length ? query.channelIds : undefined;
}

export function sumAdSalesPaidAllocations(
  placements: Array<{
    paymentAllocations?: Array<{
      amount: Prisma.Decimal | string | number;
      payment?: { status?: TelegramAdSalePaymentStatus | null } | null;
    }>;
  }>,
) {
  return placements.reduce(
    (sum, placement) =>
      sum.add(
        (placement.paymentAllocations ?? []).reduce(
          (inner, allocation) =>
            allocation.payment?.status === TelegramAdSalePaymentStatus.VOIDED
              ? inner
              : inner.add(decimal(allocation.amount)),
          decimal(0),
        ),
      ),
    decimal(0),
  );
}

export function commonAdSalesCurrency(
  items: Array<{ currency?: string | null }>,
): string | null {
  const currencies = [
    ...new Set(
      items
        .map((item) => item.currency?.toUpperCase())
        .filter((currency): currency is string => Boolean(currency)),
    ),
  ];
  return currencies.length === 1 ? currencies[0] : null;
}

export function startOfUtcDay(value: Date) {
  const date = new Date(value);
  date.setUTCHours(0, 0, 0, 0);
  return date;
}

export function endOfUtcDay(value: Date) {
  const date = new Date(value);
  date.setUTCHours(23, 59, 59, 999);
  return date;
}

export function listUtcDatesInRange(from: Date, to: Date) {
  const dates: Date[] = [];
  for (
    let cursor = startOfUtcDay(from);
    cursor <= to;
    cursor = new Date(cursor.getTime() + 24 * 60 * 60 * 1000)
  ) {
    dates.push(new Date(cursor));
  }
  return dates;
}
