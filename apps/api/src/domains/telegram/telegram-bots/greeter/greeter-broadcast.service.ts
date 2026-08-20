import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import {
  GreeterBroadcastAudience,
  GreeterBroadcastRecipientStatus,
  GreeterBroadcastStatus,
  GreeterUserState,
  TelegramBotDeliveryStatus,
} from '@prisma/client';
import type {
  GreeterBroadcastInput,
  GreeterButtonRows,
} from '@telegram-system/shared';
import { sanitizeOperationalError } from '../../../../common/security/operational-error';
import { PrismaService } from '../../../../prisma/prisma.service';
import { telegramMarkupToHtml } from '../../../../telegram/shared/telegram-markup';
import { GreeterAdminService } from './greeter-admin.service';
import { GreeterAutomationService } from './greeter-automation.service';
import { GreeterBroadcastAudienceService } from './greeter-broadcast-audience.service';
import { buildGreeterBroadcastView } from './greeter-broadcast-view';
import {
  assertValidGreeterTemplate,
  renderGreeterTemplate,
} from './greeter-template.renderer';
import { TelegramBotDeliveryService } from '../core/telegram-bot-delivery.service';
import { notifyScheduledTaskDueWorkChanged } from '../../../operations/scheduled-tasks/scheduled-task-wake-notifier';
import {
  GREETER_BROADCAST_RETRY_MS,
  greeterBroadcastDispatchableWhere,
} from '../../../operations/scheduled-tasks/due-work-predicates';

@Injectable()
export class GreeterBroadcastService {
  private readonly logger = new Logger(GreeterBroadcastService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly admin: GreeterAdminService,
    private readonly audiences: GreeterBroadcastAudienceService,
    private readonly automation: GreeterAutomationService,
    private readonly deliveries: TelegramBotDeliveryService,
  ) {}

  async list(userId: string, botId: string) {
    const bot = await this.admin.requireBot(userId, botId);
    const rows = await this.prisma.greeterBroadcast.findMany({
      where: { workspaceId: bot.workspaceId, botIntegrationId: bot.id },
      include: {
        channel: { select: { id: true, title: true, username: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
    return Promise.all(
      rows.map((row) => buildGreeterBroadcastView(this.prisma, row)),
    );
  }

  async detail(userId: string, botId: string, broadcastId: string) {
    const bot = await this.admin.requireBot(userId, botId);
    return buildGreeterBroadcastView(
      this.prisma,
      await this.requireBroadcast(bot.workspaceId, bot.id, broadcastId),
    );
  }

  async create(userId: string, botId: string, input: GreeterBroadcastInput) {
    const bot = await this.admin.requireBot(userId, botId);
    await this.validateInput(bot.workspaceId, bot.id, input);
    const row = await this.prisma.greeterBroadcast.create({
      data: {
        workspaceId: bot.workspaceId,
        botIntegrationId: bot.id,
        name: input.name.trim(),
        messageText: input.messageText,
        buttons: input.buttons as never,
        audience: input.audience,
        channelId: input.channelId || null,
        audienceUserState: input.userState || null,
      },
      include: {
        channel: { select: { id: true, title: true, username: true } },
      },
    });
    return buildGreeterBroadcastView(this.prisma, row);
  }

  async update(
    userId: string,
    botId: string,
    broadcastId: string,
    input: GreeterBroadcastInput,
  ) {
    const bot = await this.admin.requireBot(userId, botId);
    const row = await this.requireBroadcast(
      bot.workspaceId,
      bot.id,
      broadcastId,
    );
    if (row.status !== GreeterBroadcastStatus.DRAFT)
      throw new ConflictException('Only draft broadcasts can be edited');
    await this.validateInput(bot.workspaceId, bot.id, input);
    const updated = await this.prisma.greeterBroadcast.update({
      where: { id: row.id },
      data: {
        name: input.name.trim(),
        messageText: input.messageText,
        buttons: input.buttons as never,
        audience: input.audience,
        channelId: input.channelId || null,
        audienceUserState: input.userState || null,
      },
      include: {
        channel: { select: { id: true, title: true, username: true } },
      },
    });
    return buildGreeterBroadcastView(this.prisma, updated);
  }

  async estimate(userId: string, botId: string, broadcastId: string) {
    const bot = await this.admin.requireBot(userId, botId);
    const row = await this.requireBroadcast(
      bot.workspaceId,
      bot.id,
      broadcastId,
    );
    const recipients = await this.audience(row);
    return {
      recipients: recipients.length,
      audience: row.audience,
      channel: row.channel,
    };
  }

  async sendNow(userId: string, botId: string, broadcastId: string) {
    return this.confirm(userId, botId, broadcastId, new Date());
  }

  async schedule(
    userId: string,
    botId: string,
    broadcastId: string,
    scheduledAt: Date,
  ) {
    if (!Number.isFinite(scheduledAt.getTime()) || scheduledAt <= new Date()) {
      throw new BadRequestException('Scheduled time must be in the future');
    }
    return this.confirm(userId, botId, broadcastId, scheduledAt);
  }

  private async confirm(
    userId: string,
    botId: string,
    broadcastId: string,
    scheduledAt: Date,
  ) {
    const bot = await this.admin.requireBot(userId, botId);
    const row = await this.requireBroadcast(
      bot.workspaceId,
      bot.id,
      broadcastId,
    );
    if (row.status !== GreeterBroadcastStatus.DRAFT)
      return buildGreeterBroadcastView(this.prisma, row);
    const claimed = await this.prisma.greeterBroadcast.updateMany({
      where: { id: row.id, status: GreeterBroadcastStatus.DRAFT },
      data: {
        status: GreeterBroadcastStatus.SCHEDULED,
        scheduledAt,
        confirmedAt: new Date(),
      },
    });
    if (claimed.count !== 1) return this.detail(userId, botId, broadcastId);
    notifyScheduledTaskDueWorkChanged('greeter.broadcasts.dispatch');
    if (scheduledAt <= new Date()) await this.dispatchBroadcast(row.id);
    return this.detail(userId, botId, broadcastId);
  }

  async cancel(userId: string, botId: string, broadcastId: string) {
    const bot = await this.admin.requireBot(userId, botId);
    const row = await this.requireBroadcast(
      bot.workspaceId,
      bot.id,
      broadcastId,
    );
    if (
      row.status === GreeterBroadcastStatus.COMPLETED ||
      row.status === GreeterBroadcastStatus.FAILED ||
      row.status === GreeterBroadcastStatus.PARTIALLY_FAILED
    ) {
      throw new ConflictException('Completed broadcasts cannot be cancelled');
    }
    if (row.status === GreeterBroadcastStatus.CANCELLED)
      return buildGreeterBroadcastView(this.prisma, row);
    const now = new Date();
    await this.prisma.$transaction(async (tx) => {
      const claimed = await tx.greeterBroadcast.updateMany({
        where: {
          id: row.id,
          status: {
            in: [
              GreeterBroadcastStatus.DRAFT,
              GreeterBroadcastStatus.SCHEDULED,
              GreeterBroadcastStatus.PROCESSING,
            ],
          },
        },
        data: { status: GreeterBroadcastStatus.CANCELLED, cancelledAt: now },
      });
      if (claimed.count !== 1) {
        throw new ConflictException('Broadcast can no longer be cancelled');
      }
      await tx.telegramBotDelivery.updateMany({
        where: {
          greeterBroadcastRecipient: { broadcastId: row.id },
          status: {
            in: [
              TelegramBotDeliveryStatus.PENDING,
              TelegramBotDeliveryStatus.RETRY,
            ],
          },
        },
        data: {
          status: TelegramBotDeliveryStatus.CANCELLED,
          lockedAt: null,
          lockedUntil: null,
        },
      });
      await tx.greeterBroadcastRecipient.updateMany({
        where: {
          broadcastId: row.id,
          status: {
            in: [
              GreeterBroadcastRecipientStatus.PENDING,
              GreeterBroadcastRecipientStatus.QUEUED,
            ],
          },
        },
        data: {
          status: GreeterBroadcastRecipientStatus.CANCELLED,
          completedAt: now,
        },
      });
    });
    notifyScheduledTaskDueWorkChanged('greeter.broadcasts.dispatch');
    return this.detail(userId, botId, broadcastId);
  }

  async dispatchDue(limit = 10) {
    const rows = await this.prisma.greeterBroadcast.findMany({
      where: greeterBroadcastDispatchableWhere(new Date()),
      orderBy: { scheduledAt: 'asc' },
      take: limit,
      select: { id: true },
    });
    for (const row of rows) await this.dispatchBroadcast(row.id);
    return { processed: rows.length };
  }

  async dispatchBroadcast(broadcastId: string) {
    const row = await this.prisma.greeterBroadcast.findUnique({
      where: { id: broadcastId },
      include: {
        channel: { select: { id: true, title: true, username: true } },
      },
    });
    if (
      !row ||
      (row.status !== GreeterBroadcastStatus.SCHEDULED &&
        row.status !== GreeterBroadcastStatus.PROCESSING) ||
      !row.scheduledAt ||
      row.scheduledAt > new Date()
    )
      return;
    await this.prisma.greeterBroadcast.updateMany({
      where: { id: row.id, status: GreeterBroadcastStatus.SCHEDULED },
      data: {
        status: GreeterBroadcastStatus.PROCESSING,
        processingStartedAt: new Date(),
      },
    });
    const audience = await this.audience(row);
    await this.prisma.greeterBroadcastRecipient.createMany({
      data: audience.map((item) => ({
        broadcastId: row.id,
        telegramBotUserId: item.telegramBotUserId,
        acquiredChannelId: item.channelId,
      })),
      skipDuplicates: true,
    });
    const recipients = await this.prisma.greeterBroadcastRecipient.findMany({
      where: {
        broadcastId: row.id,
        status: GreeterBroadcastRecipientStatus.PENDING,
      },
      include: { telegramUser: true, acquiredChannel: true },
      take: 250,
    });
    for (const recipient of recipients) {
      const chatId = recipient.telegramUser.telegramChatId;
      if (!chatId || recipient.telegramUser.blockedAt) {
        await this.prisma.greeterBroadcastRecipient.updateMany({
          where: {
            id: recipient.id,
            status: GreeterBroadcastRecipientStatus.PENDING,
          },
          data: {
            status: recipient.telegramUser.blockedAt
              ? GreeterBroadcastRecipientStatus.BLOCKED
              : GreeterBroadcastRecipientStatus.FAILED,
            completedAt: new Date(),
            lastError: recipient.telegramUser.blockedAt
              ? 'Telegram user is blocked or unreachable'
              : 'Telegram user has no reachable private chat',
          },
        });
        continue;
      }
      try {
        const text = telegramMarkupToHtml(
          renderGreeterTemplate(row.messageText, {
            channel: recipient.acquiredChannel ||
              row.channel || { title: 'Channel', username: null },
            user: recipient.telegramUser,
          }),
        );
        const delivery = await this.deliveries.enqueueSendMessage({
          workspaceId: row.workspaceId,
          botIntegrationId: row.botIntegrationId,
          telegramBotUserId: recipient.telegramBotUserId,
          chatId,
          text,
          parseMode: 'HTML',
          inlineButtons: (row.buttons as GreeterButtonRows | null) || undefined,
          scheduledAt: row.scheduledAt,
          idempotencyKey: `greeter-broadcast:${row.id}:${recipient.telegramBotUserId}`,
        });
        const linked = await this.prisma.greeterBroadcastRecipient.updateMany({
          where: {
            id: recipient.id,
            status: GreeterBroadcastRecipientStatus.PENDING,
            broadcast: { status: GreeterBroadcastStatus.PROCESSING },
          },
          data: {
            status: GreeterBroadcastRecipientStatus.QUEUED,
            deliveryId: delivery.id,
            lastError: null,
            nextQueueAttemptAt: null,
          },
        });
        if (linked.count !== 1) {
          await this.prisma.telegramBotDelivery.updateMany({
            where: {
              id: delivery.id,
              status: {
                in: [
                  TelegramBotDeliveryStatus.PENDING,
                  TelegramBotDeliveryStatus.RETRY,
                ],
              },
            },
            data: { status: TelegramBotDeliveryStatus.CANCELLED },
          });
        }
      } catch (error) {
        const reason = sanitizeOperationalError(
          error,
          'Broadcast recipient could not be queued',
        );
        this.logger.warn(
          `Greeter broadcast recipient ${recipient.id} queue failed: ${reason}`,
        );
        await this.prisma.greeterBroadcastRecipient.updateMany({
          where: {
            id: recipient.id,
            status: GreeterBroadcastRecipientStatus.PENDING,
          },
          data: {
            lastError: reason,
            nextQueueAttemptAt: new Date(
              Date.now() + GREETER_BROADCAST_RETRY_MS,
            ),
          },
        });
      }
    }
    await this.finalizeIfTerminal(row.id);
  }

  private async finalizeIfTerminal(broadcastId: string) {
    const recipients = await this.prisma.greeterBroadcastRecipient.findMany({
      where: { broadcastId },
      select: { status: true },
    });
    const terminal = new Set<GreeterBroadcastRecipientStatus>([
      GreeterBroadcastRecipientStatus.SENT,
      GreeterBroadcastRecipientStatus.FAILED,
      GreeterBroadcastRecipientStatus.BLOCKED,
      GreeterBroadcastRecipientStatus.CANCELLED,
    ]);
    if (recipients.some((item) => !terminal.has(item.status))) return;
    const sent = recipients.filter(
      (item) => item.status === GreeterBroadcastRecipientStatus.SENT,
    ).length;
    const status =
      recipients.length === 0 || sent === recipients.length
        ? GreeterBroadcastStatus.COMPLETED
        : sent === 0
          ? GreeterBroadcastStatus.FAILED
          : GreeterBroadcastStatus.PARTIALLY_FAILED;
    await this.prisma.greeterBroadcast.updateMany({
      where: { id: broadcastId, status: GreeterBroadcastStatus.PROCESSING },
      data: { status, completedAt: new Date() },
    });
  }

  private audience(row: {
    workspaceId: string;
    botIntegrationId: string;
    audience: GreeterBroadcastAudience;
    channelId: string | null;
    audienceUserState: GreeterUserState | null;
  }) {
    return this.audiences.resolve({
      workspaceId: row.workspaceId,
      botIntegrationId: row.botIntegrationId,
      audience: {
        audience: row.audience,
        channelId: row.channelId,
        userState: row.audienceUserState,
      },
    });
  }

  private async validateInput(
    workspaceId: string,
    botIntegrationId: string,
    input: GreeterBroadcastInput,
  ) {
    if (!input.name.trim())
      throw new BadRequestException('Broadcast name is required');
    if (!input.messageText.trim() || input.messageText.length > 4096)
      throw new BadRequestException('Message must contain 1-4096 characters');
    try {
      assertValidGreeterTemplate(input.messageText);
    } catch (error) {
      throw new BadRequestException((error as Error).message);
    }
    this.automation.validateButtons(input.buttons);
    await this.audiences.resolve({
      workspaceId,
      botIntegrationId,
      audience: {
        audience: input.audience,
        channelId: input.channelId,
        userState: input.userState,
      },
    });
  }

  private async requireBroadcast(
    workspaceId: string,
    botIntegrationId: string,
    id: string,
  ) {
    const row = await this.prisma.greeterBroadcast.findFirst({
      where: { id, workspaceId, botIntegrationId },
      include: {
        channel: { select: { id: true, title: true, username: true } },
      },
    });
    if (!row) throw new NotFoundException('Broadcast not found');
    return row;
  }
}
