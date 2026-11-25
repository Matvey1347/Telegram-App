import type { Prisma } from '@prisma/client';
import type { PrismaService } from '../../../../prisma/prisma.service';
import type { TelegramBotWebhookUpdate } from './telegram-bot-update.types';

const startPattern = /^\/start(?:@[a-z\d_]+)?(?:\s|$)/i;
const adStartPattern =
  /^\/start(?:@[a-z\d_]+)?\s+ad_([a-f\d]{8}-[a-f\d]{4}-4[a-f\d]{3}-[89ab][a-f\d]{3}-[a-f\d]{12})$/i;

export async function trackBotAdInteraction(
  prisma: PrismaService,
  runtimeId: string,
  userId: string,
  update: TelegramBotWebhookUpdate,
  pending: Prisma.JsonValue | undefined,
  now: Date,
) {
  const message = update.message ?? update.callback_query?.message;
  if (message?.chat?.type !== 'private') return;
  const text = update.message?.text?.trim() ?? '';
  if (startPattern.test(text)) {
    const linkId = adStartPattern.exec(text)?.[1];
    if (!linkId) return;
    const timestamp = (update.message?.date ?? 0) * 1_000;
    const startedAt =
      timestamp > 0 && timestamp <= now.getTime() ? new Date(timestamp) : now;
    const createdCutoff = new Date(startedAt.getTime() + 1_000);
    await prisma.$executeRaw`
      WITH attributed AS (
        INSERT INTO "BotAdAttribution" ("runtimeInstanceId", "telegramBotUserId", "linkId", "startedAt")
        SELECT "runtimeInstanceId", ${userId}, "id", ${startedAt}
        FROM "BotAdLink"
        WHERE "id" = ${linkId}::uuid AND "runtimeInstanceId" = ${runtimeId}
          AND "createdAt" <= ${createdCutoff}
        ON CONFLICT ("runtimeInstanceId", "telegramBotUserId") DO NOTHING
        RETURNING "telegramBotUserId"
      )
      UPDATE "TelegramBotUser"
      SET "pendingAdActivation" = "pendingAdActivation" || jsonb_build_object(${runtimeId}::text, ${startedAt.toISOString()}::text)
      WHERE "id" IN (SELECT "telegramBotUserId" FROM attributed)
    `;
    return;
  }

  if (update.message?.successful_payment) return;
  const messageTime = (update.message?.date ?? 0) * 1_000;
  const observedAt =
    messageTime > 0 && messageTime <= now.getTime()
      ? new Date(messageTime)
      : now;
  await trackBotAdActivity(prisma, runtimeId, userId, pending, observedAt);
}

export async function trackBotAdActivity(
  prisma: PrismaService,
  runtimeId: string,
  userId: string,
  pending: Prisma.JsonValue | undefined,
  observedAt: Date,
) {
  if (!pending || typeof pending !== 'object' || Array.isArray(pending)) return;
  const activateFrom = pending[runtimeId];
  if (
    typeof activateFrom !== 'string' ||
    observedAt.toISOString() < activateFrom
  )
    return;
  await prisma.$executeRaw`
    WITH observed AS (
      UPDATE "BotAdAttribution"
      SET "activatedAt" = COALESCE("activatedAt", ${observedAt}::timestamp),
          "retainedAt" = CASE WHEN ${observedAt}::timestamp >= "startedAt" + interval '30 days'
            THEN ${observedAt}::timestamp ELSE NULL END
      WHERE "runtimeInstanceId" = ${runtimeId} AND "telegramBotUserId" = ${userId}
        AND ${observedAt}::timestamp >= "startedAt"
        AND "retainedAt" IS NULL
        AND ("activatedAt" IS NULL OR ${observedAt}::timestamp >= "startedAt" + interval '30 days')
      RETURNING "telegramBotUserId", "startedAt", "retainedAt"
    )
    UPDATE "TelegramBotUser"
    SET "pendingAdActivation" = CASE WHEN observed."retainedAt" IS NULL
      THEN "pendingAdActivation" || jsonb_build_object(${runtimeId}::text,
        to_char(observed."startedAt" + interval '30 days', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'))
      ELSE "pendingAdActivation" - ${runtimeId}::text END
    FROM observed
    WHERE "id" = observed."telegramBotUserId"
  `;
}
