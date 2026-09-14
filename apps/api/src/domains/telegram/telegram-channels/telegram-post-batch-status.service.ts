import { Injectable } from '@nestjs/common';
import { Prisma, TelegramPostBatchStatus } from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';

type BatchStatusClient = Pick<
  Prisma.TransactionClient,
  'telegramPostBatch' | 'telegramPostBatchDelivery'
>;

const liveDeliveryWhere: Prisma.TelegramPostBatchDeliveryWhereInput = {
  OR: [
    { status: 'SCHEDULED', nextAttemptAt: { not: null } },
    { status: 'PUBLISHING', claimExpiresAt: { not: null } },
    { status: 'PUBLISHED', deleteAt: { not: null } },
    { status: 'DELETING', claimExpiresAt: { not: null } },
    { status: 'FAILED', nextAttemptAt: { not: null } },
    { status: 'DELETE_FAILED', nextAttemptAt: { not: null } },
  ],
};

export function terminalPostBatchRepairWhere(): Prisma.TelegramPostBatchWhereInput {
  return {
    status: TelegramPostBatchStatus.ACTIVE,
    deliveries: { none: liveDeliveryWhere },
  };
}

@Injectable()
export class TelegramPostBatchStatusService {
  constructor(private readonly prisma: PrismaService) {}

  async repairTerminalBatches(limit = 50) {
    const rows = await this.prisma.telegramPostBatch.findMany({
      where: terminalPostBatchRepairWhere(),
      orderBy: [{ updatedAt: 'asc' }, { id: 'asc' }],
      take: Math.min(limit, 50),
      select: { id: true },
    });
    await this.refreshMany(
      rows.map((row) => row.id),
      this.prisma,
    );
    return rows.length;
  }

  refresh(batchId: string, client: BatchStatusClient) {
    return this.refreshMany([batchId], client);
  }

  async refreshMany(batchIds: string[], client: BatchStatusClient) {
    const ids = [...new Set(batchIds)];
    if (!ids.length) return;
    const batches = await client.telegramPostBatch.findMany({
      where: { id: { in: ids }, status: TelegramPostBatchStatus.ACTIVE },
      select: {
        id: true,
        channelIds: true,
        _count: { select: { posts: true } },
      },
    });
    if (!batches.length) return;
    const scopedIds = batches.map((batch) => batch.id);
    const totals = await client.telegramPostBatchDelivery.groupBy({
      by: ['batchId', 'status', 'deleteAfterHours'],
      where: { batchId: { in: scopedIds } },
      _count: { _all: true },
    });
    const live = await client.telegramPostBatchDelivery.groupBy({
      by: ['batchId'],
      where: { batchId: { in: scopedIds }, ...liveDeliveryWhere },
      _count: { _all: true },
    });
    const liveIds = new Set(live.map((row) => row.batchId));
    const completed: string[] = [];
    const partial: string[] = [];
    for (const batch of batches) {
      if (liveIds.has(batch.id)) continue;
      const rows = totals.filter((row) => row.batchId === batch.id);
      const actual = rows.reduce((sum, row) => sum + row._count._all, 0);
      const terminalSuccess = rows.reduce(
        (sum, row) =>
          sum +
          (row.status === 'DELETED' ||
          (row.status === 'PUBLISHED' && row.deleteAfterHours === null)
            ? row._count._all
            : 0),
        0,
      );
      const expected = batch._count.posts * batch.channelIds.length;
      (actual === expected && terminalSuccess === actual
        ? completed
        : partial
      ).push(batch.id);
    }
    await this.updateStatus(
      client,
      completed,
      TelegramPostBatchStatus.COMPLETED,
    );
    await this.updateStatus(
      client,
      partial,
      TelegramPostBatchStatus.PARTIAL_FAILURE,
    );
  }

  private async updateStatus(
    client: BatchStatusClient,
    ids: string[],
    status: TelegramPostBatchStatus,
  ) {
    if (!ids.length) return;
    await client.telegramPostBatch.updateMany({
      where: { id: { in: ids }, status: TelegramPostBatchStatus.ACTIVE },
      data: { status },
    });
  }
}
