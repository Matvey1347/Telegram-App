import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';
export const CRM_MANUAL_ACTIVITY_RETENTION_DAYS = 365;
export const CRM_MANUAL_ACTIVITY_RETENTION_BATCH = 20_000;
/** Bounded manual-fact cleanup during the existing daily wake, not a new job. */
@Injectable()
export class TelegramCrmManualRetentionService {
  constructor(private readonly prisma: PrismaService) {}
  cleanup(now = new Date()): Promise<number> {
    const before = new Date(
      now.getTime() - CRM_MANUAL_ACTIVITY_RETENTION_DAYS * 86400000,
    );
    return this.prisma.$executeRaw(Prisma.sql`
      WITH expired AS (
        SELECT a.id FROM "TelegramAdvertiserActivity" a
        WHERE metadata->>'kind' IN ('MANUAL_ACTIVITY', 'INSTAGRAM_IDENTITY') AND metadata->>'channel' = 'INSTAGRAM'
          AND a."createdAt" < ${before}
          AND a."saleId" IS NULL AND a."placementId" IS NULL
          AND NOT EXISTS (SELECT 1 FROM "TelegramAdSale" s WHERE s."workspaceId"=a."workspaceId" AND s."sourceAdvertiserActivityId"=a.id)
        ORDER BY a."createdAt", a.id LIMIT ${CRM_MANUAL_ACTIVITY_RETENTION_BATCH}
        FOR UPDATE OF a SKIP LOCKED
      ) DELETE FROM "TelegramAdvertiserActivity" WHERE id IN (SELECT id FROM expired)
    `);
  }
}
