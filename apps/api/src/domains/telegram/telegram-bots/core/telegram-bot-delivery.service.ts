import {
  Inject,
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
import {
  telegramBotMessagePayload,
  type TelegramBotMessage,
} from '../../../../telegram/shared/telegram-bot-message';
import { sanitizeOperationalError } from '../../../../common/security/operational-error';
import { TelegramBotDeliveryScheduler } from './telegram-bot-delivery-scheduler';
import { TelegramBotRuntimeEnvironmentService } from './telegram-bot-runtime-environment.service';
import { TelegramBotRuntimeExecutionContext } from './telegram-bot-runtime-execution-context';
import {
  FINANCE_REMINDER_DELIVERY_PORT,
  type FinanceReminderDeliveryPort,
} from './telegram-bot-delivery.ports';
import { reconcileTerminalDeliveryBroadcasts } from './telegram-bot-delivery-broadcast-reconciliation';
import {
  claimDueDeliveryIds,
  deliveryMatchesRuntimeScope,
  failClosedUnhydratableDeliveries,
} from './telegram-bot-delivery-claim';
import {
  earliestQueuedDeliveryAt,
  enqueueTelegramBotSendMessageBatch,
  type TelegramBotSendMessageInput,
} from './telegram-bot-delivery-batch-enqueue';

type SendMessagePayload = TelegramBotMessage;

type HydratedDelivery = Prisma.TelegramBotDeliveryGetPayload<{
  include: {
    runtimeInstance: true;
    botIntegration: { include: { runtimeInstances: true } };
  };
}>;

type ClaimedDelivery = HydratedDelivery & {
  status: typeof TelegramBotDeliveryStatus.PROCESSING;
};

const DELIVERY_BATCH_SIZE = 25;
const UNHYDRATABLE_DELIVERY_ERROR =
  'Claimed Telegram bot delivery no longer matches its runtime environment';

type ClaimedDeliveryBatch = {
  environment: TelegramBotRuntimeEnvironment;
  deliveries: ClaimedDelivery[];
  terminalDeliveryIds: string[];
};

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
    @Inject(FINANCE_REMINDER_DELIVERY_PORT)
    private readonly financeReminders: FinanceReminderDeliveryPort,
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

  async enqueueSendMessage(input: TelegramBotSendMessageInput) {
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

  async enqueueSendMessageBatch(inputs: TelegramBotSendMessageInput[]) {
    const queued = await enqueueTelegramBotSendMessageBatch(
      this.prisma,
      inputs,
      this.executionContext.currentRuntimeId(),
    );
    const earliestDueAt = earliestQueuedDeliveryAt(queued);
    if (earliestDueAt) this.scheduler.notify(earliestDueAt);
    return queued;
  }

  async processDue() {
    const batch = await this.claimDueDeliveryBatch(DELIVERY_BATCH_SIZE);
    if (!batch) return 0;
    const terminalDeliveryIds = [...batch.terminalDeliveryIds];
    for (const delivery of batch.deliveries) {
      try {
        if (await this.send(delivery, batch.environment)) {
          terminalDeliveryIds.push(delivery.id);
        }
      } catch (error) {
        this.logger.warn(
          `Telegram bot delivery ${delivery.id} failed: ${sanitizeOperationalError(error)}`,
        );
      }
    }
    await reconcileTerminalDeliveryBroadcasts(this.prisma, terminalDeliveryIds);
    return batch.deliveries.length;
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
    return (await this.claimDueDeliveryBatch(limit))?.deliveries ?? [];
  }

  private async claimDueDeliveryBatch(
    limit: number,
  ): Promise<ClaimedDeliveryBatch | null> {
    const environment = this.runtimeEnvironment.current();
    if (!environment) return null;
    const now = new Date();
    const lockedUntil = new Date(now.getTime() + 5 * 60 * 1000);
    const claimedIds = await claimDueDeliveryIds(this.prisma, {
      environment,
      now,
      lockedUntil,
      limit,
    });
    if (!claimedIds.length) {
      return {
        environment,
        deliveries: [],
        terminalDeliveryIds: [],
      };
    }
    const runtimeScope = this.runtimeScope(environment);
    if (!runtimeScope) return null;
    const deliveries = await this.prisma.telegramBotDelivery.findMany({
      where: {
        AND: [
          {
            id: { in: claimedIds },
            status: TelegramBotDeliveryStatus.PROCESSING,
            lockedAt: now,
            lockedUntil,
          },
          runtimeScope,
        ],
      },
      include: {
        runtimeInstance: true,
        botIntegration: {
          include: {
            runtimeInstances: {
              where: {
                environment,
              },
              take: 1,
            },
          },
        },
      },
    });
    const byId = new Map(
      deliveries
        .filter((delivery) =>
          deliveryMatchesRuntimeScope(delivery, environment),
        )
        .map((delivery) => [delivery.id, delivery]),
    );
    const unhydratableIds = claimedIds.filter((id) => !byId.has(id));
    const terminalDeliveryIds = await failClosedUnhydratableDeliveries(
      this.prisma,
      {
        ids: unhydratableIds,
        environment,
        claimedAt: now,
        lockedUntil,
        failedAt: new Date(),
        error: UNHYDRATABLE_DELIVERY_ERROR,
      },
    );
    const claimedDeliveries = claimedIds.flatMap((id): ClaimedDelivery[] => {
      const delivery = byId.get(id);
      return delivery
        ? [{ ...delivery, status: TelegramBotDeliveryStatus.PROCESSING }]
        : [];
    });
    return {
      environment,
      deliveries: claimedDeliveries,
      terminalDeliveryIds,
    };
  }

  private async send(
    delivery: ClaimedDelivery,
    environment: TelegramBotRuntimeEnvironment,
  ) {
    const runtime =
      delivery.runtimeInstanceId === null &&
      environment === TelegramBotRuntimeEnvironment.PRODUCTION
        ? delivery.botIntegration.runtimeInstances[0]
        : delivery.runtimeInstance;
    if (
      !runtime ||
      runtime.environment !== environment ||
      runtime.workspaceId !== delivery.workspaceId ||
      runtime.botIntegrationId !== delivery.botIntegrationId ||
      runtime.runtimeStatus !== TelegramBotRuntimeStatus.ACTIVE
    ) {
      return this.markFailedDelivery(
        delivery,
        new Error(
          `Active ${environment} Telegram bot runtime is not configured for this delivery`,
        ),
      );
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
      if (!finalized) return false;
    } catch (error) {
      return this.markFailedDelivery(delivery, error);
    }
    if (delivery.financeReminderId) {
      try {
        await this.scheduleNextFinanceReminder(delivery.financeReminderId);
      } catch (error) {
        this.logger.warn(
          `Finance reminder ${delivery.financeReminderId} could not schedule its next occurrence: ${sanitizeOperationalError(error)}`,
        );
      }
    }
    return true;
  }

  private runtimeScope(
    environment = this.runtimeEnvironment.current(),
  ): Prisma.TelegramBotDeliveryWhereInput | null {
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
    return finalized && !retry;
  }

  private retryAfterSeconds(error: unknown) {
    const message = error instanceof Error ? error.message : '';
    const match = message.match(/retry after\s+(\d+)/i);
    if (!match) return null;
    return Math.max(1, Math.min(3600, Number(match[1])));
  }

  private async scheduleNextFinanceReminder(reminderId: string) {
    const delivery = await this.financeReminders.scheduleNext(reminderId);
    if (delivery) await this.enqueueSendMessage(delivery);
  }
}
