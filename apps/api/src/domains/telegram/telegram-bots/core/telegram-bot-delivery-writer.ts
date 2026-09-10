import { Injectable } from '@nestjs/common';
import {
  Prisma,
  TelegramBotDeliveryStatus,
  TelegramBotDeliveryType,
} from '@prisma/client';
import type { TelegramBotMessage } from '../../../../telegram/shared/telegram-bot-message';
import { TelegramBotDeliveryService } from './telegram-bot-delivery.service';

export const TELEGRAM_BOT_DELIVERY_WRITER = Symbol(
  'TELEGRAM_BOT_DELIVERY_WRITER',
);

export type TransactionalTelegramDeliveryInput = {
  workspaceId: string;
  botIntegrationId: string;
  runtimeInstanceId?: string | null;
  telegramBotUserId?: string | null;
  financeReminderId?: string | null;
  financeDebtId?: string | null;
  financeRecurringPaymentId?: string | null;
  chatId: string;
  message: TelegramBotMessage;
  scheduledAt: Date;
  idempotencyKey: string;
};

export interface TelegramBotDeliveryWriterPort {
  enqueueInTransaction(
    tx: Prisma.TransactionClient,
    input: TransactionalTelegramDeliveryInput,
  ): Promise<{ scheduledAt: Date }>;
  enqueueManyInTransaction(
    tx: Prisma.TransactionClient,
    inputs: TransactionalTelegramDeliveryInput[],
  ): Promise<Array<{ scheduledAt: Date }>>;
  cancelPendingInTransaction(
    tx: Prisma.TransactionClient,
    reference:
      | { financeDebtId: string }
      | { financeRecurringPaymentId: string },
  ): Promise<number>;
  notify(scheduledAt: Date): void;
  reschedule(): Promise<void>;
}

@Injectable()
export class TelegramBotDeliveryWriterService implements TelegramBotDeliveryWriterPort {
  constructor(private readonly delivery: TelegramBotDeliveryService) {}

  async enqueueInTransaction(
    tx: Prisma.TransactionClient,
    input: TransactionalTelegramDeliveryInput,
  ) {
    const row = await tx.telegramBotDelivery.upsert({
      where: {
        botIntegrationId_idempotencyKey: {
          botIntegrationId: input.botIntegrationId,
          idempotencyKey: input.idempotencyKey,
        },
      },
      create: {
        workspaceId: input.workspaceId,
        botIntegrationId: input.botIntegrationId,
        runtimeInstanceId: input.runtimeInstanceId ?? null,
        telegramBotUserId: input.telegramBotUserId ?? null,
        financeReminderId: input.financeReminderId ?? null,
        financeDebtId: input.financeDebtId ?? null,
        financeRecurringPaymentId: input.financeRecurringPaymentId ?? null,
        chatId: input.chatId,
        type: TelegramBotDeliveryType.SEND_MESSAGE,
        payload: input.message,
        scheduledAt: input.scheduledAt,
        idempotencyKey: input.idempotencyKey,
      },
      update: {},
      select: { scheduledAt: true },
    });
    return row;
  }

  async enqueueManyInTransaction(
    tx: Prisma.TransactionClient,
    inputs: TransactionalTelegramDeliveryInput[],
  ) {
    if (!inputs.length) return [];
    await tx.telegramBotDelivery.createMany({
      data: inputs.map((input) => ({
        workspaceId: input.workspaceId,
        botIntegrationId: input.botIntegrationId,
        runtimeInstanceId: input.runtimeInstanceId ?? null,
        telegramBotUserId: input.telegramBotUserId ?? null,
        financeReminderId: input.financeReminderId ?? null,
        financeDebtId: input.financeDebtId ?? null,
        financeRecurringPaymentId: input.financeRecurringPaymentId ?? null,
        chatId: input.chatId,
        type: TelegramBotDeliveryType.SEND_MESSAGE,
        payload: input.message,
        scheduledAt: input.scheduledAt,
        idempotencyKey: input.idempotencyKey,
      })),
      skipDuplicates: true,
    });
    return inputs.map(({ scheduledAt }) => ({ scheduledAt }));
  }

  async cancelPendingInTransaction(
    tx: Prisma.TransactionClient,
    reference:
      | { financeDebtId: string }
      | { financeRecurringPaymentId: string },
  ) {
    const result = await tx.telegramBotDelivery.updateMany({
      where: {
        ...reference,
        status: {
          in: [
            TelegramBotDeliveryStatus.PENDING,
            TelegramBotDeliveryStatus.RETRY,
          ],
        },
      },
      data: {
        status: TelegramBotDeliveryStatus.CANCELLED,
        lastError: null,
        lockedAt: null,
        lockedUntil: null,
      },
    });
    return result.count;
  }

  notify(scheduledAt: Date) {
    this.delivery.notify(scheduledAt);
  }

  async reschedule() {
    await this.delivery.reschedule();
  }
}
