import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import webPush from 'web-push';
import { PrismaService } from '../../../prisma/prisma.service';
import { OperationsWebPushConfigService } from './operations-web-push-config.service';
import { OperationsNotificationPermissionService } from './operations-notification-permission.service';
import { OperationsNotificationDeliveryPolicyService } from './operations-notification-delivery-policy.service';
import {
  OPERATIONS_PUSH_CONCURRENCY,
  OPERATIONS_PUSH_MAX_GROUPS,
  OPERATIONS_PUSH_MAX_QUEUE_AGE_MS,
  OPERATIONS_PUSH_QUEUE_LIMIT,
  OPERATIONS_PUSH_TIMEOUT_MS,
  OPERATIONS_PUSH_TTL_SECONDS,
  pushPayload,
  pushPreferenceAllows,
  pushRecipientSelect,
  type OperationsPushRow,
} from './operations-web-push-policy';
import {
  OperationsWebPushFreshness,
  type OperationsQueuedPush,
} from './operations-web-push-freshness';

export type OperationsPushDispatchResult = {
  attempted: number;
  delivered: number;
  failed: number;
  skipped: number;
};

type PushRow = OperationsPushRow;
type Delivery = {
  row: PushRow;
  queuedAt: number;
  subscription: PushRow['recipient']['user']['operationsPushSubscriptions'][number];
};

@Injectable()
export class OperationsWebPushService {
  private activeDeliveries = 0;
  private reservedDeliveries = 0;
  private readonly deliveryWaiters: Array<() => void> = [];
  private readonly freshness: OperationsWebPushFreshness;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: OperationsWebPushConfigService,
    private readonly permissions: OperationsNotificationPermissionService,
    private readonly policies: OperationsNotificationDeliveryPolicyService,
  ) {
    this.freshness = new OperationsWebPushFreshness(
      prisma,
      permissions,
      policies,
    );
    const value = config.get();
    if (value.enabled)
      webPush.setVapidDetails(value.subject, value.publicKey, value.privateKey);
  }

  async dispatch(
    notificationIds: readonly string[],
  ): Promise<OperationsPushDispatchResult> {
    const ids = [...new Set(notificationIds)];
    const result = {
      attempted: 0,
      delivered: 0,
      failed: 0,
      skipped: ids.length,
    };
    if (!ids.length || !this.config.get().enabled) return result;
    const deliveries = await this.prepare(
      ids.slice(0, OPERATIONS_PUSH_MAX_GROUPS),
    );
    const stale = new Set<string>();
    const attemptedGroups = new Set<string>();
    let validationFailed = false;
    let validationError: unknown;
    await this.runBounded(deliveries, async (ticket) => {
      const { queuedAt, subscriptionId } = ticket;
      let started = false;
      await this.acquireDeliveryPermit();
      try {
        if (
          Date.now() - queuedAt >= OPERATIONS_PUSH_MAX_QUEUE_AGE_MS ||
          stale.has(subscriptionId)
        )
          return;
        const current = await this.freshness.read(ticket);
        if (
          !current ||
          Date.now() - queuedAt >= OPERATIONS_PUSH_MAX_QUEUE_AGE_MS ||
          stale.has(subscriptionId)
        )
          return;
        const { row, subscription } = current;
        const payload = pushPayload(
          row,
          row.recipient.operationsNotificationPreference,
        );
        attemptedGroups.add(row.id);
        result.attempted += 1;
        started = true;
        await webPush.sendNotification(
          {
            endpoint: subscription.endpoint,
            keys: { p256dh: subscription.p256dh, auth: subscription.auth },
          },
          payload,
          {
            TTL: OPERATIONS_PUSH_TTL_SECONDS,
            timeout: OPERATIONS_PUSH_TIMEOUT_MS,
            urgency: row.priority === 'HIGH' ? 'high' : 'normal',
          },
        );
        result.delivered += 1;
      } catch (error) {
        if (!started) {
          validationFailed = true;
          validationError ??= error;
          return;
        }
        result.failed += 1;
        const status = this.statusCode(error);
        if (status === 404 || status === 410) stale.add(subscriptionId);
      } finally {
        this.reservedDeliveries -= 1;
        this.releaseDeliveryPermit();
      }
    });
    if (stale.size)
      await this.prisma.operationsPushSubscription.updateMany({
        where: { id: { in: [...stale] }, active: true },
        data: { active: false, disabledAt: new Date() },
      });
    result.skipped -= attemptedGroups.size;
    if (validationFailed) throw validationError;
    return result;
  }

  private async prepare(ids: readonly string[]) {
    const reserved: Delivery[] = [];
    let held = 0;
    try {
      return await this.prisma.$transaction(async (tx) => {
        const now = new Date();
        const candidates = await tx.operationsNotification.findMany({
          where: {
            id: { in: [...ids] },
            publishedAt: { not: null, lte: now },
            readAt: null,
            expiresAt: { gt: now },
            pushAttemptedAt: null,
            recipient: {
              operationsNotificationPreference: { webPushEnabled: true },
            },
          },
          include: { recipient: { select: pushRecipientSelect } },
          take: OPERATIONS_PUSH_MAX_GROUPS,
        });
        const permitted = candidates.filter(
          (row) =>
            row.recipient.workspaceId === row.workspaceId &&
            this.permissions.canAccess(row.recipient, row) &&
            pushPreferenceAllows(
              row.type,
              row.recipient.operationsNotificationPreference,
            ),
        );
        const allowed = await this.policies.filter(tx, permitted);
        const deliverable = permitted.filter((row) => {
          if (!allowed.has(row.id)) return false;
          const unique = new Map(
            row.recipient.user.operationsPushSubscriptions.map(
              (subscription) => [subscription.id, subscription],
            ),
          );
          const subscriptions = [...unique.values()];
          if (
            !subscriptions.length ||
            this.reservedDeliveries + subscriptions.length >
              OPERATIONS_PUSH_QUEUE_LIMIT
          )
            return false;
          this.reservedDeliveries += subscriptions.length;
          held += subscriptions.length;
          const queuedAt = Date.now();
          reserved.push(
            ...subscriptions.map((subscription) => ({
              row,
              subscription,
              queuedAt,
            })),
          );
          return true;
        });
        if (!deliverable.length) return [];
        const claimedAt = new Date();
        const claimed = await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`
          UPDATE "OperationsNotification" AS notification SET "pushAttemptedAt" = ${claimedAt}
          FROM (VALUES ${Prisma.join(
            deliverable.map(
              (row) => Prisma.sql`(
            CAST(${row.id} AS TEXT), CAST(${row.workspaceId} AS TEXT),
            CAST(${row.recipientMemberId} AS TEXT), CAST(${row.createdAt} AS TIMESTAMPTZ)
          )`,
            ),
          )}) AS incoming("id", "workspaceId", "memberId", "createdAt")
          WHERE notification."id" = incoming."id" AND notification."workspaceId" = incoming."workspaceId"
            AND notification."recipientMemberId" = incoming."memberId" AND notification."createdAt" = incoming."createdAt"
            AND notification."pushAttemptedAt" IS NULL AND notification."readAt" IS NULL
            AND notification."publishedAt" IS NOT NULL AND notification."publishedAt" <= NOW()
            AND notification."expiresAt" > NOW()
            AND EXISTS (SELECT 1 FROM "OperationsNotificationPreference" AS preference
              WHERE preference."workspaceId" = notification."workspaceId" AND preference."memberId" = notification."recipientMemberId"
                AND preference."webPushEnabled" = TRUE
                AND (LEFT(notification."type"::text, 4) <> 'CRM_' OR preference."crmNotificationsEnabled" = TRUE)
                AND (notification."type" <> 'CRM_MESSAGE_RECEIVED'::"OperationsNotificationType" OR preference."crmIncomingMessagesEnabled" = TRUE)
                AND (notification."type" <> 'CRM_FOLLOW_UP_DUE'::"OperationsNotificationType" OR preference."crmFollowUpEnabled" = TRUE)
                AND (notification."type" <> 'CRM_AI_LEAD_QUALIFIED'::"OperationsNotificationType" OR preference."crmAiLeadsEnabled" = TRUE)
                AND (notification."type" <> 'CHANNEL_POSTS_REMINDER'::"OperationsNotificationType" OR preference."channelRemindersPushEnabled" = TRUE))
          RETURNING notification."id"
        `);
        const claimedIds = new Set(claimed.map((row) => row.id));
        const ready = reserved.filter(({ row }) => claimedIds.has(row.id));
        this.reservedDeliveries -= reserved.length - ready.length;
        held = ready.length;
        return ready.map(
          ({ row, subscription, queuedAt }): OperationsQueuedPush => ({
            notificationId: row.id,
            workspaceId: row.workspaceId,
            recipientMemberId: row.recipientMemberId,
            subscriptionId: subscription.id,
            claimedAt,
            queuedAt,
          }),
        );
      });
    } catch (error) {
      this.reservedDeliveries -= held;
      throw error;
    }
  }

  private statusCode(error: unknown) {
    return error &&
      typeof error === 'object' &&
      'statusCode' in error &&
      typeof error.statusCode === 'number'
      ? error.statusCode
      : null;
  }

  private async runBounded<T>(
    items: readonly T[],
    work: (item: T) => Promise<void>,
  ) {
    let cursor = 0;
    await Promise.all(
      Array.from(
        { length: Math.min(OPERATIONS_PUSH_CONCURRENCY, items.length) },
        async () => {
          while (cursor < items.length) {
            const index = cursor++;
            await work(items[index]);
          }
        },
      ),
    );
  }

  private acquireDeliveryPermit() {
    if (this.activeDeliveries < OPERATIONS_PUSH_CONCURRENCY) {
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
