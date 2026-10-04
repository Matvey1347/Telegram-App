import {
  GreeterBroadcastRecipientStatus,
  Prisma,
  TelegramBotDeliveryStatus,
} from '@prisma/client';
import type { GreeterButtonRows } from '@telegram-system/shared';
import { sanitizeOperationalError } from '../../../../common/security/operational-error';
import type { PrismaService } from '../../../../prisma/prisma.service';
import { telegramMarkupToHtml } from '../../../../telegram/shared/telegram-markup';
import { GREETER_BROADCAST_RETRY_MS } from '../../../operations/scheduled-tasks/due-work-predicates';
import {
  TELEGRAM_BOT_DELIVERY_ENQUEUE_BATCH_SIZE,
  type TelegramBotSendMessageInput,
} from '../core/telegram-bot-delivery-batch-enqueue';
import { renderGreeterTemplate } from './greeter-template.renderer';

const MAX_BROADCAST_LINK_BATCH_SIZE = 250;

export type GreeterBroadcastDeliveryLink = {
  recipientId: string;
  deliveryId: string;
};

async function cancelUnlinkedDeliveries(
  prisma: PrismaService,
  deliveryIds: string[],
) {
  if (!deliveryIds.length) return;
  await prisma.telegramBotDelivery.updateMany({
    where: {
      id: { in: deliveryIds },
      status: {
        in: [
          TelegramBotDeliveryStatus.PENDING,
          TelegramBotDeliveryStatus.RETRY,
        ],
      },
      greeterBroadcastRecipient: { is: null },
    },
    data: {
      status: TelegramBotDeliveryStatus.CANCELLED,
      lockedAt: null,
      lockedUntil: null,
    },
  });
}

/**
 * Links one recipient page in one conditional statement. Locking deliveries
 * closes the crash-recovery race where a send becomes terminal before linking.
 */
export async function linkGreeterBroadcastDeliveryBatch(
  prisma: PrismaService,
  input: {
    broadcastId: string;
    links: GreeterBroadcastDeliveryLink[];
    now: Date;
  },
) {
  if (!input.links.length) {
    return { linkedDeliveryIds: [], unlinkedDeliveryIds: [] };
  }
  const links = Array.from(
    new Map(input.links.map((link) => [link.recipientId, link])).values(),
  );
  if (links.length > MAX_BROADCAST_LINK_BATCH_SIZE) {
    throw new RangeError(
      `Greeter broadcast link batch cannot exceed ${MAX_BROADCAST_LINK_BATCH_SIZE}`,
    );
  }

  let linkedRows: Array<{ deliveryId: string }>;
  try {
    linkedRows = await prisma.$queryRaw<Array<{ deliveryId: string }>>(
      Prisma.sql`
        WITH "requested_link"("recipientId", "deliveryId") AS (
          VALUES ${Prisma.join(
            links.map(
              (link) => Prisma.sql`(${link.recipientId}, ${link.deliveryId})`,
            ),
          )}
        ),
        "locked_delivery" AS (
          SELECT "delivery"."id",
                 "delivery"."status",
                 "delivery"."sentAt",
                 "delivery"."lastError"
          FROM "TelegramBotDelivery" AS "delivery"
          INNER JOIN "requested_link" AS "requested"
            ON "requested"."deliveryId" = "delivery"."id"
          FOR UPDATE OF "delivery"
        )
        UPDATE "GreeterBroadcastRecipient" AS "recipient"
        SET "deliveryId" = "requested"."deliveryId",
            "status" = CASE "delivery"."status"
              WHEN 'SENT'::"TelegramBotDeliveryStatus"
                THEN 'SENT'::"GreeterBroadcastRecipientStatus"
              WHEN 'FAILED'::"TelegramBotDeliveryStatus"
                THEN 'FAILED'::"GreeterBroadcastRecipientStatus"
              WHEN 'CANCELLED'::"TelegramBotDeliveryStatus"
                THEN 'CANCELLED'::"GreeterBroadcastRecipientStatus"
              ELSE 'QUEUED'::"GreeterBroadcastRecipientStatus"
            END,
            "sentAt" = CASE
              WHEN "delivery"."status" = 'SENT'::"TelegramBotDeliveryStatus"
                THEN "delivery"."sentAt"
              ELSE NULL
            END,
            "completedAt" = CASE
              WHEN "delivery"."status" IN (
                'SENT'::"TelegramBotDeliveryStatus",
                'FAILED'::"TelegramBotDeliveryStatus",
                'CANCELLED'::"TelegramBotDeliveryStatus"
              ) THEN COALESCE("delivery"."sentAt", ${input.now})
              ELSE NULL
            END,
            "lastError" = CASE
              WHEN "delivery"."status" = 'FAILED'::"TelegramBotDeliveryStatus"
                THEN "delivery"."lastError"
              ELSE NULL
            END,
            "nextQueueAttemptAt" = NULL,
            "updatedAt" = ${input.now}
        FROM "requested_link" AS "requested"
        INNER JOIN "locked_delivery" AS "delivery"
          ON "delivery"."id" = "requested"."deliveryId"
        WHERE "recipient"."id" = "requested"."recipientId"
          AND "recipient"."broadcastId" = ${input.broadcastId}
          AND "recipient"."status" = 'PENDING'::"GreeterBroadcastRecipientStatus"
          AND EXISTS (
            SELECT 1
            FROM "GreeterBroadcast" AS "broadcast"
            WHERE "broadcast"."id" = "recipient"."broadcastId"
              AND "broadcast"."status" = 'PROCESSING'::"GreeterBroadcastStatus"
          )
        RETURNING "recipient"."deliveryId"
      `,
    );
  } catch (error) {
    await cancelUnlinkedDeliveries(
      prisma,
      links.map((link) => link.deliveryId),
    );
    throw error;
  }

  const linkedDeliveryIds = linkedRows.map((row) => row.deliveryId);
  const linked = new Set(linkedDeliveryIds);
  const unlinkedDeliveryIds = links
    .map((link) => link.deliveryId)
    .filter((deliveryId) => !linked.has(deliveryId));
  await cancelUnlinkedDeliveries(prisma, unlinkedDeliveryIds);
  return { linkedDeliveryIds, unlinkedDeliveryIds };
}

type BatchDeliveryPort = {
  enqueueSendMessageBatch: (
    inputs: TelegramBotSendMessageInput[],
  ) => Promise<Array<{ id: string }>>;
};

type BroadcastQueueRow = {
  id: string;
  workspaceId: string;
  botIntegrationId: string;
  messageText: string;
  buttons: unknown;
  scheduledAt: Date;
  channel: { title: string; username: string | null } | null;
};

type BroadcastQueueRecipient = {
  id: string;
  telegramBotUserId: string;
  telegramUser: {
    telegramChatId: string | null;
    blockedAt: Date | null;
    firstName: string | null;
    lastName: string | null;
    username: string | null;
  };
  acquiredChannel: { title: string; username: string | null } | null;
};

/** Renders, enqueues, and conditionally links one bounded recipient page. */
export async function queueGreeterBroadcastRecipientPage(
  prisma: PrismaService,
  deliveries: BatchDeliveryPort,
  input: {
    row: BroadcastQueueRow;
    recipients: BroadcastQueueRecipient[];
    now: Date;
    onBatchError?: (reason: string) => void;
  },
) {
  if (input.recipients.length > TELEGRAM_BOT_DELIVERY_ENQUEUE_BATCH_SIZE) {
    throw new RangeError(
      `Greeter broadcast recipient page cannot exceed ${TELEGRAM_BOT_DELIVERY_ENQUEUE_BATCH_SIZE}`,
    );
  }
  const blockedRecipientIds: string[] = [];
  const missingChatRecipientIds: string[] = [];
  const queueable: Array<{
    recipientId: string;
    input: TelegramBotSendMessageInput;
  }> = [];
  const renderFailures = new Map<string, string[]>();

  for (const recipient of input.recipients) {
    const chatId = recipient.telegramUser.telegramChatId;
    if (recipient.telegramUser.blockedAt) {
      blockedRecipientIds.push(recipient.id);
      continue;
    }
    if (!chatId) {
      missingChatRecipientIds.push(recipient.id);
      continue;
    }
    try {
      const text = telegramMarkupToHtml(
        renderGreeterTemplate(input.row.messageText, {
          channel: recipient.acquiredChannel ||
            input.row.channel || { title: 'Channel', username: null },
          user: recipient.telegramUser,
        }),
      );
      queueable.push({
        recipientId: recipient.id,
        input: {
          workspaceId: input.row.workspaceId,
          botIntegrationId: input.row.botIntegrationId,
          telegramBotUserId: recipient.telegramBotUserId,
          chatId,
          text,
          parseMode: 'HTML',
          inlineButtons:
            (input.row.buttons as GreeterButtonRows | null) || undefined,
          scheduledAt: input.row.scheduledAt,
          idempotencyKey: `greeter-broadcast:${input.row.id}:${recipient.telegramBotUserId}`,
        },
      });
    } catch (error) {
      const reason = sanitizeOperationalError(
        error,
        'Broadcast recipient could not be queued',
      );
      const recipientIds = renderFailures.get(reason) ?? [];
      recipientIds.push(recipient.id);
      renderFailures.set(reason, recipientIds);
    }
  }

  const updates: Array<Promise<unknown>> = [];
  if (blockedRecipientIds.length) {
    updates.push(
      prisma.greeterBroadcastRecipient.updateMany({
        where: {
          id: { in: blockedRecipientIds },
          status: GreeterBroadcastRecipientStatus.PENDING,
        },
        data: {
          status: GreeterBroadcastRecipientStatus.BLOCKED,
          completedAt: input.now,
          lastError: 'Telegram user is blocked or unreachable',
          nextQueueAttemptAt: null,
        },
      }),
    );
  }
  if (missingChatRecipientIds.length) {
    updates.push(
      prisma.greeterBroadcastRecipient.updateMany({
        where: {
          id: { in: missingChatRecipientIds },
          status: GreeterBroadcastRecipientStatus.PENDING,
        },
        data: {
          status: GreeterBroadcastRecipientStatus.FAILED,
          completedAt: input.now,
          lastError: 'Telegram user has no reachable private chat',
          nextQueueAttemptAt: null,
        },
      }),
    );
  }
  const nextQueueAttemptAt = new Date(
    input.now.getTime() + GREETER_BROADCAST_RETRY_MS,
  );
  for (const [reason, recipientIds] of renderFailures) {
    updates.push(
      prisma.greeterBroadcastRecipient.updateMany({
        where: {
          id: { in: recipientIds },
          status: GreeterBroadcastRecipientStatus.PENDING,
        },
        data: { lastError: reason, nextQueueAttemptAt },
      }),
    );
  }
  await Promise.all(updates);

  if (!queueable.length) return;
  try {
    const queued = await deliveries.enqueueSendMessageBatch(
      queueable.map((item) => item.input),
    );
    await linkGreeterBroadcastDeliveryBatch(prisma, {
      broadcastId: input.row.id,
      links: queueable.map((item, index) => ({
        recipientId: item.recipientId,
        deliveryId: queued[index].id,
      })),
      now: input.now,
    });
  } catch (error) {
    const reason = sanitizeOperationalError(
      error,
      'Broadcast recipient batch could not be queued',
    );
    input.onBatchError?.(reason);
    await prisma.greeterBroadcastRecipient.updateMany({
      where: {
        id: { in: queueable.map((item) => item.recipientId) },
        status: GreeterBroadcastRecipientStatus.PENDING,
      },
      data: { lastError: reason, nextQueueAttemptAt },
    });
  }
}
