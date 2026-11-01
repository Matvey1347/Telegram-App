import { Injectable } from '@nestjs/common';
import type { OperationsNotificationTestResult } from '@telegram-system/shared';
import { PrismaService } from '../../../prisma/prisma.service';
import { acquirePostgresTransactionLock } from '../../../prisma/postgres-advisory-lock';
import { WorkspaceAuthorizationService } from '../../workspace/workspace-authorization/workspace-authorization.service';
import { OperationsNotificationStoreService } from './operations-notification-store.service';
import { OperationsNotificationPublisherService } from './operations-notification-publisher.service';
import { OperationsNotificationPreferencesService } from './operations-notification-preferences.service';
import { OperationsWebPushConfigService } from './operations-web-push-config.service';

const TEST_COOLDOWN_MS = 60_000;
const empty = (
  status: OperationsNotificationTestResult['status'],
): OperationsNotificationTestResult => ({
  status,
  attempted: 0,
  delivered: 0,
  failed: 0,
  skipped: 0,
});

@Injectable()
export class OperationsNotificationTestService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly authorization: WorkspaceAuthorizationService,
    private readonly preferences: OperationsNotificationPreferencesService,
    private readonly config: OperationsWebPushConfigService,
    private readonly store: OperationsNotificationStoreService,
    private readonly publisher: OperationsNotificationPublisherService,
  ) {}

  async send(userId: string): Promise<OperationsNotificationTestResult> {
    const access = await this.authorization.require(
      userId,
      'operations.notifications',
    );
    if (!this.config.get().enabled) return empty('unavailable');
    const preference = await this.preferences.preferences(userId);
    if (!preference.webPushEnabled) return empty('disabled');
    if (!preference.activeSubscriptionCount) return empty('no_subscription');
    const ids = await this.prisma.$transaction(async (tx) => {
      await acquirePostgresTransactionLock(
        tx,
        `notification-test:${access.workspaceId}:${access.memberId}`,
      );
      const now = new Date();
      const previous = await tx.operationsNotification.findUnique({
        where: {
          workspaceId_recipientMemberId_type_sourceKey: {
            workspaceId: access.workspaceId,
            recipientMemberId: access.memberId,
            type: 'SYSTEM_TEST',
            sourceKey: 'push-test',
          },
        },
        select: { createdAt: true },
      });
      if (
        previous &&
        now.getTime() - previous.createdAt.getTime() < TEST_COOLDOWN_MS
      )
        return [];
      return this.store.upsertMany(tx, [
        {
          workspaceId: access.workspaceId,
          recipientMemberId: access.memberId,
          type: 'SYSTEM_TEST',
          priority: 'NORMAL',
          sourceKey: 'push-test',
          copyKey: 'operations.notification.pushTest',
          title: 'Nexeloq test notification',
          body: 'Push is working for this device.',
          metadata: {},
          targetUrl: '/settings',
          requiredPermissionKey: 'operations.notifications',
          publishedAt: now,
        },
      ]);
    });
    if (!ids.length) return empty('rate_limited');
    const delivery = await this.publisher.publish(ids.map((row) => row.id));
    return { status: delivery.delivered > 0 ? 'sent' : 'failed', ...delivery };
  }
}
