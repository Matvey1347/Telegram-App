import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import {
  Prisma,
  TelegramBotDeliveryStatus,
  TelegramBotDeliveryType,
  TelegramBotRuntimeEnvironment,
  TelegramBotRuntimeStatus,
} from '@prisma/client';
import { TokenEncryptionService } from '../../../../common/security/token-encryption.service';
import { PrismaService } from '../../../../prisma/prisma.service';
import {
  TelegramBotApiClient,
  TelegramBotApiError,
} from '../../../../telegram/shared/telegram-bot-api.client';
import { telegramBotMessagePayload, type TelegramBotMessage } from '../../../../telegram/shared/telegram-bot-message';
import { sanitizeOperationalError } from '../../../../common/security/operational-error';
import { TelegramBotDeliveryScheduler } from './telegram-bot-delivery-scheduler';
import { TelegramBotRuntimeEnvironmentService } from './telegram-bot-runtime-environment.service';
import { TelegramBotRuntimeExecutionContext } from './telegram-bot-runtime-execution-context';
import { financeChatLocale, t } from '../finance/i18n/finance-chat-i18n';

type SendMessagePayload = TelegramBotMessage;

type ClaimedDelivery = Prisma.TelegramBotDeliveryGetPayload<{
  include: {
    runtimeInstance: true;
    botIntegration: { include: { runtimeInstances: true } };
  };
}> & {
  status: typeof TelegramBotDeliveryStatus.PROCESSING;
};

const DELIVERY_BATCH_SIZE = 25;

@Injectable()
export class TelegramBotDeliveryService
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(TelegramBotDeliveryService.name);
  private readonly scheduler: TelegramBotDeliveryScheduler;

  constructor(
    private readonly prisma: PrismaService,
    private readonly encryptionService: TokenEncryptionService,
    private readonly botApi: TelegramBotApiClient,
    private readonly runtimeEnvironment: TelegramBotRuntimeEnvironmentService,
    private readonly executionContext: TelegramBotRuntimeExecutionContext,
  ) {
    this.scheduler = new TelegramBotDeliveryScheduler({
      batchSize: DELIVERY_BATCH_SIZE,
      findNextDueAt: () => this.findNextDueAt(),
      processDue: () => this.processDue(),
      onError: (context, error) =>
        this.logger.warn(
          `Telegram delivery ${context} failed: ${sanitizeOperationalError(error)}`,
        ),
    });
  }

  async onModuleInit() {
    if (!this.runtimeEnvironment.current()) return;
    await this.scheduler.bootstrap();
  }

  onModuleDestroy() {
    this.scheduler.destroy();
  }

  async enqueueSendMessage(input: {
    workspaceId: string;
    botIntegrationId: string;
    telegramBotUserId?: string | null;
    financeReminderId?: string | null;
    runtimeInstanceId?: string | null;
    chatId: string;
    text: string;
    parseMode?: string;
    inlineButtons?: Array<
      Array<{
        text: string;
        url?: string;
        webAppUrl?: string;
        callbackData?: string;
      }>
    >;
    replyKeyboard?: Array<Array<{ text: string; webAppUrl?: string }>>;
    scheduledAt?: Date;
    idempotencyKey: string;
  }) {
    const runtimeInstanceId =
      input.runtimeInstanceId ?? this.executionContext.currentRuntimeId();
    const idempotencyKey = runtimeInstanceId
      ? `${runtimeInstanceId}:${input.idempotencyKey}`
      : input.idempotencyKey;
    const queued = await this.prisma.telegramBotDelivery.upsert({
      where: {
        botIntegrationId_idempotencyKey: {
          botIntegrationId: input.botIntegrationId,
          idempotencyKey,
        },
      },
      create: {
        workspaceId: input.workspaceId,
        botIntegrationId: input.botIntegrationId,
        runtimeInstanceId,
        telegramBotUserId: input.telegramBotUserId || null,
        financeReminderId: input.financeReminderId || null,
        chatId: input.chatId,
        type: TelegramBotDeliveryType.SEND_MESSAGE,
        payload: {
          text: input.text,
          parseMode: input.parseMode,
          inlineButtons: input.inlineButtons,
          replyKeyboard: input.replyKeyboard,
        },
        scheduledAt: input.scheduledAt || new Date(),
        idempotencyKey,
      },
      update: {},
    });
    if (
      queued.status === TelegramBotDeliveryStatus.PENDING ||
      queued.status === TelegramBotDeliveryStatus.RETRY
    ) {
      this.scheduler.notify(queued.scheduledAt);
    }
    return queued;
  }

  async processDue() {
    const deliveries = await this.claimDueDeliveries(DELIVERY_BATCH_SIZE);
    for (const delivery of deliveries) {
      try {
        await this.send(delivery);
      } catch (error) {
        this.logger.warn(
          `Telegram bot delivery ${delivery.id} failed: ${sanitizeOperationalError(error)}`,
        );
      }
    }
    return deliveries.length;
  }

  /** Recomputes the single persisted wake-up point after bootstrap or work. */
  async reschedule(notBefore?: Date) {
    await this.scheduler.reschedule(notBefore);
  }

  private async findNextDueAt() {
    const runtimeScope = this.runtimeScope();
    if (!runtimeScope) return null;
    const [queued, processing] = await Promise.all([
      this.prisma.telegramBotDelivery.findFirst({
        where: {
          AND: [runtimeScope],
          status: {
            in: [
              TelegramBotDeliveryStatus.PENDING,
              TelegramBotDeliveryStatus.RETRY,
            ],
          },
        },
        orderBy: { scheduledAt: 'asc' },
        select: { scheduledAt: true },
      }),
      this.prisma.telegramBotDelivery.findFirst({
        where: {
          AND: [runtimeScope],
          status: TelegramBotDeliveryStatus.PROCESSING,
        },
        orderBy: [{ lockedUntil: 'asc' }, { scheduledAt: 'asc' }],
        select: { scheduledAt: true, lockedUntil: true },
      }),
    ]);
    const processingDueAt = processing
      ? new Date(
          Math.max(
            processing.scheduledAt.getTime(),
            processing.lockedUntil?.getTime() ?? 0,
          ),
        )
      : null;
    const candidates = [queued?.scheduledAt, processingDueAt].filter(
      (value): value is Date => Boolean(value),
    );
    return candidates.length
      ? new Date(Math.min(...candidates.map((value) => value.getTime())))
      : null;
  }

  async claimDueDeliveries(limit: number) {
    const runtimeScope = this.runtimeScope();
    if (!runtimeScope) return [];
    const now = new Date();
    const deliveries = await this.prisma.telegramBotDelivery.findMany({
      where: {
        AND: [runtimeScope],
        status: {
          in: [
            TelegramBotDeliveryStatus.PENDING,
            TelegramBotDeliveryStatus.RETRY,
            TelegramBotDeliveryStatus.PROCESSING,
          ],
        },
        scheduledAt: { lte: now },
        OR: [{ lockedUntil: null }, { lockedUntil: { lt: now } }],
      },
      orderBy: { scheduledAt: 'asc' },
      take: limit,
      include: {
        runtimeInstance: true,
        botIntegration: {
          include: {
            runtimeInstances: {
              where: {
                environment: TelegramBotRuntimeEnvironment.PRODUCTION,
              },
              take: 1,
            },
          },
        },
      },
    });
    const claimed: ClaimedDelivery[] = [];
    for (const delivery of deliveries) {
      const result = await this.prisma.telegramBotDelivery.updateMany({
        where: {
          id: delivery.id,
          status: {
            in: [
              TelegramBotDeliveryStatus.PENDING,
              TelegramBotDeliveryStatus.RETRY,
              TelegramBotDeliveryStatus.PROCESSING,
            ],
          },
          OR: [{ lockedUntil: null }, { lockedUntil: { lt: now } }],
        },
        data: {
          status: TelegramBotDeliveryStatus.PROCESSING,
          lockedAt: now,
          lockedUntil: new Date(now.getTime() + 5 * 60 * 1000),
        },
      });
      if (result.count === 1) {
        claimed.push({
          ...delivery,
          status: TelegramBotDeliveryStatus.PROCESSING,
        });
      }
    }
    return claimed;
  }

  private async send(delivery: ClaimedDelivery) {
    const runtime =
      delivery.runtimeInstance ?? delivery.botIntegration.runtimeInstances[0];
    if (!runtime || runtime.runtimeStatus !== TelegramBotRuntimeStatus.ACTIVE) {
      await this.markFailedDelivery(
        delivery,
        new Error('Active Telegram bot runtime is not configured'),
      );
      return;
    }
    const token = this.encryptionService.decrypt({
      encrypted: runtime.botTokenEncrypted,
      iv: runtime.botTokenIv,
      authTag: runtime.botTokenAuthTag,
    });
    try {
      if (delivery.type === TelegramBotDeliveryType.SEND_MESSAGE) {
        const payload = delivery.payload as SendMessagePayload;
        await this.botApi.sendMessage(
          token,
          telegramBotMessagePayload(delivery.chatId, payload),
        );
      }
      const sentAt = new Date();
      const finalized = await this.prisma.$transaction(async (tx) => {
        const claimed = await tx.telegramBotDelivery.updateMany({
          where: {
            id: delivery.id,
            status: TelegramBotDeliveryStatus.PROCESSING,
          },
          data: {
            status: TelegramBotDeliveryStatus.SENT,
            sentAt,
            lockedAt: null,
            lockedUntil: null,
            lastError: null,
            attempts: { increment: 1 },
          },
        });
        if (claimed.count !== 1) return false;
        await tx.greeterSequenceStepExecution.updateMany({
          where: {
            deliveryId: delivery.id,
            status: { in: ['PENDING', 'QUEUED'] },
          },
          data: {
            status: 'SENT',
            sentAt,
            completedAt: sentAt,
            lastError: null,
          },
        });
        await tx.greeterBroadcastRecipient.updateMany({
          where: {
            deliveryId: delivery.id,
            status: { in: ['PENDING', 'QUEUED'] },
          },
          data: {
            status: 'SENT',
            sentAt,
            completedAt: sentAt,
            lastError: null,
          },
        });
        return true;
      });
      if (!finalized) return;
      await this.reconcileBroadcast(delivery.id);
      if (delivery.financeReminderId)
        await this.scheduleNextFinanceReminder(delivery);
    } catch (error) {
      await this.markFailedDelivery(delivery, error);
    }
  }

  private runtimeScope(): Prisma.TelegramBotDeliveryWhereInput | null {
    const environment = this.runtimeEnvironment.current();
    if (!environment) return null;
    return environment === TelegramBotRuntimeEnvironment.LOCAL
      ? {
          runtimeInstance: {
            is: { environment: TelegramBotRuntimeEnvironment.LOCAL },
          },
        }
      : {
          OR: [
            { runtimeInstanceId: null },
            {
              runtimeInstance: {
                is: { environment: TelegramBotRuntimeEnvironment.PRODUCTION },
              },
            },
          ],
        };
  }

  private async markFailedDelivery(delivery: ClaimedDelivery, error: unknown) {
    const attempts = delivery.attempts + 1;
    const message = sanitizeOperationalError(error);
    const retry =
      error instanceof TelegramBotApiError &&
      error.kind === 'TRANSIENT' &&
      attempts < delivery.maxAttempts;
    const blocked =
      error instanceof TelegramBotApiError && error.kind === 'BLOCKED';
    const nextStatus = retry
      ? TelegramBotDeliveryStatus.RETRY
      : TelegramBotDeliveryStatus.FAILED;
    const retryAfterSeconds = this.retryAfterSeconds(error);
    const nextScheduledAt = retry
      ? new Date(
          Date.now() +
            (retryAfterSeconds ?? Math.min(30, attempts * 5) * 60) * 1000,
        )
      : delivery.scheduledAt;
    const completedAt = retry ? null : new Date();
    const recipientStatus = blocked ? 'BLOCKED' : retry ? 'QUEUED' : 'FAILED';
    const finalized = await this.prisma.$transaction(async (tx) => {
      const claimed = await tx.telegramBotDelivery.updateMany({
        where: {
          id: delivery.id,
          status: TelegramBotDeliveryStatus.PROCESSING,
        },
        data: {
          status: nextStatus,
          attempts,
          scheduledAt: nextScheduledAt,
          lockedAt: null,
          lockedUntil: null,
          lastError: message,
        },
      });
      if (claimed.count !== 1) return false;
      await tx.greeterSequenceStepExecution.updateMany({
        where: { deliveryId: delivery.id },
        data: retry
          ? { status: 'QUEUED', lastError: message }
          : { status: 'FAILED', completedAt, lastError: message },
      });
      await tx.greeterBroadcastRecipient.updateMany({
        where: { deliveryId: delivery.id },
        data: { status: recipientStatus, completedAt, lastError: message },
      });
      if (blocked && delivery.telegramBotUserId) {
        await tx.telegramBotUser.update({
          where: { id: delivery.telegramBotUserId },
          data: { blockedAt: new Date() },
        });
      }
      return true;
    });
    if (!finalized) return;
    if (!retry) await this.reconcileBroadcast(delivery.id);
  }

  private retryAfterSeconds(error: unknown) {
    const message = error instanceof Error ? error.message : '';
    const match = message.match(/retry after\s+(\d+)/i);
    if (!match) return null;
    return Math.max(1, Math.min(3600, Number(match[1])));
  }

  private async reconcileBroadcast(deliveryId: string) {
    const recipient = await this.prisma.greeterBroadcastRecipient.findUnique({
      where: { deliveryId },
      select: { broadcastId: true },
    });
    if (!recipient) return;
    const recipients = await this.prisma.greeterBroadcastRecipient.findMany({
      where: { broadcastId: recipient.broadcastId },
      select: { status: true },
    });
    const terminal = new Set(['SENT', 'FAILED', 'BLOCKED', 'CANCELLED']);
    if (
      !recipients.length ||
      recipients.some((item) => !terminal.has(item.status))
    )
      return;
    const sent = recipients.filter((item) => item.status === 'SENT').length;
    const status =
      sent === recipients.length
        ? 'COMPLETED'
        : sent === 0
          ? 'FAILED'
          : 'PARTIALLY_FAILED';
    await this.prisma.greeterBroadcast.updateMany({
      where: { id: recipient.broadcastId, status: { not: 'CANCELLED' } },
      data: { status, completedAt: new Date() },
    });
  }

  private async scheduleNextFinanceReminder(delivery: ClaimedDelivery) {
    const reminder = await this.prisma.financeReminder.findFirst({
      where: { id: delivery.financeReminderId!, enabled: true },
      include: {
        profile: { include: { telegramUser: true, botIntegration: true } },
      },
    });
    if (!reminder || !reminder.profile.telegramUser.telegramChatId) return;
    const current = reminder.nextOccurrenceAt;
    let year = current.getUTCFullYear();
    let month = current.getUTCMonth() + 1;
    if (month === 12) {
      month = 0;
      year += 1;
    }
    const day = Math.min(
      reminder.dayOfMonth,
      new Date(Date.UTC(year, month + 1, 0)).getUTCDate(),
    );
    const next = new Date(
      Date.UTC(
        year,
        month,
        day,
        current.getUTCHours(),
        current.getUTCMinutes(),
      ),
    );
    await this.prisma.financeReminder.updateMany({
      where: { id: reminder.id, nextOccurrenceAt: current, enabled: true },
      data: { nextOccurrenceAt: next },
    });
    await this.enqueueSendMessage({
      workspaceId: reminder.profile.botIntegration.workspaceId,
      botIntegrationId: reminder.profile.botIntegrationId,
      telegramBotUserId: reminder.profile.telegramBotUserId,
      financeReminderId: reminder.id,
      chatId: reminder.profile.telegramUser.telegramChatId,
      text: t(financeChatLocale(reminder.profile.locale, reminder.profile.telegramUser.languageCode), 'reminderNotification', {
        name: reminder.name, amount: reminder.amount.toString(), currency: reminder.currency,
      }),
      scheduledAt: new Date(
        next.getTime() - reminder.reminderOffsetMinutes * 60000,
      ),
      idempotencyKey: `finance-reminder:${reminder.id}:${next.toISOString()}`,
    });
  }
}
