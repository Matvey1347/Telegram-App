import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';
import { DAY_MS, utcDay } from './ai-usage-read.helpers';

/** Two times the supported 10,000 operations/day workload; one bounded pass. */
export const AI_RETENTION_BATCH_SIZE = 20_000;

@Injectable()
export class AiUsageRetentionService {
  constructor(private readonly prisma: PrismaService) {}

  async cleanup(
    now = new Date(),
  ): Promise<{ operations: number; daily: number; budgetPeriods: number }> {
    const cutoff = new Date(utcDay(now).getTime() - 90 * DAY_MS);
    // A single bounded pass joins the existing daily maintenance job. No retries,
    // loops, budget refunds or provider reconciliation happen during retention.
    const operations = await this.prisma.$executeRaw(Prisma.sql`
      WITH expired AS (
        SELECT "id" FROM "AiOperation"
        WHERE "expiresAt" < ${now} AND "status" IN ('SUCCEEDED', 'FAILED', 'RECONCILED')
        ORDER BY "expiresAt", "id" LIMIT ${AI_RETENTION_BATCH_SIZE} FOR UPDATE SKIP LOCKED
      ) DELETE FROM "AiOperation" WHERE "id" IN (SELECT "id" FROM expired)`);
    // Prisma DateTime is timestamp without time zone, persisted as UTC. Keep
    // both range operands timestamp to avoid session-time-zone coercion.
    const daily = await this.prisma.$executeRaw(Prisma.sql`
      WITH expired AS (
        SELECT d."id" FROM "AiUsageDaily" d WHERE d."day" < ${cutoff}
          AND NOT EXISTS (
            SELECT 1 FROM "AiOperation" o
            WHERE o."workspaceId" = d."workspaceId" AND o."status" = 'UNKNOWN'
              AND o."category" = d."category" AND o."provider" = d."provider" AND o."model" = d."model"
              AND o."createdAt" >= d."day"::timestamp
              AND o."createdAt" < (d."day" + 1)::timestamp
          )
        ORDER BY d."day", d."id" LIMIT ${AI_RETENTION_BATCH_SIZE} FOR UPDATE OF d SKIP LOCKED
      ) DELETE FROM "AiUsageDaily" WHERE "id" IN (SELECT "id" FROM expired)`);
    const budgetPeriods = await this.prisma.$executeRaw(Prisma.sql`
      WITH expired AS (
        SELECT "id" FROM "AiBudgetPeriod" WHERE "periodEnd" < ${cutoff} AND "reserved" = 0
        ORDER BY "periodEnd", "id" LIMIT ${AI_RETENTION_BATCH_SIZE} FOR UPDATE SKIP LOCKED
      ) DELETE FROM "AiBudgetPeriod" WHERE "id" IN (SELECT "id" FROM expired) AND "reserved" = 0`);
    // UNKNOWN financial receipts survive, but their bounded output does not outlive
    // the operation retention window. Resolved receipts already cascade on delete.
    await this.prisma.$executeRaw(Prisma.sql`
      WITH expired AS (
        SELECT r."operationDbId" FROM "AiOperationResult" r
        JOIN "AiOperation" o ON o.id=r."operationDbId"
        WHERE o."expiresAt" < ${now}
        ORDER BY o."expiresAt", o.id LIMIT ${AI_RETENTION_BATCH_SIZE} FOR UPDATE OF r SKIP LOCKED
      ) DELETE FROM "AiOperationResult" WHERE "operationDbId" IN (SELECT "operationDbId" FROM expired)`);
    return { operations, daily, budgetPeriods };
  }
}
