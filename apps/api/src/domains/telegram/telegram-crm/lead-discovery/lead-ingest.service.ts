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
    );
  }
  async ingestBatch(
    userId: string,
    workspaceId: string,
    events: LeadIngestEvent[],
    allowPaused = false,
    recovery?: LeadRecoveryCheckpoint,
  ): Promise<LeadIngestResult> {
    const access = await this.policy.access(userId, 'manage');
    if (access.workspaceId !== workspaceId)
      throw new ForbiddenException('LEAD_WORKSPACE_MISMATCH');
    if (events.length > 100)
      throw new BadRequestException('LEAD_EVENT_BATCH_LIMIT');
    if (!events.length && !recovery)
      return { received: 0, changed: 0, unchanged: 0, filtered: 0, gap: false };
    return this.prisma.$transaction(async (tx) => {
      await acquirePostgresTransactionLock(tx, `lead-discovery:${workspaceId}`);
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
        if (!material.deleted && !/[\p{L}\p{N}]/u.test(text)) {
          filtered++;
          continue;
        }
        const previous = unique.get(
          `${source.id}:${material.externalMessageId}`,
        );
        if (
          previous &&
          previous.hash !== leadHash([text, publishedAt.toISOString()])
        )
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
          hash: leadHash([text, publishedAt.toISOString()]),
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
        ...(blockedSourceIds.length ? { blockedSourceIds } : {}),
      };
    });
  }
}
