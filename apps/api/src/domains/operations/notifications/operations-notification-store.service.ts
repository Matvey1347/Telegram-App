import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import {
  OperationsNotificationPriority,
  OperationsNotificationType,
  Prisma,
} from '@prisma/client';
import { notifyScheduledTaskDueWorkChanged } from '../../../common/scheduled-task-wake-notifier';
import { requireInternalNotificationTarget } from './operations-notification-target';

export const OPERATIONS_NOTIFICATIONS_DUE_TASK_KEY =
  'operations.notifications.publish_due';
const RETENTION_MS = 90 * 24 * 60 * 60 * 1_000;
const DAY_MS = 24 * 60 * 60 * 1_000;

export type OperationsNotificationInsert = {
  workspaceId: string;
  recipientMemberId: string;
  type: OperationsNotificationType;
  priority: OperationsNotificationPriority;
  sourceKey: string;
  copyKey: string;
  title: string;
  body: string;
  metadata: Record<string, string | number | boolean | null>;
  targetUrl: string;
  requiredPermissionKey?: string | null;
  ownPermissionKey?: string | null;
  anyPermissionKey?: string | null;
  visibilityMemberId?: string | null;
  visibilityResourceKey?: string | null;
  deliverAt?: Date;
  publishedAt?: Date | null;
};

@Injectable()
export class OperationsNotificationStoreService {
  async insertMany(
    tx: Prisma.TransactionClient,
    inputs: readonly OperationsNotificationInsert[],
  ) {
    if (!inputs.length) return [];
    const rows = this.rows(inputs);
    return tx.operationsNotification.createManyAndReturn({
      data: rows,
      skipDuplicates: true,
      select: { id: true },
    });
  }

  async upsertMany(
    tx: Prisma.TransactionClient,
    inputs: readonly OperationsNotificationInsert[],
  ) {
    if (!inputs.length) return [];
    const rows = this.rows(inputs);
    return tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`
      INSERT INTO "OperationsNotification" (
        "id", "workspaceId", "recipientMemberId", "type", "priority",
        "sourceKey", "copyKey", "title", "body", "metadata", "targetUrl",
        "requiredPermissionKey", "ownPermissionKey", "anyPermissionKey",
        "visibilityMemberId", "visibilityResourceKey", "readAt", "deliverAt",
        "publishedAt", "expiresAt", "pushAttemptedAt", "createdAt"
      )
      VALUES ${Prisma.join(
        rows.map(
          (row) => Prisma.sql`(
            ${randomUUID()}, ${row.workspaceId}, ${row.recipientMemberId},
            ${row.type}::"OperationsNotificationType",
            ${row.priority}::"OperationsNotificationPriority",
            ${row.sourceKey}, ${row.copyKey}, ${row.title}, ${row.body},
            ${JSON.stringify(row.metadata)}::jsonb, ${row.targetUrl},
            ${row.requiredPermissionKey}, ${row.ownPermissionKey},
            ${row.anyPermissionKey}, ${row.visibilityMemberId},
            ${row.visibilityResourceKey}, NULL, ${row.deliverAt},
            ${row.publishedAt}, ${row.expiresAt}, NULL,
            ${row.publishedAt ?? row.deliverAt}
          )`,
        ),
      )}
      ON CONFLICT ("workspaceId", "recipientMemberId", "type", "sourceKey")
      DO UPDATE SET
        "priority" = EXCLUDED."priority",
        "copyKey" = EXCLUDED."copyKey",
        "title" = EXCLUDED."title",
        "body" = EXCLUDED."body",
        "metadata" = EXCLUDED."metadata",
        "targetUrl" = EXCLUDED."targetUrl",
        "requiredPermissionKey" = EXCLUDED."requiredPermissionKey",
        "ownPermissionKey" = EXCLUDED."ownPermissionKey",
        "anyPermissionKey" = EXCLUDED."anyPermissionKey",
        "visibilityMemberId" = EXCLUDED."visibilityMemberId",
        "visibilityResourceKey" = EXCLUDED."visibilityResourceKey",
        "readAt" = NULL,
        "deliverAt" = EXCLUDED."deliverAt",
        "publishedAt" = EXCLUDED."publishedAt",
        "expiresAt" = EXCLUDED."expiresAt",
        "pushAttemptedAt" = NULL,
        "createdAt" = EXCLUDED."createdAt"
      RETURNING "id"
    `);
  }

  cancelPending(
    tx: Prisma.TransactionClient,
    input: {
      workspaceId: string;
      type: OperationsNotificationType;
      sourceKeyPrefix: string;
    },
  ) {
    return tx.operationsNotification.deleteMany({
      where: {
        workspaceId: input.workspaceId,
        type: input.type,
        sourceKey: { startsWith: input.sourceKeyPrefix },
        publishedAt: null,
      },
    });
  }

  async reassignVisibility(
    tx: Prisma.TransactionClient,
    input: {
      workspaceId: string;
      visibilityResourceKey: string;
      recipientMemberId: string | null;
      visibilityMemberId: string | null;
    },
  ) {
    const published = await tx.operationsNotification.findMany({
      where: {
        workspaceId: input.workspaceId,
        visibilityResourceKey: input.visibilityResourceKey,
        publishedAt: { not: null },
      },
      distinct: ['recipientMemberId'],
      select: { recipientMemberId: true },
    });
    await tx.operationsNotification.deleteMany({
      where: {
        workspaceId: input.workspaceId,
        visibilityResourceKey: input.visibilityResourceKey,
        publishedAt: { not: null },
      },
    });
    const pendingWhere = {
      workspaceId: input.workspaceId,
      visibilityResourceKey: input.visibilityResourceKey,
      publishedAt: null,
    } as const;
    if (input.recipientMemberId) {
      await tx.operationsNotification.updateMany({
        where: pendingWhere,
        data: {
          recipientMemberId: input.recipientMemberId,
          visibilityMemberId: input.visibilityMemberId,
        },
      });
    } else {
      await tx.operationsNotification.deleteMany({ where: pendingWhere });
    }
    return published.map((item) => item.recipientMemberId);
  }

  notifyDueWorkChanged() {
    notifyScheduledTaskDueWorkChanged(OPERATIONS_NOTIFICATIONS_DUE_TASK_KEY);
  }

  private retentionBucket(timestamp: number) {
    return new Date(Math.ceil(timestamp / DAY_MS) * DAY_MS);
  }

  private rows(inputs: readonly OperationsNotificationInsert[]) {
    const now = new Date();
    return inputs.map((input) => {
      const deliverAt = input.deliverAt ?? now;
      return {
        ...input,
        targetUrl: requireInternalNotificationTarget(input.targetUrl),
        metadata: input.metadata,
        deliverAt,
        publishedAt:
          input.publishedAt === undefined
            ? deliverAt <= now
              ? now
              : null
            : input.publishedAt,
        expiresAt: this.retentionBucket(
          Math.max(now.getTime(), deliverAt.getTime()) + RETENTION_MS,
        ),
      };
    });
  }
}
