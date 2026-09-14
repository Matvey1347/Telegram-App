import { Injectable } from '@nestjs/common';
import { TelegramPostBatchDeliveryStatus } from '@prisma/client';
import type { TelegramPostBatchSummary } from '@telegram-system/shared';
import { PrismaService } from '../../../prisma/prisma.service';

export type TelegramPostBatchDeliveryAggregate = {
  deliveryCount: number;
  scheduledCount: number;
  publishedCount: number;
  failedCount: number;
  nextPublicationAt: Date | null;
  nextDeleteAt: Date | null;
};

const EMPTY_AGGREGATE: TelegramPostBatchDeliveryAggregate = {
  deliveryCount: 0,
  scheduledCount: 0,
  publishedCount: 0,
  failedCount: 0,
  nextPublicationAt: null,
  nextDeleteAt: null,
};

const SCHEDULED_STATUSES = new Set<TelegramPostBatchDeliveryStatus>([
  TelegramPostBatchDeliveryStatus.SCHEDULED,
  TelegramPostBatchDeliveryStatus.PUBLISHING,
]);
const PUBLISHED_STATUSES = new Set<TelegramPostBatchDeliveryStatus>([
  TelegramPostBatchDeliveryStatus.PUBLISHED,
  TelegramPostBatchDeliveryStatus.DELETING,
  TelegramPostBatchDeliveryStatus.DELETED,
]);
const FAILED_STATUSES = new Set<TelegramPostBatchDeliveryStatus>([
  TelegramPostBatchDeliveryStatus.FAILED,
  TelegramPostBatchDeliveryStatus.DELETE_FAILED,
]);
const PENDING_DELETE_STATUSES = new Set<TelegramPostBatchDeliveryStatus>([
  TelegramPostBatchDeliveryStatus.PUBLISHED,
  TelegramPostBatchDeliveryStatus.DELETING,
  TelegramPostBatchDeliveryStatus.DELETE_FAILED,
]);

@Injectable()
export class TelegramPostBatchSummaryService {
  constructor(private readonly prisma: PrismaService) {}

  async aggregate(workspaceId: string, batchIds: string[]) {
    const result = new Map<string, TelegramPostBatchDeliveryAggregate>();
    if (!batchIds.length) return result;
    const rows = await this.prisma.telegramPostBatchDelivery.groupBy({
      by: ['batchId', 'status'],
      where: { workspaceId, batchId: { in: batchIds } },
      _count: { _all: true },
      _min: { scheduledAt: true, deleteAt: true },
    });
    for (const row of rows) {
      const current = result.get(row.batchId) ?? { ...EMPTY_AGGREGATE };
      current.deliveryCount += row._count._all;
      if (SCHEDULED_STATUSES.has(row.status)) {
        current.scheduledCount += row._count._all;
        current.nextPublicationAt = earlier(
          current.nextPublicationAt,
          row._min.scheduledAt,
        );
      }
      if (PUBLISHED_STATUSES.has(row.status)) {
        current.publishedCount += row._count._all;
      }
      if (FAILED_STATUSES.has(row.status)) {
        current.failedCount += row._count._all;
      }
      if (PENDING_DELETE_STATUSES.has(row.status)) {
        current.nextDeleteAt = earlier(current.nextDeleteAt, row._min.deleteAt);
      }
      result.set(row.batchId, current);
    }
    return result;
  }

  summary(
    row: {
      id: string;
      title: string;
      status: string;
      version: number;
      channelIds: string[];
      createdAt: Date;
      updatedAt: Date;
      postCount: number;
    },
    aggregate?: TelegramPostBatchDeliveryAggregate,
  ): TelegramPostBatchSummary {
    const totals = aggregate ?? EMPTY_AGGREGATE;
    return {
      id: row.id,
      title: row.title,
      status: row.status as TelegramPostBatchSummary['status'],
      version: row.version,
      postCount: row.postCount,
      channelCount: row.channelIds.length,
      deliveryCount: totals.deliveryCount,
      scheduledCount: totals.scheduledCount,
      publishedCount: totals.publishedCount,
      failedCount: totals.failedCount,
      nextPublicationAt: iso(totals.nextPublicationAt),
      nextDeleteAt: iso(totals.nextDeleteAt),
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }
}

function earlier(left: Date | null, right: Date | null) {
  if (!left) return right;
  if (!right) return left;
  return left.getTime() <= right.getTime() ? left : right;
}

function iso(value: Date | null) {
  return value?.toISOString() ?? null;
}
