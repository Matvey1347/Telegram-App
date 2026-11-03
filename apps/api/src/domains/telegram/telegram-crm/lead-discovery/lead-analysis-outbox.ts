import { Prisma, type TelegramLeadSource } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import type { TelegramLeadPolicy } from './lead-policy.service';
import type { PrismaService } from '../../../../prisma/prisma.service';
export const LEAD_OUTBOX_SOURCE_LIMIT = 5000;
export const LEAD_OUTBOX_WORKSPACE_LIMIT = 50000;

/** Preflight is deliberately outside ingestion's transaction and locks. */
export async function preflightLeadAnalysisHints(
  prisma: PrismaService,
  policy: TelegramLeadPolicy,
  workspaceId: string,
  userId: string,
  sourceIds: string[],
) {
  try {
    const configs = await prisma.telegramLeadAutoConfig.findMany({
      where: { workspaceId, enabled: true, sourceId: { in: sourceIds } },
      select: {
        sourceId: true,
        source: {
          select: {
            workspaceId: true,
            normalizedKey: true,
            accountId: true,
            processingReference: true,
            allowOwnChannel: true,
            channelId: true,
            monitoringActorUserId: true,
            monitoringState: true,
            bindingRevision: true,
          },
        },
      },
    });
    const allowed = configs.filter(
      ({ source }) =>
        source.monitoringActorUserId === userId &&
        source.monitoringState === 'ACTIVE' &&
        policy.granted(source, 'ai'),
    );
    if (!allowed.length) return new Set<string>();
    await policy.refresh(userId);
    if ((await policy.access(userId, 'analyze')).workspaceId !== workspaceId)
      return new Set<string>();
    return new Set(allowed.map(({ sourceId }) => sourceId));
  } catch {
    return new Set<string>();
  }
}

/** Metadata only: WAIT_AUTH_RECHECK is never authority to make a provider call. */
export async function enqueueLeadAnalysisHints(
  tx: Prisma.TransactionClient,
  policy: TelegramLeadPolicy,
  workspaceId: string,
  userId: string,
  preflightSources: Set<string>,
  sources: Map<string, TelegramLeadSource>,
  changed: Array<{
    sourceId: string;
    externalMessageId: string;
    hash: string;
    deleted: boolean;
    contentChanged: boolean;
    existed: boolean;
  }>,
  reconciling = false,
) {
  const materialChanges = changed.filter(
    (row) => row.deleted || row.contentChanged,
  );
  if (!materialChanges.length) return;
  const stale = materialChanges.filter((row) => row.existed);
  if (stale.length) {
    const keys = stale.map(
      (row) => Prisma.sql`(${row.sourceId},${row.externalMessageId})`,
    );
    await tx.$executeRaw(Prisma.sql`
      DELETE FROM "TelegramLeadAnalysisQueue" q USING "TelegramLeadObservation" o
      WHERE q."observationId"=o.id AND q."workspaceId"=${workspaceId}
        AND o."workspaceId"=${workspaceId} AND (o."sourceId",o."externalMessageId") IN (${Prisma.join(keys)})
        AND q.status='WAIT_AUTH_RECHECK'`);
  }
  const candidates = [...new Set(materialChanges.map((row) => row.sourceId))];
  const enabled = await tx.$queryRaw<Array<{ sourceId: string }>>(Prisma.sql`
    SELECT "sourceId" FROM "TelegramLeadAutoConfig"
    WHERE "workspaceId"=${workspaceId} AND enabled=true AND "sourceId" IN (${Prisma.join(candidates)}) FOR UPDATE`);
  const eligible = new Set(
    enabled.flatMap(({ sourceId }) => {
      const source = sources.get(sourceId);
      return preflightSources.has(sourceId) &&
        source &&
        source.monitoringActorUserId === userId &&
        source.monitoringState === 'ACTIVE' &&
        policy.granted(source, 'ai')
        ? [sourceId]
        : [];
    }),
  );
  const missed = enabled
    .map(({ sourceId }) => sourceId)
    .filter(
      (sourceId) =>
        !eligible.has(sourceId) &&
        materialChanges.some(
          (row) => row.sourceId === sourceId && !row.deleted,
        ),
    );
  if (missed.length)
    await tx.$executeRaw(Prisma.sql`
    UPDATE "TelegramLeadAutoConfig" SET "reconcileNeeded"=true,
      "reconcileGeneration"="reconcileGeneration"+1
    WHERE "workspaceId"=${workspaceId} AND enabled=true AND "sourceId" IN (${Prisma.join(missed)})`);
  if (!eligible.size) return;
  const rows = materialChanges.filter((row) => eligible.has(row.sourceId));
  if (!rows.length) return;
  const inserts = rows
    .filter((row) => !row.deleted)
    .map(
      (row) =>
        Prisma.sql`(${randomUUID()},${row.sourceId},${row.externalMessageId},${row.hash})`,
    );
  if (!inserts.length) return;
  await tx.$executeRaw(Prisma.sql`
    WITH candidate AS (
      SELECT v.id, o."workspaceId", o."sourceId", o.id AS observation_id,
        o."contentHash", s."bindingRevision", s."monitoringActorUserId"
      FROM (VALUES ${Prisma.join(inserts)}) AS v(id,source_id,message_id,content_hash)
      JOIN "TelegramLeadObservation" o ON o."workspaceId"=${workspaceId} AND o."sourceId"=v.source_id AND o."externalMessageId"=v.message_id AND o."contentHash"=v.content_hash AND o."originalStatus"='OBSERVED'
      JOIN "TelegramLeadSource" s ON s.id=o."sourceId" AND s."workspaceId"=o."workspaceId"
      JOIN "TelegramLeadAutoConfig" c ON c."sourceId"=s.id AND c."workspaceId"=s."workspaceId" AND c.enabled=true
      WHERE NOT EXISTS (SELECT 1 FROM "TelegramLeadAnalysisQueue" q
        WHERE q."workspaceId"=o."workspaceId" AND q."observationId"=o.id
          AND q."contentHash"=o."contentHash" AND q."bindingRevision"=s."bindingRevision")
    ), counts AS (
      SELECT "sourceId", count(*) AS n FROM "TelegramLeadAnalysisQueue"
      WHERE "workspaceId"=${workspaceId} AND status='WAIT_AUTH_RECHECK' GROUP BY "sourceId"
    ), ranked AS (
      SELECT candidate.*, COALESCE(counts.n,0) AS source_count,
        COALESCE((SELECT sum(n) FROM counts),0) AS workspace_count,
        row_number() OVER (PARTITION BY candidate."sourceId" ORDER BY candidate.observation_id) AS source_rank,
        row_number() OVER (ORDER BY candidate."sourceId", candidate.observation_id) AS workspace_rank
      FROM candidate LEFT JOIN counts ON counts."sourceId"=candidate."sourceId"
    ), overflow AS (
      UPDATE "TelegramLeadAutoConfig" c SET "overflowedAt"=COALESCE(c."overflowedAt",CURRENT_TIMESTAMP),
        "reconcileNeeded"=true, "reconcileGeneration"=c."reconcileGeneration"+1
      WHERE c."workspaceId"=${workspaceId} AND (${!reconciling} OR c."overflowedAt" IS NULL) AND EXISTS (
        SELECT 1 FROM ranked r WHERE r."sourceId"=c."sourceId"
          AND (r.source_count + r.source_rank > ${LEAD_OUTBOX_SOURCE_LIMIT}
            OR r.workspace_count + r.workspace_rank > ${LEAD_OUTBOX_WORKSPACE_LIMIT})
      ) RETURNING c."sourceId"
    )
    INSERT INTO "TelegramLeadAnalysisQueue" (id,"workspaceId","sourceId","observationId","contentHash","bindingRevision","actorUserId")
    SELECT id, "workspaceId", "sourceId", observation_id, "contentHash", "bindingRevision", "monitoringActorUserId"
    FROM ranked WHERE source_count + source_rank <= ${LEAD_OUTBOX_SOURCE_LIMIT}
      AND workspace_count + workspace_rank <= ${LEAD_OUTBOX_WORKSPACE_LIMIT}
    ON CONFLICT ("workspaceId","observationId","contentHash","bindingRevision") DO NOTHING`);
}
