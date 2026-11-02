import { ConflictException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import type { PrismaService } from '../../../../prisma/prisma.service';

export type LeadAnalysisClaim = {
  id: string;
  workspaceId: string;
  sourceId: string;
  observationId: string;
  contentHash: string;
  bindingRevision: number;
  actorUserId: string;
  claimToken: string;
};

/** Claims one task atomically across API instances. Expired work is never replayed. */
export async function claimLeadAnalysis(
  prisma: PrismaService,
  workspaceId: string,
  sourceId: string,
  leaseMs: number,
): Promise<LeadAnalysisClaim | null> {
  const token = randomUUID();
  return prisma.$transaction(async (tx) => {
    const lock = await tx.$queryRaw<Array<{ acquired: boolean }>>(
      Prisma.sql`SELECT pg_try_advisory_xact_lock(hashtextextended(${`lead-analysis:${workspaceId}:${sourceId}`}, 0)) AS acquired`,
    );
    if (!lock[0]?.acquired) return null;
    const rows = await tx.$queryRaw<LeadAnalysisClaim[]>(Prisma.sql`
    UPDATE "TelegramLeadAnalysisQueue" q
    SET status='RUNNING', "claimToken"=${token},
        "claimUntil"=(CURRENT_TIMESTAMP + ${leaseMs} * INTERVAL '1 millisecond'),
        "lastErrorCode"=NULL
    WHERE q.id=(
      SELECT id FROM "TelegramLeadAnalysisQueue"
      WHERE "workspaceId"=${workspaceId} AND "sourceId"=${sourceId}
        AND status='WAIT_AUTH_RECHECK'
        AND NOT EXISTS (SELECT 1 FROM "TelegramLeadAnalysisQueue" active
          WHERE active."workspaceId"=${workspaceId} AND active."sourceId"=${sourceId} AND active.status='RUNNING')
      ORDER BY "createdAt", id FOR UPDATE SKIP LOCKED LIMIT 1
    )
    RETURNING q.id, q."workspaceId", q."sourceId", q."observationId",
      q."contentHash", q."bindingRevision", q."actorUserId", q."claimToken"`);
    return rows[0] ?? null;
  });
}

/** An expired attempt may have reached the provider; require reconciliation. */
export async function expireLeadAnalysisClaims(
  prisma: PrismaService,
  workspaceId: string,
  sourceId: string,
) {
  return prisma.$executeRaw(Prisma.sql`
    UPDATE "TelegramLeadAnalysisQueue"
    SET status='UNKNOWN', "claimToken"=NULL, "claimUntil"=NULL,
        "lastErrorCode"='LEAD_CLAIM_EXPIRED'
    WHERE "workspaceId"=${workspaceId} AND "sourceId"=${sourceId}
      AND status='RUNNING' AND "claimUntil" <= CURRENT_TIMESTAMP`);
}

/** Completion is fenced by both the token and its unexpired deadline. */
export async function finishLeadAnalysisClaim(
  prisma: PrismaService,
  claim: LeadAnalysisClaim,
  status:
    | 'COMPLETED'
    | 'UNKNOWN'
    | 'FAILED'
    | 'NEEDS_METADATA'
    | 'NEEDS_REVIEW'
    | 'NEEDS_MEDIA_ANALYSIS',
  errorCode: string | null = null,
) {
  return prisma.$executeRaw(Prisma.sql`
    UPDATE "TelegramLeadAnalysisQueue"
    SET status=${status}, "claimToken"=NULL, "claimUntil"=NULL,
        "lastErrorCode"=${errorCode}
    WHERE id=${claim.id} AND "workspaceId"=${claim.workspaceId}
      AND status='RUNNING' AND "claimToken"=${claim.claimToken}
      AND "claimUntil" > CURRENT_TIMESTAMP`);
}

/** Call while holding the source lock, in the same transaction as a result write. */
export async function lockLeadAnalysisClaim(
  tx: Prisma.TransactionClient,
  claim: LeadAnalysisClaim,
) {
  const rows = await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`
    SELECT q.id FROM "TelegramLeadAnalysisQueue" q
    JOIN "TelegramLeadSource" s ON s.id=q."sourceId" AND s."workspaceId"=q."workspaceId"
    JOIN "TelegramLeadObservation" o ON o.id=q."observationId" AND o."workspaceId"=q."workspaceId" AND o."sourceId"=q."sourceId"
    JOIN "TelegramLeadAutoConfig" c ON c."sourceId"=s.id AND c."workspaceId"=s."workspaceId"
    WHERE q.id=${claim.id} AND q."workspaceId"=${claim.workspaceId}
      AND q."sourceId"=${claim.sourceId} AND q."observationId"=${claim.observationId}
      AND q."actorUserId"=${claim.actorUserId} AND q."contentHash"=${claim.contentHash}
      AND q."bindingRevision"=${claim.bindingRevision} AND s."bindingRevision"=q."bindingRevision"
      AND s."monitoringActorUserId"=q."actorUserId" AND s."monitoringState"='ACTIVE'
      AND o."contentHash"=q."contentHash" AND o."originalStatus"='OBSERVED'
      AND o."expiresAt">clock_timestamp() AND o."reviewStatus"<>'REJECTED'
      AND c.enabled=true AND q.status='RUNNING' AND q."claimToken"=${claim.claimToken}
      AND q."claimUntil">clock_timestamp()
    FOR UPDATE OF q`);
  if (!rows.length) throw new ConflictException('LEAD_CLAIM_LOST');
}

/** Requeue only if every claimed AI stage is already applied or has a durable successful receipt. */
export async function recoverDurableLeadClaims(
  prisma: PrismaService,
  workspaceId: string,
  sourceId: string,
  version: string,
) {
  return prisma.$executeRaw(Prisma.sql`
    UPDATE "TelegramLeadAnalysisQueue" q
    SET status='WAIT_AUTH_RECHECK', "lastErrorCode"=NULL
    FROM "TelegramLeadObservation" o, "TelegramLeadSource" s, "TelegramLeadAutoConfig" c
    WHERE q."workspaceId"=${workspaceId} AND q."sourceId"=${sourceId} AND q.status='UNKNOWN'
      AND o.id=q."observationId" AND o."workspaceId"=q."workspaceId" AND o."sourceId"=q."sourceId"
      AND o."contentHash"=q."contentHash" AND o."originalStatus"='OBSERVED' AND o."reviewStatus"<>'REJECTED' AND o."expiresAt">clock_timestamp()
      AND s.id=q."sourceId" AND s."workspaceId"=q."workspaceId" AND s."bindingRevision"=q."bindingRevision"
      AND s."monitoringActorUserId"=q."actorUserId" AND s."monitoringState"='ACTIVE'
      AND c."sourceId"=s.id AND c."workspaceId"=s."workspaceId" AND c.enabled=true
      AND (o."classificationOperationId" IS NULL OR o.classification IS NOT NULL OR (
        o."classificationVersion"=${version} AND EXISTS (
          SELECT 1 FROM "AiOperation" a JOIN "AiOperationResult" r ON r."operationDbId"=a.id
          WHERE a."workspaceId"=q."workspaceId" AND a."operationId"=o."classificationOperationId"
            AND a."actorUserId"=q."actorUserId" AND a."businessObjectId"=o.id
            AND a.category='LEAD_AD_CLASSIFICATION' AND (a.status='SUCCEEDED' OR (a.status='RECONCILED' AND a."providerModel"=a.model)) AND a."expiresAt">clock_timestamp() AND r.version=${version})))
      AND (o."extractionOperationId" IS NULL OR o.extraction IS NOT NULL OR (
        o."extractionVersion"=${version} AND EXISTS (
          SELECT 1 FROM "AiOperation" a JOIN "AiOperationResult" r ON r."operationDbId"=a.id
          WHERE a."workspaceId"=q."workspaceId" AND a."operationId"=o."extractionOperationId"
            AND a."actorUserId"=q."actorUserId" AND a."businessObjectId"=o.id
            AND a.category='LEAD_CONTACT_EXTRACTION' AND (a.status='SUCCEEDED' OR (a.status='RECONCILED' AND a."providerModel"=a.model)) AND a."expiresAt">clock_timestamp() AND r.version=${version})))`);
}
