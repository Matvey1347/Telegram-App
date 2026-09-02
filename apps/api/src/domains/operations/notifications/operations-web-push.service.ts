import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import webPush from 'web-push';
import { PrismaService } from '../../../prisma/prisma.service';
import { mapOperationsNotification } from './operations-notification.mapper';
import { OperationsWebPushConfigService } from './operations-web-push-config.service';
import { OPERATIONS_PUSH_MAX_ACTIVE_DEVICES } from './operations-notification-policy';

const FANOUT_CONCURRENCY = 8;

@Injectable()
export class OperationsWebPushService {
  private activeDeliveries = 0;
  private readonly deliveryWaiters: Array<() => void> = [];

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: OperationsWebPushConfigService,
  ) {
    const value = config.get();
    if (value.enabled) {
      webPush.setVapidDetails(value.subject, value.publicKey, value.privateKey);
    }
  }

  async dispatch(notificationIds: readonly string[]) {
    if (!notificationIds.length || !this.config.get().enabled) return;
    const candidates = await this.prisma.operationsNotification.findMany({
      where: {
        id: { in: [...new Set(notificationIds)] },
        publishedAt: { not: null },
        pushAttemptedAt: null,
        recipient: {
          operationsNotificationPreference: { webPushEnabled: true },
        },
      },
      include: {
        recipient: { select: { userId: true } },
      },
    });
    if (!candidates.length) return;
    const userIds = [
      ...new Set(candidates.map((item) => item.recipient.userId)),
    ];
    const subscriptions = await this.prisma.operationsPushSubscription.findMany(
      {
        where: { userId: { in: userIds }, active: true },
        orderBy: [{ updatedAt: 'desc' }, { id: 'asc' }],
        select: {
          id: true,
          userId: true,
          endpoint: true,
          p256dh: true,
          auth: true,
        },
      },
    );
    const byUser = new Map<string, typeof subscriptions>();
    for (const subscription of subscriptions) {
      const values = byUser.get(subscription.userId) ?? [];
      if (values.length < OPERATIONS_PUSH_MAX_ACTIVE_DEVICES) {
        values.push(subscription);
      }
      byUser.set(subscription.userId, values);
    }
    const deliverable = candidates.filter(
      (item) => (byUser.get(item.recipient.userId)?.length ?? 0) > 0,
    );
    if (!deliverable.length) return;
    const claimed = await this.prisma.$queryRaw<Array<{ id: string }>>(
      Prisma.sql`
        UPDATE "OperationsNotification"
        SET "pushAttemptedAt" = NOW()
        WHERE "id" IN (${Prisma.join(deliverable.map((item) => item.id))})
          AND "pushAttemptedAt" IS NULL
        RETURNING "id"
      `,
    );
    const claimedIds = new Set(claimed.map((item) => item.id));
    const ready = deliverable.filter((item) => claimedIds.has(item.id));
    if (!ready.length) return;
    const deliveries = ready.flatMap((row) =>
      (byUser.get(row.recipient.userId) ?? []).map((subscription) => ({
        row,
        subscription,
      })),
    );
    const staleSubscriptionIds = new Set<string>();
    await this.runBounded(deliveries, FANOUT_CONCURRENCY, async (delivery) => {
      await this.withDeliveryPermit(async () => {
        const notification = mapOperationsNotification(delivery.row);
        try {
          await webPush.sendNotification(
            {
              endpoint: delivery.subscription.endpoint,
              keys: {
                p256dh: delivery.subscription.p256dh,
                auth: delivery.subscription.auth,
              },
            },
            JSON.stringify({
              id: notification.id,
              title: 'New CRM activity',
              body: 'Open Nexeloq to review the update.',
              targetUrl: notification.targetUrl,
            }),
          );
        } catch (error) {
          const status = this.statusCode(error);
          if (status === 404 || status === 410) {
            staleSubscriptionIds.add(delivery.subscription.id);
          }
        }
      });
    });
    if (staleSubscriptionIds.size) {
      await this.prisma.operationsPushSubscription.updateMany({
        where: { id: { in: [...staleSubscriptionIds] }, active: true },
        data: { active: false, disabledAt: new Date() },
      });
    }
  }

  private statusCode(error: unknown) {
    if (!error || typeof error !== 'object' || !('statusCode' in error)) {
      return null;
    }
    return typeof error.statusCode === 'number' ? error.statusCode : null;
  }

  private async runBounded<T>(
    items: readonly T[],
    concurrency: number,
    work: (item: T) => Promise<void>,
  ) {
    let cursor = 0;
    await Promise.all(
      Array.from({ length: Math.min(concurrency, items.length) }, async () => {
        while (cursor < items.length) {
          const index = cursor;
          cursor += 1;
          await work(items[index]);
        }
      }),
    );
  }

  private async withDeliveryPermit(work: () => Promise<void>) {
    await this.acquireDeliveryPermit();
    try {
      await work();
    } finally {
      this.releaseDeliveryPermit();
    }
  }

  private acquireDeliveryPermit() {
    if (this.activeDeliveries < FANOUT_CONCURRENCY) {
      this.activeDeliveries += 1;
      return Promise.resolve();
    }
    return new Promise<void>((resolve) => this.deliveryWaiters.push(resolve));
  }

  private releaseDeliveryPermit() {
    const next = this.deliveryWaiters.shift();
    if (next) next();
    else this.activeDeliveries -= 1;
  }
}
