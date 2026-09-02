import { Injectable } from '@nestjs/common';
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
    const now = new Date();
    const rows = inputs.map((input) => {
      const deliverAt = input.deliverAt ?? now;
      return {
        ...input,
        targetUrl: requireInternalNotificationTarget(input.targetUrl),
        metadata: input.metadata as Prisma.InputJsonValue,
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
    return tx.operationsNotification.createManyAndReturn({
      data: rows,
      skipDuplicates: true,
      select: { id: true },
    });
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
}
