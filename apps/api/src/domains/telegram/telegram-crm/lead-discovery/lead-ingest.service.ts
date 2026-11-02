import type { LeadTargetEvidence } from './lead-advertised-targets';
import { loadLeadIngestSources } from './lead-ingest-sources';
import {
  leadTransportSnapshot,
  type LeadTransportSnapshot,
} from './lead-transport-snapshot';
import {
  leadCoverageUpdate,
  type LeadRecoveryCheckpoint,
} from './lead-ingest-coverage';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Prisma, type TelegramLeadSource } from '@prisma/client';
import type {
  LeadMaterialInput,
  LeadIngestResult,
} from '@telegram-system/shared';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../../../../prisma/prisma.service';
import { acquirePostgresTransactionLock } from '../../../../prisma/postgres-advisory-lock';
import { TelegramLeadPolicy } from './lead-policy.service';
import { leadHash, literalLeadLinks } from './lead-normalization';
import {
  enqueueLeadAnalysisHints,
  preflightLeadAnalysisHints,
} from './lead-analysis-outbox';
export type LeadIngestEvent = {
  sourceId: string;
  material: LeadMaterialInput;
  pts?: number;
  ptsCount?: number;
  gap?: boolean;
  expectedTransport?: LeadTransportSnapshot;
  capturedAt?: Date;
  editedAt?: Date;
  rpcStartedAt?: Date;
  metadataComplete?: boolean;
  metadataTextOnly?: boolean;
  textMetadataComplete?: boolean;
  mediaPresent?: boolean;
  targetEvidence?: LeadTargetEvidence[];
};
function materialUrl(source: TelegramLeadSource, material: LeadMaterialInput) {
  if (!material.messageUrl) return null;
  if (material.messageUrl.length > 500)
    throw new BadRequestException('LEAD_MESSAGE_URL_INVALID');
  const url = new URL(material.messageUrl);
  if (
    url.protocol !== 'https:' ||
    url.username ||
    url.password ||
    url.search ||
    url.hash
  )
    throw new BadRequestException('LEAD_MESSAGE_URL_INVALID');
  if (source.type === 'TELEGRAM_CHANNEL') {
    const expected = source.username
      ? `/${source.username}/${material.externalMessageId}`
      : `/c/${source.channelId}/${material.externalMessageId}`;
    if (
      url.hostname !== 't.me' ||
      url.pathname.toLowerCase() !== expected.toLowerCase()
    )
      throw new BadRequestException('LEAD_MESSAGE_URL_SOURCE_MISMATCH');
  }
  return url.toString();
}
@Injectable()
export class TelegramLeadIngestService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly policy: TelegramLeadPolicy,
  ) {}
  async ingest(
    userId: string,
    sourceId: string,
    items: LeadMaterialInput[],
    options: {
      livePts?: number;
      ptsCount?: number;
      recovery?: boolean;
      recoveryCheckpoint?: LeadRecoveryCheckpoint;
      expectedTransport?: LeadTransportSnapshot;
      rpcStartedAt?: Date;
      editedMessageDates?: Record<string, string>;
      postMetadataComplete?: Record<string, boolean>;
      postMetadataTextOnly?: Record<string, boolean>;
      postTextMetadataComplete?: Record<string, boolean>;
      postMediaPresent?: Record<string, boolean>;
      postTargetEvidence?: Record<string, LeadTargetEvidence[]>;
      historyLeaseToken?: string;
      gap?: boolean;
    } = {},
  ): Promise<LeadIngestResult> {
    if ((!items.length && !options.recoveryCheckpoint) || items.length > 50)
      throw new BadRequestException('LEAD_MATERIAL_BATCH_LIMIT');
    const source = await this.policy.source(userId, sourceId, 'manage');
    this.policy.assertProcessing(source, 'ingest', false);
    return this.ingestBatch(
      userId,
      source.workspaceId,
      items.map((material, index) => ({
        sourceId,
        material,
        expectedTransport:
          options.expectedTransport ?? leadTransportSnapshot(source),
        rpcStartedAt: options.rpcStartedAt,
        capturedAt: options.rpcStartedAt,
        metadataComplete:
          options.postMetadataComplete?.[material.externalMessageId],
        metadataTextOnly:
          options.postMetadataTextOnly?.[material.externalMessageId],
        textMetadataComplete:
          options.postTextMetadataComplete?.[material.externalMessageId],
        mediaPresent: options.postMediaPresent?.[material.externalMessageId],
        targetEvidence:
          options.postTargetEvidence?.[material.externalMessageId],
        editedAt: options.editedMessageDates?.[material.externalMessageId]
          ? new Date(options.editedMessageDates[material.externalMessageId])
          : undefined,
        ...(index === items.length - 1
          ? {
              pts: options.livePts,
              ptsCount: options.ptsCount,
              gap: options.gap,
            }
          : {}),
      })),
      !options.recovery,
      options.recoveryCheckpoint,
      options.historyLeaseToken
        ? { sourceId, token: options.historyLeaseToken }
        : undefined,
    );
  }
  async ingestBatch(
    userId: string,
    workspaceId: string,
    events: LeadIngestEvent[],
    allowPaused = false,
    recovery?: LeadRecoveryCheckpoint,
    historyLease?: { sourceId: string; token: string },
  ): Promise<LeadIngestResult> {
    const access = await this.policy.access(userId, 'manage');
    if (access.workspaceId !== workspaceId)
      throw new ForbiddenException('LEAD_WORKSPACE_MISMATCH');
    if (events.length > 100)
      throw new BadRequestException('LEAD_EVENT_BATCH_LIMIT');
    if (!events.length && !recovery)
      return { received: 0, changed: 0, unchanged: 0, filtered: 0, gap: false };
    const analysisSources = events.length
      ? await preflightLeadAnalysisHints(
          this.prisma,
          this.policy,
          workspaceId,
          userId,
          [...new Set(events.map((event) => event.sourceId))],
        )
      : new Set<string>();
    return this.prisma.$transaction(async (tx) => {
      await acquirePostgresTransactionLock(tx, `lead-discovery:${workspaceId}`);
      if (historyLease) {
        const fenced = await tx.$queryRaw<Array<{ id: string }>>(
          Prisma.sql`SELECT id FROM "TelegramLeadHistoryJob" WHERE "workspaceId"=${workspaceId} AND "sourceId"=${historyLease.sourceId} AND "leaseToken"=${historyLease.token} AND "leaseUntil">(NOW() AT TIME ZONE 'UTC') AND status IN ('RUNNING','PAUSING') FOR UPDATE`,
        );
        if (!fenced.length)
          throw new ConflictException('LEAD_HISTORY_LEASE_LOST');
      }
      const gating = await loadLeadIngestSources(
        tx,
        this.policy,
        workspaceId,
        events,
        allowPaused,
        recovery,
      );
      const { eligible, blockedSourceIds } = gating;
      let filtered = 0;
      let staleRpc = false;
      const contentGaps = new Set<string>();
      const unique = new Map<
        string,
        {
          event: LeadIngestEvent;
          text: string;
          hash: string;
          publishedAt: Date;
          links: string[];
          url: string | null;
        }
      >();
      for (const event of events) {
        if (gating.staleLive(event)) continue;
        const source = eligible.get(event.sourceId);
        if (!source || !gating.matches(event)) {
          filtered++;
          continue;
        }
        const material = event.material,
          text = material.text.normalize('NFC').slice(0, 4096),
          publishedAt = new Date(material.publishedAt);
        if (
          !/^[A-Za-z0-9_.:-]{1,120}$/.test(material.externalMessageId) ||
          Number.isNaN(publishedAt.getTime()) ||
          publishedAt.getTime() > Date.now() + 86400000 ||
          Buffer.byteLength(text) > 16384
        )
          throw new BadRequestException('LEAD_MATERIAL_INVALID');
        if (
          !material.deleted &&
          !/[\p{L}\p{N}]/u.test(text) &&
          event.mediaPresent !== true
        ) {
          filtered++;
          continue;
        }
        const contentHash =
          event.targetEvidence === undefined
            ? leadHash([text, publishedAt.toISOString()])
            : leadHash([
                text,
                publishedAt.toISOString(),
                event.metadataComplete === true,
                event.metadataTextOnly === true,
                event.targetEvidence,
              ]);
        const previous = unique.get(
          `${source.id}:${material.externalMessageId}`,
        );
        if (previous && previous.hash !== contentHash)
          contentGaps.add(source.id);
        if (
          previous?.event.pts !== undefined &&
          event.pts !== undefined &&
          previous.event.pts >= event.pts
        )
          continue;
        unique.set(`${source.id}:${material.externalMessageId}`, {
          event,
          text,
          hash: contentHash,
          publishedAt,
          links: literalLeadLinks(text),
          url: materialUrl(source, material),
        });
      }
      if (!unique.size && !recovery)
        return {
          received: events.length,
          changed: 0,
          unchanged: events.length - filtered,
          filtered,
          gap: gating.transportGap || events.some((event) => event.gap),
          ...(historyLease ? { historyFenceLost: gating.transportGap } : {}),
          ...(blockedSourceIds.length ? { blockedSourceIds } : {}),
        };
      const existing = unique.size
        ? await tx.telegramLeadObservation.findMany({
            where: {
              workspaceId,
              OR: [...unique.values()].map((row) => ({
                sourceId: row.event.sourceId,
                externalMessageId: row.event.material.externalMessageId,
              })),
            },
            select: {
              id: true,
              sourceId: true,
              externalMessageId: true,
              contentHash: true,
              originalStatus: true,
              text: true,
              publishedAt: true,
              messageUrl: true,
              links: true,
              editedAt: true,
              observedAt: true,
              textMetadataComplete: true,
              mediaPresent: true,
            },
          })
        : [];
      const previous = new Map(
        existing.map((row) => [
          `${row.sourceId}:${row.externalMessageId}`,
          row,
        ]),
      );
      const changed = [...unique.entries()].flatMap(([key, row]) => {
        const old = previous.get(key);
        if (
          old &&
          row.event.rpcStartedAt &&
          (old.editedAt ?? old.observedAt) >= row.event.rpcStartedAt
        ) {
          filtered++;
          staleRpc = true;
          return [];
        }
        if (old && old.contentHash !== row.hash)
          contentGaps.add(row.event.sourceId);
        if (row.url === null && old?.messageUrl) row.url = old.messageUrl;
        if (old?.originalStatus === 'DELETED' && !row.event.material.deleted)
          return [];
        if (row.event.material.deleted) {
          if (!old) {
            filtered++;
            return [];
          }
          return old.originalStatus === 'DELETED'
            ? []
            : [
                {
                  ...row,
                  text: old.text,
                  hash: old.contentHash,
                  publishedAt: old.publishedAt,
                  links: old.links as string[],
                  url: old.messageUrl,
                  old,
                },
              ];
        }
        return old?.contentHash === row.hash &&
          old.originalStatus === 'OBSERVED' &&
          old.messageUrl === row.url
          ? []
          : [{ ...row, old }];
      });
      const newCount = changed.filter((row) => !row.old).length;
      if (newCount) {
        const day = new Date();
        day.setUTCHours(0, 0, 0, 0);
        if (
          (await tx.telegramLeadObservation.count({
            where: { workspaceId, observedAt: { gte: day } },
          })) +
            newCount >
          10000
        )
          throw new BadRequestException('LEAD_DAILY_POST_QUOTA');
      }
      if (changed.length) {
        const now = new Date();
        const values = changed.map(
          (row) =>
            Prisma.sql`(${row.old?.id ?? randomUUID()},${workspaceId},${row.event.sourceId},${row.event.material.externalMessageId},${row.url},${row.publishedAt},${now},${new Date(now.getTime() + 90 * 86400000)},${row.text},${JSON.stringify(row.links)}::jsonb,${row.hash},${row.event.material.deleted ? 'DELETED' : 'OBSERVED'},${row.event.editedAt ?? null}::timestamp)`,
        );
        await tx.$executeRaw(Prisma.sql`INSERT INTO "TelegramLeadObservation" (id,"workspaceId","sourceId","externalMessageId","messageUrl","publishedAt","observedAt","expiresAt",text,links,"contentHash","originalStatus","editedAt") VALUES ${Prisma.join(values)}
          ON CONFLICT ("workspaceId","sourceId","externalMessageId") DO UPDATE SET text=EXCLUDED.text,links=EXCLUDED.links,"contentHash"=EXCLUDED."contentHash","messageUrl"=EXCLUDED."messageUrl","publishedAt"=EXCLUDED."publishedAt","originalStatus"=EXCLUDED."originalStatus","editedAt"=COALESCE(EXCLUDED."editedAt",${now}),
          "expiresAt"=CASE WHEN "TelegramLeadObservation"."contentHash"<>EXCLUDED."contentHash" THEN EXCLUDED."expiresAt" ELSE "TelegramLeadObservation"."expiresAt" END,
          "metadataComplete"=CASE WHEN "TelegramLeadObservation"."contentHash"<>EXCLUDED."contentHash" THEN false ELSE "TelegramLeadObservation"."metadataComplete" END,
          "metadataTextOnly"=CASE WHEN "TelegramLeadObservation"."contentHash"<>EXCLUDED."contentHash" THEN false ELSE "TelegramLeadObservation"."metadataTextOnly" END,
          "textMetadataComplete"=CASE WHEN "TelegramLeadObservation"."contentHash"<>EXCLUDED."contentHash" THEN NULL ELSE "TelegramLeadObservation"."textMetadataComplete" END,
          "mediaPresent"=CASE WHEN "TelegramLeadObservation"."contentHash"<>EXCLUDED."contentHash" THEN NULL ELSE "TelegramLeadObservation"."mediaPresent" END,
          "targetEvidence"=CASE WHEN "TelegramLeadObservation"."contentHash"<>EXCLUDED."contentHash" THEN NULL ELSE "TelegramLeadObservation"."targetEvidence" END,
          "processingStatus"=CASE WHEN "TelegramLeadObservation"."contentHash"<>EXCLUDED."contentHash" THEN 'PENDING' ELSE "TelegramLeadObservation"."processingStatus" END,
          classification=CASE WHEN "TelegramLeadObservation"."contentHash"<>EXCLUDED."contentHash" THEN NULL ELSE "TelegramLeadObservation".classification END,
          extraction=CASE WHEN "TelegramLeadObservation"."contentHash"<>EXCLUDED."contentHash" THEN NULL ELSE "TelegramLeadObservation".extraction END,
          "classificationVersion"=CASE WHEN "TelegramLeadObservation"."contentHash"<>EXCLUDED."contentHash" THEN NULL ELSE "TelegramLeadObservation"."classificationVersion" END,
          "classificationOperationId"=CASE WHEN "TelegramLeadObservation"."contentHash"<>EXCLUDED."contentHash" THEN NULL ELSE "TelegramLeadObservation"."classificationOperationId" END,
          "extractionOperationId"=CASE WHEN "TelegramLeadObservation"."contentHash"<>EXCLUDED."contentHash" THEN NULL ELSE "TelegramLeadObservation"."extractionOperationId" END,
          "classificationOperationDbId"=CASE WHEN "TelegramLeadObservation"."contentHash"<>EXCLUDED."contentHash" THEN NULL ELSE "TelegramLeadObservation"."classificationOperationDbId" END,
          "extractionOperationDbId"=CASE WHEN "TelegramLeadObservation"."contentHash"<>EXCLUDED."contentHash" THEN NULL ELSE "TelegramLeadObservation"."extractionOperationDbId" END,
          "extractionVersion"=CASE WHEN "TelegramLeadObservation"."contentHash"<>EXCLUDED."contentHash" THEN NULL ELSE "TelegramLeadObservation"."extractionVersion" END,
          "candidateId"=CASE WHEN "TelegramLeadObservation"."contentHash"<>EXCLUDED."contentHash" THEN NULL ELSE "TelegramLeadObservation"."candidateId" END,
          "reviewStatus"=CASE WHEN "TelegramLeadObservation"."contentHash"<>EXCLUDED."contentHash" THEN 'PENDING' ELSE "TelegramLeadObservation"."reviewStatus" END
          WHERE "TelegramLeadObservation"."contentHash" IS DISTINCT FROM EXCLUDED."contentHash" OR "TelegramLeadObservation"."originalStatus" IS DISTINCT FROM EXCLUDED."originalStatus" OR "TelegramLeadObservation"."messageUrl" IS DISTINCT FROM EXCLUDED."messageUrl"`);
        await enqueueLeadAnalysisHints(
          tx,
          this.policy,
          workspaceId,
          userId,
          analysisSources,
          eligible,
          changed.map((row) => ({
            sourceId: row.event.sourceId,
            externalMessageId: row.event.material.externalMessageId,
            hash: row.hash,
            deleted: Boolean(row.event.material.deleted),
            contentChanged: !row.old || row.old.contentHash !== row.hash,
            existed: Boolean(row.old),
          })),
        );
      }
      const metadata = [...unique.values()].flatMap((row) =>
        row.event.metadataComplete === undefined || row.event.material.deleted
          ? []
          : [
              Prisma.sql`(${row.event.sourceId},${row.event.material.externalMessageId},${row.hash},${row.event.metadataComplete}::boolean,${row.event.metadataTextOnly === true}::boolean,${row.event.targetEvidence === undefined ? null : JSON.stringify(row.event.targetEvidence)}::jsonb)`,
            ],
      );
      if (metadata.length) {
        await tx.$executeRaw(Prisma.sql`
          UPDATE "TelegramLeadObservation" o SET "metadataComplete"=v.complete, "metadataTextOnly"=v.text_only, "targetEvidence"=COALESCE(v.evidence,o."targetEvidence"),
            "processingStatus"=CASE WHEN v.complete AND o."processingStatus"='MANUAL_REVIEW_METADATA' THEN 'PENDING' ELSE o."processingStatus" END
          FROM (VALUES ${Prisma.join(metadata)}) v(source_id,message_id,content_hash,complete,text_only,evidence)
          WHERE o."workspaceId"=${workspaceId} AND o."sourceId"=v.source_id
            AND o."externalMessageId"=v.message_id AND o."contentHash"=v.content_hash
            AND (o."metadataComplete" IS DISTINCT FROM v.complete OR o."metadataTextOnly" IS DISTINCT FROM v.text_only OR (v.evidence IS NOT NULL AND o."targetEvidence" IS DISTINCT FROM v.evidence))`);
        await tx.$executeRaw(Prisma.sql`
          UPDATE "TelegramLeadAnalysisQueue" q SET status='WAIT_AUTH_RECHECK', "prefilterDecision"=NULL, "prefilterVersion"=NULL, "prefilterReason"=NULL, "prefilterSignals"=NULL, "prefilterTargets"=NULL
          FROM "TelegramLeadObservation" o, "TelegramLeadSource" s, "TelegramLeadAutoConfig" c
          WHERE q."workspaceId"=${workspaceId} AND q."actorUserId"=${userId} AND q.status='NEEDS_METADATA'
            AND o.id=q."observationId" AND o."workspaceId"=q."workspaceId" AND o."sourceId"=q."sourceId"
            AND o."contentHash"=q."contentHash" AND o."metadataComplete"=true
            AND (o."sourceId",o."externalMessageId",o."contentHash") IN (SELECT source_id,message_id,content_hash FROM (VALUES ${Prisma.join(metadata)}) v(source_id,message_id,content_hash,complete,text_only,evidence) WHERE complete=true)
            AND s.id=q."sourceId" AND s."workspaceId"=q."workspaceId" AND s."bindingRevision"=q."bindingRevision"
            AND c."sourceId"=s.id AND c."workspaceId"=s."workspaceId" AND c.enabled=true`);
      }
      const textMedia = [...unique.entries()].flatMap(([key, row]) =>
        row.event.material.deleted ||
        (row.event.textMetadataComplete === undefined &&
          row.event.mediaPresent === undefined) ||
        (previous.get(key)?.contentHash === row.hash &&
          (row.event.textMetadataComplete === undefined ||
            previous.get(key)?.textMetadataComplete ===
              row.event.textMetadataComplete) &&
          (row.event.mediaPresent === undefined ||
            previous.get(key)?.mediaPresent === row.event.mediaPresent))
          ? []
          : [
              Prisma.sql`(${row.event.sourceId},${row.event.material.externalMessageId},${row.hash},${row.event.textMetadataComplete ?? null}::boolean,${row.event.mediaPresent ?? null}::boolean)`,
            ],
      );
      if (textMedia.length) {
        await tx.$executeRaw(Prisma.sql`
          UPDATE "TelegramLeadObservation" o SET
            "textMetadataComplete"=COALESCE(v.text_complete,o."textMetadataComplete"),
            "mediaPresent"=COALESCE(v.media_present,o."mediaPresent"),
            "processingStatus"=CASE WHEN v.text_complete=true AND o."processingStatus"='MANUAL_REVIEW_METADATA' THEN 'PENDING' ELSE o."processingStatus" END
          FROM (VALUES ${Prisma.join(textMedia)}) v(source_id,message_id,content_hash,text_complete,media_present)
          WHERE o."workspaceId"=${workspaceId} AND o."sourceId"=v.source_id AND o."externalMessageId"=v.message_id AND o."contentHash"=v.content_hash
            AND ((v.text_complete IS NOT NULL AND o."textMetadataComplete" IS DISTINCT FROM v.text_complete) OR (v.media_present IS NOT NULL AND o."mediaPresent" IS DISTINCT FROM v.media_present))`);
        await tx.$executeRaw(Prisma.sql`
          UPDATE "TelegramLeadAnalysisQueue" q SET status='WAIT_AUTH_RECHECK', "prefilterDecision"=NULL, "prefilterVersion"=NULL, "prefilterReason"=NULL, "prefilterSignals"=NULL, "prefilterTargets"=NULL
          FROM "TelegramLeadObservation" o, "TelegramLeadSource" s, "TelegramLeadAutoConfig" c
          WHERE q."workspaceId"=${workspaceId} AND q."actorUserId"=${userId}
            AND (q.status='NEEDS_METADATA' AND o."textMetadataComplete"=true OR q.status='NEEDS_MEDIA_ANALYSIS' AND o."mediaPresent"=false)
            AND o.id=q."observationId" AND o."workspaceId"=q."workspaceId" AND o."sourceId"=q."sourceId" AND o."contentHash"=q."contentHash"
            AND (o."sourceId",o."externalMessageId",o."contentHash") IN (SELECT source_id,message_id,content_hash FROM (VALUES ${Prisma.join(textMedia)}) v(source_id,message_id,content_hash,text_complete,media_present))
            AND s.id=q."sourceId" AND s."workspaceId"=q."workspaceId" AND s."bindingRevision"=q."bindingRevision"
            AND c."sourceId"=s.id AND c."workspaceId"=s."workspaceId" AND c.enabled=true`);
      }
      let gap =
        staleRpc ||
        gating.transportGap ||
        Boolean(recovery && !eligible.has(recovery.sourceId));
      const sourceUpdates: Prisma.Sql[] = [];
      for (const source of eligible.values()) {
        const sourceEvents = events.filter(
          (event) => event.sourceId === source.id && gating.matches(event),
        );
        const coverageEvents = sourceEvents.map((event) =>
          contentGaps.has(source.id) ? { ...event, gap: true } : event,
        );
        const proof =
          recovery?.sourceId === source.id && gating.recoveryMatches
            ? { ...recovery, complete: recovery.complete && filtered === 0 }
            : undefined;
        if (!sourceEvents.length && !proof) continue;
        const checkpoint = leadCoverageUpdate(
          source,
          coverageEvents,
          changed.some((row) => row.event.sourceId === source.id),
          proof,
        );
        gap ||= checkpoint.gap;
        if (checkpoint.sql) sourceUpdates.push(checkpoint.sql);
      }
      if (sourceUpdates.length)
        await tx.$executeRaw(
          Prisma.sql`UPDATE "TelegramLeadSource" s SET "lastObservedAt"=v.observed,"channelPts"=v.pts,"coverageState"=v.state,"coverageFrom"=v.start,"coverageTo"=v.finish,"checkpointMessageId"=v.checkpoint,"updatedAt"=(NOW() AT TIME ZONE 'UTC') FROM (VALUES ${Prisma.join(sourceUpdates)}) v(id,observed,pts,state,start,finish,checkpoint) WHERE s.id=v.id AND s."workspaceId"=${workspaceId}`,
        );
      return {
        received: events.length,
        changed: changed.length,
        unchanged: events.length - filtered - changed.length,
        filtered,
        gap,
        ...(historyLease
          ? { historyFenceLost: staleRpc || gating.transportGap }
          : {}),
        ...(blockedSourceIds.length ? { blockedSourceIds } : {}),
      };
    });
  }
}
