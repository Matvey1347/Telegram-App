import {
  OperationsNotificationPriority,
  OperationsNotificationType,
  TelegramUserAccountStatus,
  WorkspaceRole,
} from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';
import { OperationsNotificationStoreService } from '../../operations/notifications/operations-notification-store.service';
import { OperationsNotificationPublisherService } from '../../operations/notifications/operations-notification-publisher.service';
import {
  crmRuntimeAccountSelect,
  type CrmRuntimeAccount,
} from './telegram-crm-account-session.service';
import { CRM_RUNTIME_POLICY } from './telegram-crm-runtime.policy';

export async function notifyCrmReauthentication(
  prisma: PrismaService,
  notifications: OperationsNotificationStoreService | undefined,
  publisher: OperationsNotificationPublisherService | undefined,
  account: CrmRuntimeAccount,
) {
  if (!notifications || !publisher) return;
  const creator = account.createdByUserId
    ? await prisma.workspaceMember.findFirst({
        where: {
          workspaceId: account.workspaceId,
          userId: account.createdByUserId,
        },
        select: { id: true },
      })
    : null;
  const owner =
    account.assignedMemberId || creator
      ? null
      : await prisma.workspaceMember.findFirst({
          where: {
            workspaceId: account.workspaceId,
            role: WorkspaceRole.owner,
          },
          orderBy: { createdAt: 'asc' },
          select: { id: true },
        });
  const recipientMemberId =
    account.assignedMemberId ?? creator?.id ?? owner?.id;
  if (!recipientMemberId) return;

  try {
    const notificationIds = await prisma.$transaction((tx) =>
      notifications.upsertMany(tx, [
        {
          workspaceId: account.workspaceId,
          recipientMemberId,
          type: OperationsNotificationType.TELEGRAM_ACCOUNT_REAUTH_REQUIRED,
          priority: OperationsNotificationPriority.HIGH,
          sourceKey: `telegram-account:${account.id}:reauth-required`,
          copyKey: 'telegram.notification.accountReauthRequired',
          title: 'Telegram account disconnected',
          body: `${account.label} needs to be reconnected via QR.`,
          metadata: {
            presentationKind: 'telegram-account',
            accountId: account.id,
            accountLabel: account.label,
            avatarUrl: account.photoUrl ?? null,
            action: 'qr-login',
          },
          targetUrl: '/telegram-channels?tab=accounts&accountTab=mtproto',
        },
      ]),
    );
    await publisher.publish(notificationIds.map(({ id }) => id));
  } catch {
    // The account transition is already durable; a notification failure must
    // not restart the revoked MTProto session or cause a retry loop.
  }
}

/** Existing bounded startup repair, not a recurring scan. */
export async function reconcileCrmRevokedNotifications(
  prisma: PrismaService,
  notifications: OperationsNotificationStoreService | undefined,
  publisher: OperationsNotificationPublisherService | undefined,
  notify: (account: CrmRuntimeAccount) => Promise<void>,
) {
  if (!notifications || !publisher) return;
  const accounts = await prisma.telegramUserAccountIntegration.findMany({
    where: {
      status: TelegramUserAccountStatus.error,
      lastErrorMessage: {
        contains: 'session was revoked',
        mode: 'insensitive',
      },
    },
    select: crmRuntimeAccountSelect,
    take: 100,
    orderBy: { updatedAt: 'desc' },
  });
  for (const account of accounts) {
    await notify(account);
  }
}

export async function waitForCrmStartupBudget(
  startupConnections: Promise<void>,
) {
  let budgetTimer: NodeJS.Timeout | undefined;
  const budgetExpired = new Promise<void>((resolve) => {
    budgetTimer = setTimeout(
      resolve,
      CRM_RUNTIME_POLICY.startupHttpReadyBudgetMs,
    );
    budgetTimer.unref?.();
  });
  try {
    await Promise.race([startupConnections, budgetExpired]);
  } finally {
    if (budgetTimer) clearTimeout(budgetTimer);
  }
}
