import {
  Prisma,
  TelegramBotDeliveryStatus,
  TelegramBotDeliveryType,
  type TelegramBotDelivery,
} from '@prisma/client';
import type { PrismaService } from '../../../../prisma/prisma.service';

export const TELEGRAM_BOT_DELIVERY_ENQUEUE_BATCH_SIZE = 250;

export type TelegramBotSendMessageInput = {
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
};

type PreparedDelivery = {
  lookupKey: string;
  data: Prisma.TelegramBotDeliveryCreateManyInput;
};

function deliveryLookupKey(botIntegrationId: string, idempotencyKey: string) {
  return JSON.stringify([botIntegrationId, idempotencyKey]);
}

/** Creates or resolves one bounded idempotent SEND_MESSAGE delivery page. */
export async function enqueueTelegramBotSendMessageBatch(
  prisma: PrismaService,
  inputs: TelegramBotSendMessageInput[],
  defaultRuntimeInstanceId: string | null,
): Promise<TelegramBotDelivery[]> {
  if (!inputs.length) return [];
  if (inputs.length > TELEGRAM_BOT_DELIVERY_ENQUEUE_BATCH_SIZE) {
    throw new RangeError(
      `Telegram delivery enqueue batch cannot exceed ${TELEGRAM_BOT_DELIVERY_ENQUEUE_BATCH_SIZE}`,
    );
  }

  const now = new Date();
  const prepared = inputs.map<PreparedDelivery>((input) => {
    const runtimeInstanceId =
      input.runtimeInstanceId ?? defaultRuntimeInstanceId;
    const idempotencyKey = runtimeInstanceId
      ? `${runtimeInstanceId}:${input.idempotencyKey}`
      : input.idempotencyKey;
    return {
      lookupKey: deliveryLookupKey(input.botIntegrationId, idempotencyKey),
      data: {
        workspaceId: input.workspaceId,
        botIntegrationId: input.botIntegrationId,
        runtimeInstanceId,
        telegramBotUserId: input.telegramBotUserId || null,
        financeReminderId: input.financeReminderId || null,
        chatId: input.chatId,
        type: TelegramBotDeliveryType.SEND_MESSAGE,
        payload: {
          text: input.text,
          ...(input.parseMode === undefined
            ? {}
            : { parseMode: input.parseMode }),
          ...(input.inlineButtons === undefined
            ? {}
            : { inlineButtons: input.inlineButtons }),
          ...(input.replyKeyboard === undefined
            ? {}
            : { replyKeyboard: input.replyKeyboard }),
        },
        scheduledAt: input.scheduledAt ?? now,
        idempotencyKey,
      },
    };
  });

  await prisma.telegramBotDelivery.createMany({
    data: prepared.map((item) => item.data),
    skipDuplicates: true,
  });
  const uniqueLookups = Array.from(
    new Map(prepared.map((item) => [item.lookupKey, item.data])).values(),
  );
  const deliveries = await prisma.telegramBotDelivery.findMany({
    where: {
      OR: uniqueLookups.map((item) => ({
        botIntegrationId: item.botIntegrationId,
        idempotencyKey: item.idempotencyKey,
      })),
    },
  });
  const byLookup = new Map(
    deliveries.map((delivery) => [
      deliveryLookupKey(delivery.botIntegrationId, delivery.idempotencyKey),
      delivery,
    ]),
  );
  return prepared.map((item) => {
    const delivery = byLookup.get(item.lookupKey);
    if (!delivery) {
      throw new Error('Idempotent Telegram delivery could not be resolved');
    }
    return delivery;
  });
}

export function earliestQueuedDeliveryAt(deliveries: TelegramBotDelivery[]) {
  const queued = deliveries.filter(
    (delivery) =>
      delivery.status === TelegramBotDeliveryStatus.PENDING ||
      delivery.status === TelegramBotDeliveryStatus.RETRY,
  );
  return queued.length
    ? new Date(
        Math.min(...queued.map((delivery) => delivery.scheduledAt.getTime())),
      )
    : null;
}
