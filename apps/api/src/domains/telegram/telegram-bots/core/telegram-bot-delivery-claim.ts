import { Prisma, TelegramBotRuntimeEnvironment } from '@prisma/client';
import { PrismaService } from '../../../../prisma/prisma.service';

const MAX_CLAIM_LIMIT = 1_000;

type DeliveryRawClient = Pick<Prisma.TransactionClient, '$queryRaw'>;
type RuntimeScopedDelivery = {
  workspaceId: string;
  botIntegrationId: string;
  runtimeInstanceId: string | null;
  runtimeInstance: {
    workspaceId: string;
    botIntegrationId: string;
    environment: TelegramBotRuntimeEnvironment;
  } | null;
};

function runtimeFilter(environment: TelegramBotRuntimeEnvironment) {
  return environment === TelegramBotRuntimeEnvironment.LOCAL
    ? Prisma.sql`
        EXISTS (
          SELECT 1
          FROM "TelegramBotRuntimeInstance" AS "runtime"
          WHERE "runtime"."id" = "delivery"."runtimeInstanceId"
            AND "runtime"."environment" = 'LOCAL'::"TelegramBotRuntimeEnvironment"
            AND "runtime"."workspaceId" = "delivery"."workspaceId"
            AND "runtime"."botIntegrationId" = "delivery"."botIntegrationId"
        )
      `
    : Prisma.sql`
        (
          "delivery"."runtimeInstanceId" IS NULL
          OR EXISTS (
            SELECT 1
            FROM "TelegramBotRuntimeInstance" AS "runtime"
            WHERE "runtime"."id" = "delivery"."runtimeInstanceId"
              AND "runtime"."environment" = 'PRODUCTION'::"TelegramBotRuntimeEnvironment"
              AND "runtime"."workspaceId" = "delivery"."workspaceId"
              AND "runtime"."botIntegrationId" = "delivery"."botIntegrationId"
          )
        )
      `;
}

export function deliveryMatchesRuntimeScope(
  delivery: RuntimeScopedDelivery,
  environment: TelegramBotRuntimeEnvironment,
) {
  if (delivery.runtimeInstanceId === null) {
    return environment === TelegramBotRuntimeEnvironment.PRODUCTION;
  }
  const runtime = delivery.runtimeInstance;
  return (
    runtime?.environment === environment &&
    runtime.workspaceId === delivery.workspaceId &&
    runtime.botIntegrationId === delivery.botIntegrationId
  );
}

/** Atomically leases one due batch with PostgreSQL row-lock skipping. */
export async function claimDueDeliveryIds(
  prisma: Pick<PrismaService, '$queryRaw'>,
  input: {
    environment: TelegramBotRuntimeEnvironment;
    now: Date;
    lockedUntil: Date;
    limit: number;
  },
) {
  const limit = Math.max(0, Math.min(MAX_CLAIM_LIMIT, Math.trunc(input.limit)));
  if (!limit) return [];
  const environmentScope = runtimeFilter(input.environment);
  const rows = await prisma.$queryRaw<Array<{ id: string }>>(Prisma.sql`
    WITH "due_delivery" AS (
      SELECT "delivery"."id"
      FROM "TelegramBotDelivery" AS "delivery"
      WHERE "delivery"."status" IN (
        'PENDING'::"TelegramBotDeliveryStatus",
        'RETRY'::"TelegramBotDeliveryStatus",
        'PROCESSING'::"TelegramBotDeliveryStatus"
      )
        AND "delivery"."scheduledAt" <= ${input.now}
        AND (
          "delivery"."lockedUntil" IS NULL
          OR "delivery"."lockedUntil" < ${input.now}
        )
        AND ${environmentScope}
      ORDER BY "delivery"."scheduledAt" ASC, "delivery"."id" ASC
      LIMIT ${limit}
      FOR UPDATE OF "delivery" SKIP LOCKED
    )
    UPDATE "TelegramBotDelivery" AS "delivery"
    SET "status" = 'PROCESSING'::"TelegramBotDeliveryStatus",
        "lockedAt" = ${input.now},
        "lockedUntil" = ${input.lockedUntil},
        "updatedAt" = ${input.now}
    FROM "due_delivery"
    WHERE "delivery"."id" = "due_delivery"."id"
    RETURNING "delivery"."id"
  `);
  return rows.map((row) => row.id);
}

/** Terminally releases rows whose runtime ownership disappeared after claim. */
export async function failClosedUnhydratableDeliveryIds(
  prisma: DeliveryRawClient,
  input: {
    ids: string[];
    environment: TelegramBotRuntimeEnvironment;
    claimedAt: Date;
    lockedUntil: Date;
    failedAt: Date;
    error: string;
  },
) {
  if (!input.ids.length) return [];
  const environmentScope = runtimeFilter(input.environment);
  const rows = await prisma.$queryRaw<Array<{ id: string }>>(Prisma.sql`
    UPDATE "TelegramBotDelivery" AS "delivery"
    SET "status" = 'FAILED'::"TelegramBotDeliveryStatus",
        "attempts" = "delivery"."attempts" + 1,
        "lockedAt" = NULL,
        "lockedUntil" = NULL,
        "lastError" = ${input.error},
        "updatedAt" = ${input.failedAt}
    WHERE "delivery"."id" IN (${Prisma.join(input.ids)})
      AND "delivery"."status" = 'PROCESSING'::"TelegramBotDeliveryStatus"
      AND "delivery"."lockedAt" = ${input.claimedAt}
      AND "delivery"."lockedUntil" = ${input.lockedUntil}
      AND NOT (${environmentScope})
    RETURNING "delivery"."id"
  `);
  return rows.map((row) => row.id);
}

/** Fails a lost-ownership claim and its linked work in one transaction. */
export async function failClosedUnhydratableDeliveries(
  prisma: PrismaService,
  input: {
    ids: string[];
    environment: TelegramBotRuntimeEnvironment;
    claimedAt: Date;
    lockedUntil: Date;
    failedAt: Date;
    error: string;
  },
) {
  if (!input.ids.length) return [];
  return prisma.$transaction(async (tx) => {
    const failedIds = await failClosedUnhydratableDeliveryIds(tx, input);
    if (!failedIds.length) return [];
    await tx.greeterSequenceStepExecution.updateMany({
      where: {
        deliveryId: { in: failedIds },
        status: { in: ['PENDING', 'QUEUED'] },
      },
      data: {
        status: 'FAILED',
        completedAt: input.failedAt,
        lastError: input.error,
      },
    });
    await tx.greeterBroadcastRecipient.updateMany({
      where: {
        deliveryId: { in: failedIds },
        status: { in: ['PENDING', 'QUEUED'] },
      },
      data: {
        status: 'FAILED',
        completedAt: input.failedAt,
        lastError: input.error,
      },
    });
    return failedIds;
  });
}
