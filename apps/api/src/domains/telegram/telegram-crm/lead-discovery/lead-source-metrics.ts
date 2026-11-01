import { leadQualificationSnapshotCurrent } from './lead-qualification-snapshot';
import { leadReferenceUnavailable } from './lead-source-reference';
import { Prisma, type TelegramLeadSource } from '@prisma/client';
import type {
  LeadSourceView,
  LeadSourceMetrics,
} from '@telegram-system/shared';
import { PrismaService } from '../../../../prisma/prisma.service';

const zeroMetrics = (): LeadSourceMetrics => ({
  observedPosts: 0,
  advertisements: 0,
  uniqueCandidates: 0,
  confirmedContacts: 0,
  confirmedLeads: 0,
  qualifiedLeads: 0,
  rejectedCandidates: 0,
  rejectedMaterials: 0,
});
export async function loadLeadSourceMetrics(
  prisma: PrismaService,
  workspaceId: string,
  ids: string[],
  qualification?: {
    enabled: boolean;
    policyVersion: string;
    policy: unknown;
    sourceIds: string[];
  },
) {
  if (!ids.length) return new Map<string, LeadSourceMetrics>();
  const rows = await prisma.$queryRaw<
    Array<
      LeadSourceMetrics & {
        sourceId: string;
        pendingPosts: number;
        recentAds: number;
        observedLastAdAt: Date | null;
      }
    >
  >(Prisma.sql`
      WITH scoped AS MATERIALIZED (
      SELECT o.id,o."sourceId",o."candidateId",COALESCE(o."editedAt",o."publishedAt") AS "effectiveAt",o."reviewStatus",o."processingStatus",o.classification->>'classification' AS ad_class
      FROM "TelegramLeadObservation" o WHERE o."workspaceId"=${workspaceId} AND o."sourceId" IN (${Prisma.join(ids)}) AND o."expiresAt">(NOW() AT TIME ZONE 'UTC')
    ), source_stats AS (
      SELECT "sourceId",COUNT(*)::int AS "observedPosts",
        COUNT(*) FILTER(WHERE (ad_class IS NULL OR ad_class NOT IN ('ADVERTISEMENT','MUTUAL_PROMOTION','ORGANIC_CONTENT') OR "processingStatus" IN ('UNKNOWN','FAILED','CLASSIFYING','EXTRACTING')) AND "effectiveAt">=(NOW() AT TIME ZONE 'UTC')-INTERVAL '30 days')::int AS "pendingPosts",
        COUNT(*) FILTER(WHERE ad_class='ADVERTISEMENT')::int AS advertisements,
        COUNT(*) FILTER(WHERE ad_class='ADVERTISEMENT' AND "effectiveAt">=(NOW() AT TIME ZONE 'UTC')-INTERVAL '30 days')::int AS "recentAds",
        MAX("effectiveAt") FILTER(WHERE ad_class='ADVERTISEMENT') AS "observedLastAdAt",
        COUNT(*) FILTER(WHERE "reviewStatus"='REJECTED')::int AS "rejectedMaterials"
      FROM scoped GROUP BY "sourceId"
    ), candidate_sources AS MATERIALIZED (
      SELECT DISTINCT "sourceId","candidateId" FROM scoped WHERE "candidateId" IS NOT NULL
    ), candidate_stats AS (
      SELECT sc."sourceId",COUNT(c.id)::int AS "uniqueCandidates",
        COUNT(c.id) FILTER(WHERE c."reviewStatus"='APPROVED' AND c."riskStatus"<>'REJECTED')::int AS "confirmedLeads",
        COUNT(c.id) FILTER(WHERE c."reviewStatus"='REJECTED')::int AS "rejectedCandidates",
        COUNT(c.id) FILTER(WHERE c."reviewStatus"='APPROVED' AND c."riskStatus" NOT IN('REJECTED','SUSPICIOUS') AND c."qualificationDecision"='QUALIFIED' AND q.status='READY' AND q."expiresAt">(NOW() AT TIME ZONE 'UTC') AND c."qualificationContextVersion"=q."contextVersion" AND c."qualificationReviewedAt">=q."createdAt" AND (q.score->>'riskLevel'<>'RISK_HIGH' OR c."riskAcknowledgedAt">=q."createdAt") AND ${qualification?.enabled ?? false} AND q."policyVersion"=${qualification?.policyVersion ?? 'disabled'} AND q."requestSnapshot"->'policy'=${JSON.stringify(qualification?.policy ?? null)}::jsonb
        AND NOT EXISTS(SELECT 1 FROM jsonb_array_elements(COALESCE(q."requestSnapshot"->'checks','[]'::jsonb)) ref WHERE ${qualification?.sourceIds.length ? Prisma.sql`NOT (ref->>'sourceId' IN (${Prisma.join(qualification.sourceIds)}))` : Prisma.sql`TRUE`})
        AND (c."contactId" IS NULL OR EXISTS(SELECT 1 FROM "TelegramAdvertiser" a WHERE a.id=c."contactId" AND a."workspaceId"=c."workspaceId" AND a."manualSalesStatus" IS DISTINCT FROM 'DO_NOT_CONTACT' AND a."manualSalesStatus" IS DISTINCT FROM 'CLOSED' AND a."archivedAt" IS NULL)) AND ${leadQualificationSnapshotCurrent})::int AS "qualifiedLeads"
      FROM candidate_sources sc JOIN "TelegramLeadCandidate" c ON c.id=sc."candidateId" AND c."workspaceId"=${workspaceId}
      LEFT JOIN LATERAL(SELECT * FROM "TelegramLeadQualification" q WHERE q."workspaceId"=c."workspaceId" AND q."candidateId"=c.id ORDER BY q."createdAt" DESC,q.id DESC LIMIT 1) q ON TRUE GROUP BY sc."sourceId"
    ), contact_stats AS (
      SELECT sc."sourceId",COUNT(DISTINCT ((contact.value->>'type')||':'||(contact.value->>'value'))) FILTER(WHERE contact.value->>'confirmed'='true' AND contact.value->>'role' IN ('ADVERTISER','SALES_CONTACT','AGENCY'))::int AS "confirmedContacts"
      FROM candidate_sources sc JOIN "TelegramLeadCandidate" c ON c.id=sc."candidateId" AND c."workspaceId"=${workspaceId}
      LEFT JOIN LATERAL jsonb_array_elements(c.contacts) contact(value) ON true GROUP BY sc."sourceId"
    ) SELECT s.*,COALESCE(c."uniqueCandidates",0)::int AS "uniqueCandidates",COALESCE(c."confirmedLeads",0)::int AS "confirmedLeads",COALESCE(c."rejectedCandidates",0)::int AS "rejectedCandidates",COALESCE(t."confirmedContacts",0)::int AS "confirmedContacts",COALESCE(c."qualifiedLeads",0)::int AS "qualifiedLeads"
    FROM source_stats s LEFT JOIN candidate_stats c ON c."sourceId"=s."sourceId" LEFT JOIN contact_stats t ON t."sourceId"=s."sourceId"
  `);
  return new Map(rows.map((row) => [row.sourceId, row]));
}
export function mapLeadSource(
  source: TelegramLeadSource,
  metrics: LeadSourceMetrics & {
    pendingPosts?: number;
    recentAds?: number;
    observedLastAdAt?: Date | null;
  } = zeroMetrics(),
): LeadSourceView {
  const lastAdAt =
    metrics.observedLastAdAt &&
    (!source.lastAdAt || metrics.observedLastAdAt > source.lastAdAt)
      ? metrics.observedLastAdAt
      : source.lastAdAt;
  const continuous30d =
    source.coverageState === 'CONTINUOUS' &&
    source.coverageFrom &&
    source.coverageTo &&
    source.coverageTo.getTime() - source.coverageFrom.getTime() >=
      30 * 86400000 &&
    Date.now() - source.coverageTo.getTime() < 300000;
  const sufficient =
    metrics.observedPosts >= 20 && (metrics.pendingPosts ?? 0) === 0;
  const status =
    source.monitoringState !== 'ACTIVE'
      ? source.monitoringState
      : continuous30d &&
          (metrics.pendingPosts ?? 0) === 0 &&
          (metrics.recentAds ?? 0) === 0 &&
          (!lastAdAt || lastAdAt.getTime() < Date.now() - 30 * 86400000)
        ? 'NO_ADS_30D'
        : !sufficient || !continuous30d
          ? 'INSUFFICIENT_COVERAGE'
          : metrics.confirmedLeads === 0
            ? 'LOW_YIELD'
            : 'ACTIVE';
  return {
    id: source.id,
    workspaceId: source.workspaceId,
    type: source.type as LeadSourceView['type'],
    normalizedKey: source.normalizedKey,
    channelId: source.channelId,
    username: source.username,
    title: source.title,
    url: leadReferenceUnavailable(source) ? null : source.url,
    accountId: source.accountId,
    accessType: source.accessType,
    addedVia: source.addedVia,
    processingReference: source.processingReference,
    allowOwnChannel: source.allowOwnChannel,
    monitoringState:
      source.monitoringState as LeadSourceView['monitoringState'],
    status: status as LeadSourceView['status'],
    createdAt: source.createdAt.toISOString(),
    lastObservedAt: source.lastObservedAt?.toISOString() ?? null,
    lastAdAt: lastAdAt?.toISOString() ?? null,
    coverageFrom: source.coverageFrom?.toISOString() ?? null,
    coverageTo: source.coverageTo?.toISOString() ?? null,
    coverageState: source.coverageState,
    lastErrorCode: source.lastErrorCode,
    metrics: {
      observedPosts: metrics.observedPosts,
      advertisements: metrics.advertisements,
      uniqueCandidates: metrics.uniqueCandidates,
      confirmedContacts: metrics.confirmedContacts,
      confirmedLeads: metrics.confirmedLeads,
      qualifiedLeads: metrics.qualifiedLeads ?? 0,
      rejectedCandidates: metrics.rejectedCandidates,
      rejectedMaterials: metrics.rejectedMaterials,
    },
    priority: sufficient
      ? Math.round(
          (100 * metrics.confirmedLeads) / Math.max(1, metrics.observedPosts),
        )
      : null,
    priorityStatus: sufficient ? 'RANKED' : 'INSUFFICIENT_DATA',
  };
}

/** Derived status filtering happens before pagination, in one workspace-scoped aggregate. */
export async function filteredLeadSourceIds(
  prisma: PrismaService,
  workspaceId: string,
  status: string,
  limit: number,
  cursor?: string,
  search?: string,
) {
  return prisma.$queryRaw<Array<{ id: string }>>(Prisma.sql`
    WITH scoped AS MATERIALIZED (
      SELECT o."sourceId",o."candidateId",o."processingStatus",o.classification->>'classification' AS ad_class,COALESCE(o."editedAt",o."publishedAt") AS "effectiveAt" FROM "TelegramLeadObservation" o WHERE o."workspaceId"=${workspaceId} AND o."expiresAt">(NOW() AT TIME ZONE 'UTC')
    ), observation_stats AS (
      SELECT "sourceId",COUNT(*)::int observed,
        COUNT(*) FILTER(WHERE (ad_class IS NULL OR ad_class NOT IN ('ADVERTISEMENT','MUTUAL_PROMOTION','ORGANIC_CONTENT') OR "processingStatus" IN ('UNKNOWN','FAILED','CLASSIFYING','EXTRACTING')) AND "effectiveAt">=(NOW() AT TIME ZONE 'UTC')-INTERVAL '30 days')::int pending,
        COUNT(*) FILTER(WHERE ad_class='ADVERTISEMENT' AND "effectiveAt">=(NOW() AT TIME ZONE 'UTC')-INTERVAL '30 days')::int recent_ads
      FROM scoped GROUP BY "sourceId"
    ), candidate_sources AS MATERIALIZED (SELECT DISTINCT "sourceId","candidateId" FROM scoped WHERE "candidateId" IS NOT NULL), confirmed AS (
      SELECT sc."sourceId",COUNT(c.id) FILTER(WHERE c."reviewStatus"='APPROVED' AND c."riskStatus"<>'REJECTED')::int confirmed FROM candidate_sources sc JOIN "TelegramLeadCandidate" c ON c.id=sc."candidateId" AND c."workspaceId"=${workspaceId} GROUP BY sc."sourceId"
    ), metrics AS (SELECT o.*,COALESCE(c.confirmed,0) confirmed FROM observation_stats o LEFT JOIN confirmed c ON c."sourceId"=o."sourceId"
    ), status_rows AS (
      SELECT s.id,s.title,CASE WHEN s."monitoringState"<>'ACTIVE' THEN s."monitoringState"
        WHEN s."coverageState"='CONTINUOUS' AND s."coverageFrom" IS NOT NULL AND s."coverageTo">=s."coverageFrom"+INTERVAL '30 days' AND s."coverageTo">(NOW() AT TIME ZONE 'UTC')-INTERVAL '5 minutes' AND (s."lastAdAt" IS NULL OR s."lastAdAt"<(NOW() AT TIME ZONE 'UTC')-INTERVAL '30 days') AND COALESCE(m.pending,0)=0 AND COALESCE(m.recent_ads,0)=0 THEN 'NO_ADS_30D'
        WHEN COALESCE(m.observed,0)<20 OR COALESCE(m.pending,0)>0 OR s."coverageState"<>'CONTINUOUS' OR s."coverageFrom" IS NULL OR s."coverageTo" IS NULL OR s."coverageTo"<s."coverageFrom"+INTERVAL '30 days' OR s."coverageTo"<=(NOW() AT TIME ZONE 'UTC')-INTERVAL '5 minutes' THEN 'INSUFFICIENT_COVERAGE'
        WHEN COALESCE(m.confirmed,0)=0 THEN 'LOW_YIELD' ELSE 'ACTIVE' END status
      FROM "TelegramLeadSource" s LEFT JOIN metrics m ON m."sourceId"=s.id WHERE s."workspaceId"=${workspaceId}
    ) SELECT id FROM status_rows WHERE status=${status}
      ${cursor ? Prisma.sql`AND id<${cursor}` : Prisma.empty}
      ${search ? Prisma.sql`AND POSITION(LOWER(${search.slice(0, 100)}) IN LOWER(title))>0` : Prisma.empty}
      ORDER BY id DESC LIMIT ${limit + 1}
  `);
}
