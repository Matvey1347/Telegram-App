import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { OperationsNotificationPriority } from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';
import { TelegramBotApiClient } from '@api/telegram/shared/bot/telegram-bot-api.client';
import { TelegramSystemBotConfigService } from '../../telegram/telegram-system-bot/telegram-system-bot-config.service';
import { OperationsNotificationStoreService } from './operations-notification-store.service';
import { OperationsNotificationPublisherService } from './operations-notification-publisher.service';
import {
  OperationsNotificationPermissionService,
  operationsNotificationMemberSelect,
} from './operations-notification-permission.service';
import { OperationsEmailAdapterService } from './operations-email-adapter.service';
import { notifyScheduledTaskDueWorkChanged } from '../../../common/scheduled-task-wake-notifier';

export const AI_POSTING_AUTOPILOT_EVENTS = [
  'LOW_SCHEDULE_COVERAGE',
  'CRITICAL_DRAFT_STOCK',
  'GENERATION_OR_IMAGE_FAILURE',
  'AI_API_OR_BUDGET_FAILURE',
  'PLANNING_OR_PUBLICATION_FAILURE',
  'WEEKLY_REPLENISHMENT',
  'WEEKLY_REPORT',
] as const;
export type AiPostingAutopilotEvent =
  (typeof AI_POSTING_AUTOPILOT_EVENTS)[number];
export type AutopilotNotificationInput = {
  workspaceId: string;
  channelId: string;
  runId: string;
  event: AiPostingAutopilotEvent;
  title: string;
  body: string;
  metadata?: Record<string, string | number | boolean | null>;
  priority?: OperationsNotificationPriority;
  targetUrl?: string;
};
type DeliveryPrefs = { telegramBot: boolean; pwaPush: boolean; email: boolean };

@Injectable()
export class AiPostingAutopilotNotificationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly store: OperationsNotificationStoreService,
    private readonly publisher: OperationsNotificationPublisherService,
    private readonly permissions: OperationsNotificationPermissionService,
    private readonly telegram: TelegramBotApiClient,
    private readonly systemBot: TelegramSystemBotConfigService,
    private readonly email: OperationsEmailAdapterService,
  ) {}

  async notify(input: AutopilotNotificationInput) {
    const members = await this.prisma.workspaceMember.findMany({
      where: { workspaceId: input.workspaceId },
      select: {
        ...operationsNotificationMemberSelect,
        user: {
          select: {
            email: true,
            telegramSystemBotConnection: {
              select: { enabled: true, telegramChatId: true },
            },
          },
        },
      },
      take: 500,
    });
    const recipients = members.filter(
      (member) =>
        this.permissions.canReceive(member) &&
        this.permissions.has(member, 'channels.view'),
    );
    if (!recipients.length) return { recipients: 0, delivered: 0, failed: 0 };
    const preferences =
      await this.prisma.telegramAiPostingNotificationPreference.findMany({
        where: {
          workspaceId: input.workspaceId,
          memberId: { in: recipients.map((member) => member.id) },
          eventKey: { in: [input.event, '*'] },
          channelScopeKey: { in: [input.channelId, '*'] },
        },
      });
    const prefsByMember = new Map(
      recipients.map((member) => [
        member.id,
        this.resolvePreferences(
          preferences,
          member.id,
          input.event,
          input.channelId,
        ),
      ]),
    );
    const notifications = recipients.map((member) => ({
      workspaceId: input.workspaceId,
      recipientMemberId: member.id,
      type: 'AI_POSTING_AUTOPILOT' as const,
      priority:
        input.priority ??
        ((input.event.includes('FAILURE') ||
        input.event === 'AI_API_OR_BUDGET_FAILURE'
          ? 'HIGH'
          : 'NORMAL') as OperationsNotificationPriority),
      sourceKey: `ai-posting:${input.channelId}:${input.runId}:${input.event}`,
      copyKey: 'telegram.notification.aiPostingAutopilot',
      title: input.title,
      body: input.body,
      metadata: {
        ...(input.metadata ?? {}),
        channelId: input.channelId,
        runId: input.runId,
        eventKey: input.event,
        pwaPushEnabled: prefsByMember.get(member.id)?.pwaPush ?? true,
      },
      targetUrl:
        input.targetUrl ?? `/telegram-channels/${input.channelId}/ai-posting`,
      requiredPermissionKey: 'channels.view',
      deliverAt: new Date(),
      publishedAt: new Date(),
    }));
    const created = await this.prisma.$transaction((tx) =>
      this.store.insertMany(tx, notifications),
    );
    const rows = await this.prisma.operationsNotification.findMany({
      where: {
        workspaceId: input.workspaceId,
        recipientMemberId: { in: recipients.map((member) => member.id) },
        type: 'AI_POSTING_AUTOPILOT',
        sourceKey: notifications[0].sourceKey,
      },
      select: { id: true, recipientMemberId: true },
    });
    if (created.length) {
      const push = await this.publisher.publish(created.map((row) => row.id));
      if (push.failed)
        await this.prisma.telegramAiPostingAutopilotStage.create({
          data: {
            runId: input.runId,
            stage: 'PWA_PUSH',
            status: 'PARTIAL',
            attempt: 1,
            completedAt: new Date(),
            errorType: 'PWA_PUSH_DELIVERY_FAILED',
            errorMessage: 'PWA_PUSH_DELIVERY_FAILED',
            metadata: {
              attempted: push.attempted,
              failed: push.failed,
              skipped: push.skipped,
            },
          },
        });
    }
    const deliveryInputs = recipients.flatMap((member) => {
      const settings = prefsByMember.get(member.id)!;
      const notificationId = rows.find(
        (row) => row.recipientMemberId === member.id,
      )?.id;
      if (!notificationId) return [];
      return (['TELEGRAM_BOT', 'EMAIL'] as const)
        .filter((transport) =>
          transport === 'TELEGRAM_BOT' ? settings.telegramBot : settings.email,
        )
        .map((transport) => ({
          workspaceId: input.workspaceId,
          memberId: member.id,
          channelId: input.channelId,
          runId: input.runId,
          eventKey: input.event,
          transport,
          notificationId,
          nextAttemptAt: new Date(),
        }));
    });
    if (deliveryInputs.length)
      await this.prisma.telegramAiPostingNotificationDelivery.createMany({
        data: deliveryInputs,
        skipDuplicates: true,
      });
    const deliveries = deliveryInputs.length
      ? await this.prisma.telegramAiPostingNotificationDelivery.findMany({
          where: {
            runId: input.runId,
            eventKey: input.event,
            memberId: { in: recipients.map((member) => member.id) },
            status: { in: ['PENDING', 'FAILED'] },
            attempts: { lt: 3 },
            OR: [
              { nextAttemptAt: null },
              { nextAttemptAt: { lte: new Date() } },
            ],
          },
        })
      : [];
    let delivered = created.length;
    let failed = 0;
    for (const delivery of deliveries) {
      const owner = randomUUID();
      const claimed =
        await this.prisma.telegramAiPostingNotificationDelivery.updateMany({
          where: {
            id: delivery.id,
            status: { in: ['PENDING', 'FAILED'] },
            OR: [
              { claimExpiresAt: null },
              { claimExpiresAt: { lte: new Date() } },
            ],
          },
          data: {
            status: 'SENDING',
            claimOwner: owner,
            claimExpiresAt: new Date(Date.now() + 120_000),
            attempts: { increment: 1 },
          },
        });
      if (!claimed.count) continue;
      const member = recipients.find((item) => item.id === delivery.memberId);
      try {
        if (delivery.transport === 'TELEGRAM_BOT') {
          const connection = member?.user.telegramSystemBotConnection;
          if (!connection?.enabled || !this.systemBot.token)
            throw new Error('TELEGRAM_SYSTEM_BOT_NOT_CONNECTED');
          await this.telegram.sendMessage(this.systemBot.token, {
            chat_id: connection.telegramChatId,
            text: `${input.title}\n\n${input.body}`.slice(0, 4096),
          });
        } else {
          if (!member?.user.email)
            throw new Error('EMAIL_RECIPIENT_UNAVAILABLE');
          await this.email.send({
            recipient: member.user.email,
            title: input.title,
            body: input.body,
            targetUrl:
              input.targetUrl ??
              `/telegram-channels/${input.channelId}/ai-posting`,
          });
        }
        await this.prisma.telegramAiPostingNotificationDelivery.updateMany({
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
        await this.prisma.telegramAiPostingNotificationDelivery.updateMany({
          where: { id: delivery.id, claimOwner: owner },
          data: {
            status: 'FAILED',
            claimOwner: null,
            claimExpiresAt: null,
            lastErrorType: errorType,
            lastErrorMessage: errorType,
            nextAttemptAt:
              delivery.attempts + 1 < 3
                ? new Date(Date.now() + 5 * 60_000)
                : null,
          },
        });
        await this.recordDeliveryFailure(
          delivery.runId,
          delivery.channelId,
          delivery.attempts + 1,
          errorType,
          delivery.transport,
        );
        if (delivery.attempts + 1 < 3)
          notifyScheduledTaskDueWorkChanged('telegram.ai_posting.autopilot');
      }
    }
    return { recipients: recipients.length, delivered, failed };
  }

  async nextDueDeliveryAt() {
    const delivery =
      await this.prisma.telegramAiPostingNotificationDelivery.findFirst({
        where: {
          status: { in: ['PENDING', 'FAILED'] },
          attempts: { lt: 3 },
          nextAttemptAt: { not: null },
        },
        orderBy: { nextAttemptAt: 'asc' },
        select: { nextAttemptAt: true },
      });
    return delivery?.nextAttemptAt ?? null;
  }

  async retryDueDeliveries(limit = 50) {
    const now = new Date();
    const due =
      await this.prisma.telegramAiPostingNotificationDelivery.findMany({
        where: {
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
      const claim =
        await this.prisma.telegramAiPostingNotificationDelivery.updateMany({
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
        });
      if (!claim.count) continue;
      try {
        const [notification, member] = await Promise.all([
          delivery.notificationId
            ? this.prisma.operationsNotification.findFirst({
                where: { id: delivery.notificationId },
                select: { title: true, body: true, targetUrl: true },
              })
            : null,
          this.prisma.workspaceMember.findFirst({
            where: { id: delivery.memberId, workspaceId: delivery.workspaceId },
            select: {
              user: {
                select: {
                  email: true,
                  telegramSystemBotConnection: {
                    select: { enabled: true, telegramChatId: true },
                  },
                },
              },
            },
          }),
        ]);
        if (!notification || !member)
          throw new Error('NOTIFICATION_RECIPIENT_UNAVAILABLE');
        await this.sendTransport(delivery.transport, member.user, notification);
        await this.prisma.telegramAiPostingNotificationDelivery.updateMany({
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
        await this.prisma.telegramAiPostingNotificationDelivery.updateMany({
          where: { id: delivery.id, claimOwner: owner },
          data: {
            status: 'FAILED',
            claimOwner: null,
            claimExpiresAt: null,
            lastErrorType: errorType,
            lastErrorMessage: errorType,
            nextAttemptAt: hasAttempts
              ? new Date(Date.now() + 5 * 60_000)
              : null,
          },
        });
        await this.recordDeliveryFailure(
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

  private async sendTransport(
    transport: string,
    user: {
      email: string;
      telegramSystemBotConnection: {
        enabled: boolean;
        telegramChatId: string;
      } | null;
    },
    message: { title: string; body: string; targetUrl: string },
  ) {
    if (transport === 'TELEGRAM_BOT') {
      const connection = user.telegramSystemBotConnection;
      if (!connection?.enabled || !this.systemBot.token)
        throw new Error('TELEGRAM_SYSTEM_BOT_NOT_CONNECTED');
      await this.telegram.sendMessage(this.systemBot.token, {
        chat_id: connection.telegramChatId,
        text: `${message.title}\n\n${message.body}`.slice(0, 4096),
      });
      return;
    }
    if (!user.email) throw new Error('EMAIL_RECIPIENT_UNAVAILABLE');
    await this.email.send({
      recipient: user.email,
      title: message.title,
      body: message.body,
      targetUrl: message.targetUrl,
    });
  }

  private async recordDeliveryFailure(
    runId: string,
    channelId: string,
    attempt: number,
    errorType: string,
    transport: string,
  ) {
    try {
      await this.prisma.telegramAiPostingAutopilotStage.create({
        data: {
          runId,
          stage: 'NOTIFICATION_DELIVERY',
          status: 'FAILED',
          attempt,
          errorType,
          errorMessage: errorType,
          metadata: { channelId, transport },
        },
      });
    } catch {
      // Delivery ledger remains the durable fallback if stage logging is unavailable.
    }
  }

  async preferences(
    userId: string,
    workspaceId: string,
    memberId: string,
    channelId?: string,
  ) {
    return this.prisma.telegramAiPostingNotificationPreference.findMany({
      where: {
        workspaceId,
        memberId,
        ...(channelId ? { channelScopeKey: { in: ['*', channelId] } } : {}),
      },
      orderBy: [{ channelScopeKey: 'asc' }, { eventKey: 'asc' }],
    });
  }

  async updatePreference(input: {
    workspaceId: string;
    memberId: string;
    eventKey: string;
    channelId?: string;
    telegramBot: boolean;
    pwaPush: boolean;
    email: boolean;
  }) {
    if (
      input.eventKey !== '*' &&
      !AI_POSTING_AUTOPILOT_EVENTS.includes(
        input.eventKey as AiPostingAutopilotEvent,
      )
    )
      throw new Error('AI_POSTING_NOTIFICATION_EVENT_INVALID');
    const channelScopeKey = input.channelId ?? '*';
    return this.prisma.telegramAiPostingNotificationPreference.upsert({
      where: {
        workspaceId_memberId_eventKey_channelScopeKey: {
          workspaceId: input.workspaceId,
          memberId: input.memberId,
          eventKey: input.eventKey,
          channelScopeKey,
        },
      },
      create: {
        workspaceId: input.workspaceId,
        memberId: input.memberId,
        eventKey: input.eventKey,
        channelScopeKey,
        telegramBot: input.telegramBot,
        pwaPush: input.pwaPush,
        email: input.email,
      },
      update: {
        telegramBot: input.telegramBot,
        pwaPush: input.pwaPush,
        email: input.email,
      },
    });
  }

  private resolvePreferences(
    rows: Array<{
      memberId: string;
      eventKey: string;
      channelScopeKey: string;
      telegramBot: boolean;
      pwaPush: boolean;
      email: boolean;
    }>,
    memberId: string,
    event: string,
    channelId: string,
  ): DeliveryPrefs {
    const fallback = { telegramBot: false, pwaPush: true, email: false };
    const specific = rows.find(
      (row) =>
        row.memberId === memberId &&
        row.eventKey === event &&
        row.channelScopeKey === channelId,
    );
    const globalEvent = rows.find(
      (row) =>
        row.memberId === memberId &&
        row.eventKey === event &&
        row.channelScopeKey === '*',
    );
    const channel = rows.find(
      (row) =>
        row.memberId === memberId &&
        row.eventKey === '*' &&
        row.channelScopeKey === channelId,
    );
    const global = rows.find(
      (row) =>
        row.memberId === memberId &&
        row.eventKey === '*' &&
        row.channelScopeKey === '*',
    );
    const selected = specific ?? globalEvent ?? channel ?? global;
    return selected
      ? {
          telegramBot: selected.telegramBot,
          pwaPush: selected.pwaPush,
          email: selected.email,
        }
      : fallback;
  }
}

function classifyTransportError(error: unknown) {
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
