import {
  classifyTransportError,
  dispatchDueAutopilotNotifications,
  type AutopilotDeliveryScope,
} from './ai-posting-autopilot-delivery';
import { Injectable, Optional } from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import type { PublicationNotificationDestination } from '@telegram-system/shared';
import { randomUUID } from 'node:crypto';
import { OperationsNotificationPriority } from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';
import { TelegramSystemBotNotificationsService } from '../../telegram/telegram-system-bot/telegram-system-bot-notifications.service';
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
  destination?: PublicationNotificationDestination;
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
    private readonly email: OperationsEmailAdapterService,
    @Optional() private readonly moduleRef?: ModuleRef,
  ) {}

  async notify(input: AutopilotNotificationInput) {
    const members = await this.prisma.workspaceMember.findMany({
      where: { workspaceId: input.workspaceId },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      select: {
        ...operationsNotificationMemberSelect,
        user: {
          select: {
            email: true,
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
    if (input.destination && input.destination !== 'IN_APP') {
      const html =
        typeof input.metadata?.telegramHtml === 'string'
          ? input.metadata.telegramHtml
          : null;
      const transport = input.destination;
      await this.prisma.telegramAiPostingNotificationDelivery.createMany({
        data: [
          {
            workspaceId: input.workspaceId,
            channelId: input.channelId,
            runId: input.runId,
            eventKey: input.event,
            memberId: recipients[0].id,
            transport,
            telegramMessage:
              html ?? `${input.title}\n\n${input.body}`.slice(0, 4096),
            telegramParseMode: html ? 'HTML' : null,
            nextAttemptAt: new Date(),
          },
        ],
        skipDuplicates: true,
      });
      notifyScheduledTaskDueWorkChanged('telegram.ai_posting.autopilot');
      const result = await this.retryDueDeliveries(1, {
        runId: input.runId,
        eventKey: input.event,
        transport,
      });
      return {
        recipients: 1,
        delivered: result.delivered,
        failed: result.failed,
      };
    }
    const preferences = input.destination
      ? []
      : await this.prisma.telegramAiPostingNotificationPreference.findMany({
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
        ...(input.destination === 'IN_APP' ? { inAppOnly: true } : {}),
      },
      targetUrl:
        input.targetUrl ??
        `/telegram-posts/${input.channelId}/ai-posting?aiPostingTab=autopilot`,
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
      const critical =
        input.event === 'LOW_SCHEDULE_COVERAGE' ||
        input.event === 'CRITICAL_DRAFT_STOCK' ||
        input.event === 'GENERATION_OR_IMAGE_FAILURE' ||
        input.event === 'AI_API_OR_BUDGET_FAILURE' ||
        input.event === 'PLANNING_OR_PUBLICATION_FAILURE';
      const isGroupNotificationOwner = member.id === recipients[0]?.id;
      return (['TELEGRAM_BOT', 'EMAIL'] as const)
        .filter(
          (transport) =>
            !input.destination &&
            (transport === 'TELEGRAM_BOT'
              ? input.metadata?.suppressTelegram !== true &&
                (critical || input.event === 'WEEKLY_REPORT') &&
                isGroupNotificationOwner
              : settings.email),
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
          await this.sendToWorkspaceBot(
            input.workspaceId,
            `${input.title}\n\n${input.body}`.slice(0, 4096),
            typeof input.metadata?.telegramHtml === 'string'
              ? input.metadata.telegramHtml
              : undefined,
          );
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

  retryDueDeliveries(limit = 50, scope?: AutopilotDeliveryScope) {
    return dispatchDueAutopilotNotifications(
      this.prisma,
      limit,
      scope,
      (...args) => this.sendToWorkspaceBot(...args),
      (...args) => this.sendTransport(...args),
      (...args) => this.recordDeliveryFailure(...args),
    );
  }

  private async sendTransport(
    transport: string,
    workspaceId: string,
    user: {
      email: string;
    },
    message: {
      title: string;
      body: string;
      targetUrl: string;
      metadata?: unknown;
    },
  ) {
    if (transport === 'TELEGRAM_BOT') {
      const metadata = message.metadata as
        | { telegramHtml?: unknown }
        | null
        | undefined;
      await this.sendToWorkspaceBot(
        workspaceId,
        `${message.title}\n\n${message.body}`.slice(0, 4096),
        typeof metadata?.telegramHtml === 'string'
          ? metadata.telegramHtml
          : undefined,
      );
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

  private async sendToWorkspaceBot(
    workspaceId: string,
    text: string,
    html?: string,
    toAccount = false,
  ) {
    if (!this.moduleRef) throw new Error('TELEGRAM_SYSTEM_BOT_NOT_AVAILABLE');
    const notifications = await this.moduleRef.resolve(
      TelegramSystemBotNotificationsService,
      undefined,
      { strict: false },
    );
    const parseMode = html ? 'HTML' : undefined;
    const result = toAccount
      ? await notifications.sendToWorkspaceAccount(
          workspaceId,
          html ?? text,
          parseMode,
        )
      : await notifications.sendToWorkspace(
          workspaceId,
          html ?? text,
          parseMode,
        );
    if (result.status !== 'SENT')
      throw new Error(
        toAccount
          ? 'TELEGRAM_WORKSPACE_NOTIFICATION_ACCOUNT_NOT_CONNECTED'
          : 'TELEGRAM_WORKSPACE_NOTIFICATION_GROUP_NOT_CONNECTED',
      );
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
