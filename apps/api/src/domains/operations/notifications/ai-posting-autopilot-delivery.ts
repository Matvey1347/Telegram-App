import { randomUUID } from 'node:crypto';
import type { PrismaService } from '../../../prisma/prisma.service';
import { notifyScheduledTaskDueWorkChanged } from '../../../common/scheduled-task-wake-notifier';

export type AutopilotDeliveryScope = {
  runId: string;
  eventKey: string;
  transport: string;
};

export async function dispatchDueAutopilotNotifications(
  prisma: PrismaService,
  limit: number,
  scope: AutopilotDeliveryScope | undefined,
  sendToWorkspaceBot: (
    workspaceId: string,
    text: string,
    html?: string,
    toAccount?: boolean,
  ) => Promise<void>,
  sendTransport: (
    transport: string,
    workspaceId: string,
    user: { email: string },
    message: {
      title: string;
      body: string;
      targetUrl: string;
      metadata?: unknown;
    },
  ) => Promise<void>,
  recordFailure: (
    runId: string,
    channelId: string,
    attempt: number,
    errorType: string,
    transport: string,
  ) => Promise<void>,
) {
  const now = new Date();
  const due = await prisma.telegramAiPostingNotificationDelivery.findMany({
    where: {
      ...scope,
      status: { in: ['PENDING', 'FAILED'] },
      attempts: { lt: 3 },
      nextAttemptAt: { lte: now },
      OR: [{ claimExpiresAt: null }, { claimExpiresAt: { lte: now } }],
    },
    orderBy: { nextAttemptAt: 'asc' },
    take: Math.min(100, Math.max(1, limit)),
  });
  let delivered = 0;
  let failed = 0;
  for (const delivery of due) {
    const owner = randomUUID();
    const claim = await prisma.telegramAiPostingNotificationDelivery.updateMany(
      {
        where: {
          id: delivery.id,
          status: { in: ['PENDING', 'FAILED'] },
          attempts: { lt: 3 },
          OR: [{ claimExpiresAt: null }, { claimExpiresAt: { lte: now } }],
        },
        data: {
          status: 'SENDING',
          claimOwner: owner,
          claimExpiresAt: new Date(Date.now() + 120_000),
          attempts: { increment: 1 },
        },
      },
    );
    if (!claim.count) continue;
    try {
      if (delivery.telegramMessage) {
        await sendToWorkspaceBot(
          delivery.workspaceId,
          delivery.telegramMessage,
          delivery.telegramParseMode === 'HTML'
            ? delivery.telegramMessage
            : undefined,
          delivery.transport === 'TELEGRAM_PRIVATE',
        );
      } else {
        const [notification, member] = await Promise.all([
          delivery.notificationId
            ? prisma.operationsNotification.findFirst({
                where: { id: delivery.notificationId },
                select: {
                  title: true,
                  body: true,
                  targetUrl: true,
                  metadata: true,
                },
              })
            : null,
          prisma.workspaceMember.findFirst({
            where: {
              id: delivery.memberId,
              workspaceId: delivery.workspaceId,
            },
            select: {
              user: {
                select: {
                  email: true,
                },
              },
            },
          }),
        ]);
        if (!notification || !member)
          throw new Error('NOTIFICATION_RECIPIENT_UNAVAILABLE');
        await sendTransport(
          delivery.transport,
          delivery.workspaceId,
          member.user,
          notification,
        );
      }
      await prisma.telegramAiPostingNotificationDelivery.updateMany({
        where: { id: delivery.id, claimOwner: owner },
        data: {
          status: 'SENT',
          sentAt: new Date(),
          claimOwner: null,
          claimExpiresAt: null,
          nextAttemptAt: null,
        },
      });
      delivered++;
    } catch (error) {
      failed++;
      const errorType = classifyTransportError(error);
      const hasAttempts = delivery.attempts + 1 < 3;
      await prisma.telegramAiPostingNotificationDelivery.updateMany({
        where: { id: delivery.id, claimOwner: owner },
        data: {
          status: 'FAILED',
          claimOwner: null,
          claimExpiresAt: null,
          lastErrorType: errorType,
          lastErrorMessage: errorType,
          nextAttemptAt: hasAttempts ? new Date(Date.now() + 5 * 60_000) : null,
        },
      });
      await recordFailure(
        delivery.runId,
        delivery.channelId,
        delivery.attempts + 1,
        errorType,
        delivery.transport,
      );
      if (hasAttempts)
        notifyScheduledTaskDueWorkChanged('telegram.ai_posting.autopilot');
    }
  }
  return { attempted: due.length, delivered, failed };
}

export function classifyTransportError(error: unknown) {
  const message = error instanceof Error ? error.message : '';
  if (/^(TELEGRAM|EMAIL)_[A-Z0-9_]+$/.test(message))
    return message.slice(0, 80);
  const code =
    error && typeof error === 'object' && 'code' in error
      ? (error as { code?: unknown }).code
      : null;
  if (typeof code === 'string' && /^[A-Z0-9_]{1,32}$/.test(code))
    return `SMTP_${code}`;
  return 'TRANSPORT_DELIVERY_FAILED';
}
