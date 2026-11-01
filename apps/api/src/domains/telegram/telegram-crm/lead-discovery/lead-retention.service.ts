import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../../prisma/prisma.service';
export const LEAD_RETENTION_BATCH = 20_000;
/** Same daily maintenance wake; no interval, refunds, provider calls or drain loop. */
@Injectable()
export class TelegramLeadRetentionService {
  constructor(private readonly prisma: PrismaService) {}
  async cleanup(now = new Date()): Promise<{
    observations: number;
    candidates: number;
    qualifications: number;
    drafts: number;
  }> {
    const drafts = await this.prisma.$executeRaw(Prisma.sql`
      WITH expired AS (
        SELECT id FROM "TelegramLeadCandidateDraft" WHERE "expiresAt" < ${now}
          AND status NOT IN ('GENERATING', 'UNKNOWN')
        ORDER BY "expiresAt", id LIMIT ${LEAD_RETENTION_BATCH} FOR UPDATE SKIP LOCKED
      ) DELETE FROM "TelegramLeadCandidateDraft" WHERE id IN (SELECT id FROM expired)`);
    const qualifications = await this.prisma.$executeRaw(Prisma.sql`
      WITH expired AS (
        SELECT id FROM "TelegramLeadQualification" WHERE "expiresAt" < ${now}
          AND status NOT IN ('GENERATING', 'UNKNOWN')
        ORDER BY "expiresAt", id LIMIT ${LEAD_RETENTION_BATCH} FOR UPDATE SKIP LOCKED
      ) DELETE FROM "TelegramLeadQualification" WHERE id IN (SELECT id FROM expired)`);
    const observations = await this.prisma.$executeRaw(Prisma.sql`
      WITH expired AS (
        SELECT id FROM "TelegramLeadObservation" WHERE "expiresAt" < ${now}
        ORDER BY "expiresAt", id LIMIT ${LEAD_RETENTION_BATCH} FOR UPDATE SKIP LOCKED
      ) DELETE FROM "TelegramLeadObservation" WHERE id IN (SELECT id FROM expired)`);
    // Compact acquisition records belong to the linked CRM client. Aliases survive
    // while their target is live/linked, preserving human-approved exact identity.
    const candidates = await this.prisma.$executeRaw(Prisma.sql`
      WITH expired AS (
        SELECT c.id FROM "TelegramLeadCandidate" c
        WHERE c."expiresAt" < ${now} AND c."contactId" IS NULL
          AND NOT EXISTS (SELECT 1 FROM "TelegramLeadObservation" o WHERE o."candidateId"=c.id AND o."workspaceId"=c."workspaceId")
          AND NOT EXISTS (SELECT 1 FROM "TelegramLeadQualification" q WHERE q."candidateId"=c.id AND q."workspaceId"=c."workspaceId" AND q.status IN ('GENERATING', 'UNKNOWN'))
          AND NOT EXISTS (SELECT 1 FROM "TelegramLeadCandidateDraft" d WHERE d."candidateId"=c.id AND d."workspaceId"=c."workspaceId" AND d.status IN ('GENERATING', 'UNKNOWN'))
          AND NOT (c."reviewStatus"='MERGED' AND EXISTS (
            SELECT 1 FROM "TelegramLeadCandidate" t WHERE t.id=c."mergedIntoId" AND t."workspaceId"=c."workspaceId"
              AND (t."expiresAt">=${now} OR t."contactId" IS NOT NULL OR t."reviewStatus"='MERGED')
          ))
        ORDER BY c."expiresAt", c.id LIMIT ${LEAD_RETENTION_BATCH} FOR UPDATE OF c SKIP LOCKED
      ) DELETE FROM "TelegramLeadCandidate" WHERE id IN (SELECT id FROM expired)`);
    return { observations, candidates, qualifications, drafts };
  }
}
