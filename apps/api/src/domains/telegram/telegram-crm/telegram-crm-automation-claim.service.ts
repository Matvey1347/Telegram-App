import { Injectable, Optional } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../../../prisma/prisma.service';
import { TelegramCrmInternalNotificationProjector } from './telegram-crm-internal-notification-projector.service';

const CLAIM_TTL_MS = 5 * 60_000;

@Injectable()
export class TelegramCrmAutomationClaimService {
  readonly ownerId = randomUUID();

  constructor(
    private readonly prisma: PrismaService,
    @Optional()
    private readonly notifications?: TelegramCrmInternalNotificationProjector,
  ) {}

  async terminalizeExhausted(limit: number) {
    const notificationIds = await this.prisma.$transaction(async (tx) => {
      const failed = await tx.$queryRaw<
        Array<{
          id: string;
          workspaceId: string;
          contactId: string;
          telegramAdSaleId: string | null;
          reason: string | null;
        }>
      >(Prisma.sql`
      WITH exhausted AS (
        SELECT "id"
        FROM "TelegramCrmCustomerAutomationExecution"
        WHERE "status" IN (
          'PENDING'::"TelegramCrmCustomerAutomationExecutionStatus",
          'PROCESSING'::"TelegramCrmCustomerAutomationExecutionStatus",
          'SENDING'::"TelegramCrmCustomerAutomationExecutionStatus"
        )
          AND "attempts" >= "maxAttempts"
          AND ("leaseExpiresAt" IS NULL OR "leaseExpiresAt" <= NOW())
        ORDER BY COALESCE("nextAttemptAt", "leaseExpiresAt", "dueAt"), "id"
        FOR UPDATE SKIP LOCKED
        LIMIT ${limit}
      )
      UPDATE "TelegramCrmCustomerAutomationExecution" execution
      SET
        "status" = 'FAILED'::"TelegramCrmCustomerAutomationExecutionStatus",
        "completedAt" = NOW(),
        "nextAttemptAt" = NULL,
        "leaseOwner" = NULL,
        "leaseExpiresAt" = NULL,
        "reason" = CASE
          WHEN execution."status" = 'SENDING'::"TelegramCrmCustomerAutomationExecutionStatus"
            OR execution."reason" = 'AMBIGUOUS_SEND_RECOVERY'
            THEN 'AMBIGUOUS_SEND_UNRESOLVED'
          ELSE 'RETRY_EXHAUSTED'
        END,
        "lastError" = CASE
          WHEN execution."status" = 'SENDING'::"TelegramCrmCustomerAutomationExecutionStatus"
            OR execution."reason" = 'AMBIGUOUS_SEND_RECOVERY'
            THEN COALESCE(
              execution."lastError",
              'Telegram send outcome remains ambiguous after retry exhaustion'
            )
          ELSE execution."lastError"
        END,
        "updatedAt" = NOW()
      FROM exhausted
      WHERE execution."id" = exhausted."id"
      RETURNING
        execution."id",
        execution."workspaceId",
        execution."contactId",
        execution."telegramAdSaleId",
        execution."reason"
      `);
      return this.notifications
        ? (await this.notifications.automationBlocked(tx, failed)).map(
            (item) => item.id,
          )
        : [];
    });
    await this.notifications?.publish(notificationIds);
  }

  async claim(limit: number) {
    const now = new Date();
    const leaseExpiresAt = new Date(now.getTime() + CLAIM_TTL_MS);
    const rows = await this.prisma.$queryRaw<Array<{ id: string }>>(Prisma.sql`
      WITH pending AS (
        SELECT "id", "nextAttemptAt" AS "readyAt"
        FROM "TelegramCrmCustomerAutomationExecution"
        WHERE "status" = 'PENDING'::"TelegramCrmCustomerAutomationExecutionStatus"
          AND "attempts" < "maxAttempts"
          AND "dueAt" <= ${now}
          AND "nextAttemptAt" <= ${now}
        ORDER BY "nextAttemptAt", "id"
        FOR UPDATE SKIP LOCKED
        LIMIT ${limit}
      ), processing AS (
        SELECT "id", "leaseExpiresAt" AS "readyAt"
        FROM "TelegramCrmCustomerAutomationExecution"
        WHERE "status" = 'PROCESSING'::"TelegramCrmCustomerAutomationExecutionStatus"
          AND "attempts" < "maxAttempts"
          AND "leaseExpiresAt" <= ${now}
        ORDER BY "leaseExpiresAt", "id"
        FOR UPDATE SKIP LOCKED
        LIMIT ${limit}
      ), sending AS (
        SELECT "id", "leaseExpiresAt" AS "readyAt"
        FROM "TelegramCrmCustomerAutomationExecution"
        WHERE "status" = 'SENDING'::"TelegramCrmCustomerAutomationExecutionStatus"
          AND "attempts" < "maxAttempts"
          AND "leaseExpiresAt" <= ${now}
        ORDER BY "leaseExpiresAt", "id"
        FOR UPDATE SKIP LOCKED
        LIMIT ${limit}
      ), candidates AS (
        SELECT "id"
        FROM (
          SELECT * FROM pending
          UNION ALL SELECT * FROM processing
          UNION ALL SELECT * FROM sending
        ) ready
        ORDER BY "readyAt", "id"
        LIMIT ${limit}
      )
      UPDATE "TelegramCrmCustomerAutomationExecution" execution
      SET
        "status" = 'PROCESSING'::"TelegramCrmCustomerAutomationExecutionStatus",
        "leaseOwner" = ${this.ownerId},
        "leaseExpiresAt" = ${leaseExpiresAt},
        "attempts" = execution."attempts" + 1,
        "attemptedAt" = ${now},
        "reason" = CASE
          WHEN execution."status" = 'SENDING'::"TelegramCrmCustomerAutomationExecutionStatus"
            THEN 'AMBIGUOUS_SEND_RECOVERY'
          ELSE execution."reason"
        END,
        "updatedAt" = ${now}
      FROM candidates
      WHERE execution."id" = candidates."id"
      RETURNING execution."id"
    `);
    return rows.map((row) => row.id);
  }
}
