import type { PrismaService } from '../../../prisma/prisma.service';
import type { OperationsNotificationPermissionService } from './operations-notification-permission.service';
import type { OperationsNotificationDeliveryPolicyService } from './operations-notification-delivery-policy.service';
import {
  OPERATIONS_PUSH_CONCURRENCY,
  pushPreferenceAllows,
  pushRecipientSelect,
  type OperationsPushRow,
} from './operations-web-push-policy';

export type OperationsQueuedPush = {
  notificationId: string;
  workspaceId: string;
  recipientMemberId: string;
  subscriptionId: string;
  claimedAt: Date;
  queuedAt: number;
};
type FreshPush = {
  row: OperationsPushRow;
  subscription: OperationsPushRow['recipient']['user']['operationsPushSubscriptions'][number];
};
type Pending = {
  ticket: OperationsQueuedPush;
  resolve: (value: FreshPush | null) => void;
  reject: (error: unknown) => void;
};

/** Only ready network permits enter this event-driven, bounded read cohort. */
export class OperationsWebPushFreshness {
  private readonly pending: Pending[] = [];
  private scheduled = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly permissions: OperationsNotificationPermissionService,
    private readonly policies: OperationsNotificationDeliveryPolicyService,
  ) {}

  read(ticket: OperationsQueuedPush) {
    return new Promise<FreshPush | null>((resolve, reject) => {
      this.pending.push({ ticket, resolve, reject });
      this.schedule();
    });
  }

  private schedule() {
    if (this.scheduled) return;
    this.scheduled = true;
    queueMicrotask(() => {
      void this.flush();
    });
  }

  private async flush() {
    const batch = this.pending.splice(0, OPERATIONS_PUSH_CONCURRENCY);
    this.scheduled = false;
    if (this.pending.length) this.schedule();
    try {
      const ready = await this.prisma.$transaction(async (tx) => {
        const now = new Date();
        const scopes = new Map(
          batch.map(({ ticket }) => [
            ticket.notificationId,
            {
              id: ticket.notificationId,
              workspaceId: ticket.workspaceId,
              recipientMemberId: ticket.recipientMemberId,
              pushAttemptedAt: ticket.claimedAt,
            },
          ]),
        );
        const rows = await tx.operationsNotification.findMany({
          where: {
            OR: [...scopes.values()],
            publishedAt: { not: null, lte: now },
            readAt: null,
            expiresAt: { gt: now },
            recipient: {
              operationsNotificationPreference: { webPushEnabled: true },
            },
          },
          include: { recipient: { select: pushRecipientSelect } },
          take: OPERATIONS_PUSH_CONCURRENCY,
        });
        const permitted = rows.filter(
          (row) =>
            row.readAt === null &&
            row.expiresAt > now &&
            row.recipient.workspaceId === row.workspaceId &&
            this.permissions.canAccess(row.recipient, row) &&
            pushPreferenceAllows(
              row.type,
              row.recipient.operationsNotificationPreference,
              row.metadata,
            ),
        );
        const allowed = await this.policies.filter(tx, permitted);
        return new Map(
          permitted
            .filter((row) => allowed.has(row.id))
            .map((row) => [row.id, row]),
        );
      });
      for (const item of batch) {
        const { ticket } = item;
        const row = ready.get(ticket.notificationId);
        const subscription =
          row?.recipient.user.operationsPushSubscriptions.find(
            (value) => value.id === ticket.subscriptionId,
          );
        item.resolve(
          row &&
            subscription &&
            row.workspaceId === ticket.workspaceId &&
            row.recipientMemberId === ticket.recipientMemberId &&
            row.pushAttemptedAt?.getTime() === ticket.claimedAt.getTime()
            ? { row, subscription }
            : null,
        );
      }
    } catch (error) {
      for (const item of batch) item.reject(error);
    }
  }
}
