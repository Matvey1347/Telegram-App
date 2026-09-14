import { Injectable } from '@nestjs/common';
import { TelegramPostBatchDeliveryStatus } from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';
import { terminalPostBatchRepairWhere } from './telegram-post-batch-status.service';

@Injectable()
export class TelegramPostBatchDueReadService {
  constructor(private readonly prisma: PrismaService) {}

  async nextDueAt() {
    const [
      scheduled,
      failed,
      publishing,
      published,
      deleteFailed,
      deleting,
      terminalBatch,
    ] = await Promise.all([
      this.earliest('nextAttemptAt', {
        status: TelegramPostBatchDeliveryStatus.SCHEDULED,
        nextAttemptAt: { not: null },
      }),
      this.earliest('nextAttemptAt', {
        status: TelegramPostBatchDeliveryStatus.FAILED,
        nextAttemptAt: { not: null },
      }),
      this.earliest('claimExpiresAt', {
        status: TelegramPostBatchDeliveryStatus.PUBLISHING,
        claimExpiresAt: { not: null },
      }),
      this.earliest('deleteAt', {
        status: TelegramPostBatchDeliveryStatus.PUBLISHED,
        deleteAt: { not: null },
      }),
      this.earliest('nextAttemptAt', {
        status: TelegramPostBatchDeliveryStatus.DELETE_FAILED,
        nextAttemptAt: { not: null },
      }),
      this.earliest('claimExpiresAt', {
        status: TelegramPostBatchDeliveryStatus.DELETING,
        claimExpiresAt: { not: null },
      }),
      this.prisma.telegramPostBatch.findFirst({
        where: terminalPostBatchRepairWhere(),
        orderBy: [{ updatedAt: 'asc' }, { id: 'asc' }],
        select: { updatedAt: true },
      }),
    ]);
    const dates = [
      scheduled?.nextAttemptAt,
      failed?.nextAttemptAt,
      publishing?.claimExpiresAt,
      published?.deleteAt,
      deleteFailed?.nextAttemptAt,
      deleting?.claimExpiresAt,
      terminalBatch?.updatedAt,
    ].filter((value): value is Date => Boolean(value));
    return dates.length
      ? new Date(Math.min(...dates.map((date) => date.getTime())))
      : null;
  }

  private earliest(
    field: 'nextAttemptAt' | 'claimExpiresAt' | 'deleteAt',
    where: Record<string, unknown>,
  ) {
    return this.prisma.telegramPostBatchDelivery.findFirst({
      where,
      orderBy: [{ [field]: 'asc' }, { id: 'asc' }],
      select: {
        nextAttemptAt: true,
        claimExpiresAt: true,
        deleteAt: true,
      },
    });
  }
}
