import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { mapOperationsNotification } from './operations-notification.mapper';
import { OperationsNotificationEventHub } from './operations-notification-event-hub.service';
import { OperationsWebPushService } from './operations-web-push.service';
import { OperationsNotificationPermissionService } from './operations-notification-permission.service';
import { OPERATIONS_NOTIFICATIONS_DUE_TASK_KEY } from './operations-notification-store.service';
import { notifyScheduledTaskDueWorkChanged } from '../../../common/scheduled-task-wake-notifier';
import {
  OPERATIONS_PUSH_MAX_GROUPS,
  notificationRecipientSelect,
  notificationPreferenceAllows,
} from './operations-web-push-policy';
import type { OperationsPushDispatchResult } from './operations-web-push.service';

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
  ): Promise<OperationsPushDispatchResult> {
    const ids = [...new Set(notificationIds)];
    const result = { attempted: 0, delivered: 0, failed: 0, skipped: 0 };
    for (
      let index = 0;
      index < ids.length;
      index += OPERATIONS_PUSH_MAX_GROUPS
    ) {
      const batch = await this.publishBatch(
        ids.slice(index, index + OPERATIONS_PUSH_MAX_GROUPS),
        options,
      );
      if (batch)
        for (const key of Object.keys(
          result,
        ) as (keyof OperationsPushDispatchResult)[])
          result[key] += batch[key];
    }
    return result;
  }

  private async publishBatch(
    ids: string[],
    options: { wakeRetention?: boolean },
  ) {
    const now = new Date();
    const candidates = await this.prisma.operationsNotification.findMany({
      where: {
        id: { in: ids },
        publishedAt: { not: null, lte: now },
        readAt: null,
        expiresAt: { gt: now },
      },
      include: { recipient: { select: notificationRecipientSelect } },
      take: OPERATIONS_PUSH_MAX_GROUPS,
    });
    const rows = candidates.filter(
      (row) =>
        this.permissions.canAccess(row.recipient, row) &&
        notificationPreferenceAllows(
          row.type,
          row.recipient.operationsNotificationPreference,
        ),
    );
    if (
      options.wakeRetention !== false &&
      this.claimRetentionWake(candidates, now)
    ) {
      notifyScheduledTaskDueWorkChanged(OPERATIONS_NOTIFICATIONS_DUE_TASK_KEY);
    }
    for (const row of rows) {
      const notification = mapOperationsNotification(
        row.type === 'CRM_MESSAGE_RECEIVED' &&
          !row.recipient.operationsNotificationPreference
            ?.crmMessagePreviewEnabled
          ? { ...row, body: 'Open Inbox to read the new message.' }
          : row,
      );
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
    const dispatched = await this.push.dispatch(rows.map((row) => row.id));
    return {
      ...dispatched,
      skipped: dispatched.skipped + ids.length - rows.length,
    };
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
