import { Injectable } from '@nestjs/common';
import { TelegramPostBatchDeliveryStatus } from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';

const CLAIM_MS = 5 * 60 * 1_000;
const HEARTBEAT_MS = 60_000;

type LeaseRow = { id: string; claimOwner: string };
type ClaimedStatus =
  | typeof TelegramPostBatchDeliveryStatus.PUBLISHING
  | typeof TelegramPostBatchDeliveryStatus.DELETING;

@Injectable()
export class TelegramPostBatchClaimLeaseService {
  constructor(private readonly prisma: PrismaService) {}

  async runWithClaims<T>(
    rows: LeaseRow[],
    status: ClaimedStatus,
    work: (held: LeaseRow[]) => Promise<T>,
  ): Promise<{ held: false } | { held: true; value: T }> {
    const held = await this.renew(rows, status);
    if (!held.length) return { held: false };
    let heartbeatRunning = false;
    const timer = setInterval(() => {
      if (heartbeatRunning) return;
      heartbeatRunning = true;
      void this.renew(held, status)
        .catch(() => undefined)
        .finally(() => {
          heartbeatRunning = false;
        });
    }, HEARTBEAT_MS);
    timer.unref?.();
    try {
      return { held: true, value: await work(held) };
    } finally {
      clearInterval(timer);
    }
  }

  private async renew(rows: LeaseRow[], status: ClaimedStatus) {
    const now = new Date();
    const claimExpiresAt = new Date(now.getTime() + CLAIM_MS);
    const held: LeaseRow[] = [];
    for (const row of rows) {
      const renewed = await this.prisma.telegramPostBatchDelivery.updateMany({
        where: {
          id: row.id,
          status,
          claimOwner: row.claimOwner,
          claimExpiresAt: { gt: now },
        },
        data: { claimExpiresAt, lastAttemptAt: now },
      });
      if (renewed.count) held.push(row);
    }
    return held;
  }
}
