import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { mapOperationsNotification } from './operations-notification.mapper';
import { OperationsNotificationEventHub } from './operations-notification-event-hub.service';
import { OperationsWebPushService } from './operations-web-push.service';
import {
  OperationsNotificationPermissionService,
  operationsNotificationMemberSelect,
} from './operations-notification-permission.service';
import { OPERATIONS_NOTIFICATIONS_DUE_TASK_KEY } from './operations-notification-store.service';
import { notifyScheduledTaskDueWorkChanged } from '../../../common/scheduled-task-wake-notifier';

@Injectable()
export class OperationsNotificationPublisherService {
  private readonly retentionBuckets = new Set<number>();
  constructor(
    private readonly prisma: PrismaService,
    private readonly events: OperationsNotificationEventHub,
    private readonly push: OperationsWebPushService,
    private readonly permissions: OperationsNotificationPermissionService,
  ) {}

  async publish(
    notificationIds: readonly string[],
    options: { wakeRetention?: boolean } = {},
  ) {
    const ids = [...new Set(notificationIds)];
    if (!ids.length) return;
    const now = new Date();
    const candidates = await this.prisma.operationsNotification.findMany({
      where: {
        id: { in: ids },
        publishedAt: { not: null, lte: now },
        expiresAt: { gt: now },
      },
      include: { recipient: { select: operationsNotificationMemberSelect } },
    });
    const rows = candidates.filter((row) =>
      this.permissions.canAccess(row.recipient, row),
    );
    if (
      options.wakeRetention !== false &&
      this.claimRetentionWake(candidates, now)
    ) {
      notifyScheduledTaskDueWorkChanged(OPERATIONS_NOTIFICATIONS_DUE_TASK_KEY);
    }
    for (const row of rows) {
      const notification = mapOperationsNotification(row);
      this.events.emit({
        type: 'notification.created',
        workspaceId: row.workspaceId,
        recipientMemberId: row.recipientMemberId,
        occurredAt: row.publishedAt!.toISOString(),
        notification,
        requiredPermissionKey: row.requiredPermissionKey,
        ownPermissionKey: row.ownPermissionKey,
        anyPermissionKey: row.anyPermissionKey,
        visibilityMemberId: row.visibilityMemberId,
      });
    }
    await this.push.dispatch(rows.map((row) => row.id));
  }

  invalidate(workspaceId: string, recipientMemberIds: readonly string[]) {
    const occurredAt = new Date().toISOString();
    for (const recipientMemberId of new Set(recipientMemberIds)) {
      this.events.emit({
        type: 'notifications.invalidated',
        workspaceId,
        recipientMemberId,
        occurredAt,
      });
    }
  }

  private claimRetentionWake(rows: readonly { expiresAt: Date }[], now: Date) {
    for (const bucket of this.retentionBuckets) {
      if (bucket <= now.getTime()) this.retentionBuckets.delete(bucket);
    }
    let changed = false;
    for (const row of rows) {
      const bucket = row.expiresAt.getTime();
      if (!this.retentionBuckets.has(bucket)) {
        this.retentionBuckets.add(bucket);
        changed = true;
      }
    }
    return changed;
  }
}
