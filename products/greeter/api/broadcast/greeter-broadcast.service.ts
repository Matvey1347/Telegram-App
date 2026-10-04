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
import type { GreeterBroadcastInput } from '@telegram-system/shared';
import { PrismaService } from '../../../../prisma/prisma.service';
import { GreeterAdminService } from './greeter-admin.service';
import { GreeterAutomationService } from './greeter-automation.service';
import { GreeterBroadcastAudienceService } from './greeter-broadcast-audience.service';
import { buildGreeterBroadcastView } from './greeter-broadcast-view';
import { assertValidGreeterTemplate } from './greeter-template.renderer';
import { TelegramBotDeliveryService } from '../core/telegram-bot-delivery.service';
import { TELEGRAM_BOT_DELIVERY_ENQUEUE_BATCH_SIZE } from '../core/telegram-bot-delivery-batch-enqueue';
import { notifyScheduledTaskDueWorkChanged } from '../../../../common/scheduled-task-wake-notifier';
import { greeterBroadcastDispatchableWhere } from '../../../operations/scheduled-tasks/due-work-predicates';
import { queueGreeterBroadcastRecipientPage } from './greeter-broadcast-batch-link';

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
    const claimed = await this.prisma.greeterBroadcast.updateMany({
      where: { id: row.id, status: GreeterBroadcastStatus.SCHEDULED },
      data: {
        status: GreeterBroadcastStatus.PROCESSING,
        processingStartedAt: new Date(),
      },
    });
    if (
      row.status === GreeterBroadcastStatus.SCHEDULED &&
      claimed.count !== 1
    ) {
      return;
    }
    const materialized = await this.prisma.greeterBroadcastRecipient.findFirst({
      where: { broadcastId: row.id },
      select: { id: true },
    });
    if (!materialized) {
      const audience = await this.audience(row);
      await this.prisma.greeterBroadcastRecipient.createMany({
        data: audience.map((item) => ({
          broadcastId: row.id,
          telegramBotUserId: item.telegramBotUserId,
          acquiredChannelId: item.channelId,
        })),
        skipDuplicates: true,
      });
    }
    const recipients = await this.prisma.greeterBroadcastRecipient.findMany({
      where: {
        broadcastId: row.id,
        status: GreeterBroadcastRecipientStatus.PENDING,
        OR: [
          { nextQueueAttemptAt: null },
          { nextQueueAttemptAt: { lte: new Date() } },
        ],
      },
      orderBy: { id: 'asc' },
      select: {
        id: true,
        telegramBotUserId: true,
        telegramUser: {
          select: {
            telegramChatId: true,
            blockedAt: true,
            firstName: true,
            lastName: true,
            username: true,
          },
        },
        acquiredChannel: {
          select: { title: true, username: true },
        },
      },
      take: TELEGRAM_BOT_DELIVERY_ENQUEUE_BATCH_SIZE,
    });
    await queueGreeterBroadcastRecipientPage(this.prisma, this.deliveries, {
      row: { ...row, scheduledAt: row.scheduledAt },
      recipients,
      now: new Date(),
      onBatchError: (reason) =>
        this.logger.warn(
          `Greeter broadcast ${row.id} queue batch failed: ${reason}`,
        ),
    });
    await this.finalizeIfTerminal(row.id);
  }

  private async finalizeIfTerminal(broadcastId: string) {
    const terminal = [
      GreeterBroadcastRecipientStatus.SENT,
      GreeterBroadcastRecipientStatus.FAILED,
      GreeterBroadcastRecipientStatus.BLOCKED,
      GreeterBroadcastRecipientStatus.CANCELLED,
    ];
    const nonTerminal = await this.prisma.greeterBroadcastRecipient.findFirst({
      where: { broadcastId, status: { notIn: terminal } },
      select: { id: true },
    });
    if (nonTerminal) return;
    const grouped = await this.prisma.greeterBroadcastRecipient.groupBy({
      by: ['status'],
      where: { broadcastId },
      _count: { _all: true },
    });
    const total = grouped.reduce((sum, item) => sum + item._count._all, 0);
    const sent =
      grouped.find(
        (item) => item.status === GreeterBroadcastRecipientStatus.SENT,
      )?._count._all ?? 0;
    const status =
      total === 0 || sent === total
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
