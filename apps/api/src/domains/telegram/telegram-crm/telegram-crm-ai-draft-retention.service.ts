import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';

export const CRM_AI_DRAFT_RETENTION_BATCH = 10_000;
/** One bounded pass in the existing daily maintenance wake; no idle timer. */
@Injectable()
export class TelegramCrmAiDraftRetentionService {
  constructor(private readonly prisma: PrismaService) {}

  async cleanup(now = new Date()): Promise<number> {
    // Expiry never refunds the separate usage ledger. Dated operation identities
    // still prevent a deleted old draft from becoming an implicit paid retry.
    return this.prisma.$executeRaw(Prisma.sql`
      WITH expired AS (
        SELECT "id" FROM "TelegramCrmAiDraft" WHERE "expiresAt" < ${now}
          AND status NOT IN ('GENERATING', 'UNKNOWN')
        ORDER BY "expiresAt", "id" LIMIT ${CRM_AI_DRAFT_RETENTION_BATCH}
        FOR UPDATE SKIP LOCKED
      ) DELETE FROM "TelegramCrmAiDraft" WHERE "id" IN (SELECT "id" FROM expired)
    `);
  }
}
