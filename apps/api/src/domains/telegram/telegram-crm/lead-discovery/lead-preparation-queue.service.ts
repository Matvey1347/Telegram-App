import { leadHumanQualificationFresh } from './lead-preparation-state';
import { leadQualificationSnapshotCurrent } from './lead-qualification-snapshot';
import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type {
  LeadPreparationQueueInput,
  LeadQualificationView,
  LeadPreparationSummary,
} from '@telegram-system/shared';
import { WorkspaceAuthorizationService } from '../../../workspace/workspace-authorization/workspace-authorization.service';
import { TelegramCrmLegacyAuthorizationService } from '../telegram-crm-legacy-authorization.service';
import { TelegramLeadPreparationContext } from './lead-preparation-context.service';
import { leadCandidateSummary } from './lead-candidate-presentation';
import { leadCursor, decodeLeadCursor } from './lead-normalization';
@Injectable()
export class TelegramLeadPreparationQueueService {
  constructor(
    private readonly context: TelegramLeadPreparationContext,
    private readonly authorization: WorkspaceAuthorizationService,
    private readonly crm: TelegramCrmLegacyAuthorizationService,
  ) {}
  async linked(userId: string, contactId: string) {
    await this.crm.requireReadContact(userId, contactId);
    return this.page(userId, { limit: 10 }, contactId);
  }
  async list(userId: string, input: LeadPreparationQueueInput) {
    return this.page(userId, input);
  }
  private async page(
    userId: string,
    input: LeadPreparationQueueInput,
    contactId?: string,
  ) {
    const { workspaceId } = await this.context.policy.access(userId),
      limit = Math.min(50, Math.max(1, input.limit ?? 25)),
      cursor = decodeLeadCursor(input.cursor);
    const hasCrmScope =
      (await this.authorization.can(userId, 'adSales.crm.viewOwn')) ||
      (await this.authorization.can(userId, 'adSales.crm.viewAny'));
    const scope = hasCrmScope
      ? await this.authorization.scope(
          userId,
          'adSales.crm.viewOwn',
          'adSales.crm.viewAny',
        )
      : {};
    const own = 'assignedMemberId' in scope ? scope.assignedMemberId : null;
    // Exact runtime source grants are checked once for the bounded workspace registry, never per row.
    const eligibleIds = this.context.enabled()
      ? await this.context.eligibleSources(workspaceId)
      : [];
    const validSources = eligibleIds.length
      ? Prisma.sql`o."sourceId" IN (${Prisma.join(eligibleIds)})`
      : Prisma.sql`FALSE`;
    const rows = await this.context.prisma.$queryRaw<
      Array<{ id: string; workflow: string; fresh: boolean; total: bigint }>
    >(Prisma.sql`
   WITH current_candidates AS (
    SELECT c.id,
     CASE WHEN c.risks ?| ARRAY['UNRESOLVED_PROJECT','IMAGE_EVIDENCE_UNVERIFIED'] THEN 'TARGET_UNRESOLVED'
       WHEN EXISTS (SELECT 1 FROM jsonb_array_elements(c.contacts) x WHERE x->>'type'<>'WEBSITE' AND NOT (x->>'type'='TELEGRAM' AND x->>'value' ~* 'bot$') AND x->>'role'='SALES_CONTACT' AND x->>'purpose' IN ('CONTACT_FOR_ADS','PROJECT_CONTACT') AND length(btrim(COALESCE(x->>'evidence','')))>0) THEN 'BUSINESS_CONTACT_FOUND'
       WHEN EXISTS (SELECT 1 FROM jsonb_array_elements(c.contacts) x WHERE x->>'role'='ADVERTISED_DESTINATION') THEN 'CONTACT_POINT_ONLY'
       ELSE 'CONTACT_NOT_FOUND' END AS contact_category,
     (q.id IS NOT NULL AND q.status='READY' AND q."expiresAt">(NOW() AT TIME ZONE 'UTC') AND q."policyVersion"=${this.context.scorePolicy().version} AND q."requestSnapshot"->'policy'=${JSON.stringify(this.context.scorePolicy())}::jsonb AND ${this.context.enabled()}
      AND ${leadQualificationSnapshotCurrent}
      AND NOT EXISTS(SELECT 1 FROM jsonb_array_elements(COALESCE(q."requestSnapshot"->'checks','[]'::jsonb)) ref LEFT JOIN "TelegramLeadObservation" o ON o.id=ref->>'id' AND o."workspaceId"=c."workspaceId" WHERE NOT(${validSources}))
      AND (a.id IS NULL OR a."manualSalesStatus" IS DISTINCT FROM 'DO_NOT_CONTACT' AND a."manualSalesStatus" IS DISTINCT FROM 'CLOSED' AND a."archivedAt" IS NULL)) AS fresh,
     c."contactId",c."reviewStatus",c."riskStatus",c."qualificationDecision",c."qualificationContextVersion",q."contextVersion",q.score,q.id AS qualification_id,q."createdAt" AS qualification_created,c."qualificationReviewedAt",c."riskAcknowledgedAt"
    FROM "TelegramLeadCandidate" c
    LEFT JOIN "TelegramAdvertiser" a ON a.id=c."contactId" AND a."workspaceId"=c."workspaceId"
    LEFT JOIN LATERAL(SELECT * FROM "TelegramLeadQualification" q WHERE q."candidateId"=c.id AND q."workspaceId"=c."workspaceId" ORDER BY q."createdAt" DESC,q.id DESC LIMIT 1) q ON TRUE
    WHERE c."workspaceId"=${workspaceId} AND c."reviewStatus"<>'MERGED' AND c."expiresAt">(NOW() AT TIME ZONE 'UTC')
     ${contactId ? Prisma.sql`AND c."contactId"=${contactId}` : Prisma.empty}
     ${!hasCrmScope ? Prisma.sql`AND c."contactId" IS NULL` : own ? Prisma.sql`AND (c."contactId" IS NULL OR a."ownerMemberId"=${own})` : Prisma.empty}
     ${input.search ? Prisma.sql`AND c.title ILIKE ${`%${input.search.slice(0, 100)}%`}` : Prisma.empty}
   ), states AS(SELECT *,CASE WHEN "reviewStatus"='REJECTED' OR "riskStatus"='REJECTED' THEN 'REJECTED' WHEN "contactId" IS NOT NULL THEN 'LINKED' WHEN "riskStatus"='SUSPICIOUS' OR fresh AND score->>'riskLevel'='RISK_HIGH' THEN 'SUSPICIOUS' WHEN fresh AND "qualificationReviewedAt">=qualification_created AND (score->>'riskLevel'<>'RISK_HIGH' OR "riskAcknowledgedAt">=qualification_created) AND "qualificationContextVersion"="contextVersion" AND "reviewStatus"='APPROVED' AND "qualificationDecision" IN('QUALIFIED','LOW_RELEVANCE') THEN "qualificationDecision" WHEN qualification_id IS NOT NULL OR "reviewStatus"='APPROVED' THEN 'NEEDS_REVIEW' ELSE 'NEW' END AS workflow FROM current_candidates)
   , matching AS (SELECT *, count(*) OVER() AS total FROM states WHERE TRUE ${input.workflow === 'HIGH_PRIORITY' ? Prisma.sql`AND fresh AND score->>'priority'='HIGH' AND workflow='QUALIFIED'` : input.workflow ? Prisma.sql`AND workflow=${input.workflow}` : Prisma.empty} ${input.contactCategory ? Prisma.sql`AND contact_category=${input.contactCategory}` : Prisma.empty})
   SELECT id,workflow,fresh,total FROM matching WHERE TRUE ${cursor ? Prisma.sql`AND id<${cursor}` : Prisma.empty} ORDER BY id DESC LIMIT ${limit + 1}`);
    const ids = rows.slice(0, limit).map((row) => row.id);
    const candidates = ids.length
      ? await this.context.prisma.telegramLeadCandidate.findMany({
          where: { workspaceId, id: { in: ids } },
          include: {
            qualifications: {
              orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
              take: 1,
            },
            observations: {
              orderBy: { observedAt: 'desc' },
              take: 1,
              include: {
                source: { select: { id: true, title: true, url: true } },
              },
            },
            preparedDrafts: {
              where: {
                authorUserId: userId,
                status: 'APPROVED',
                expiresAt: { gt: new Date() },
              },
              select: { contextVersion: true, approvedAt: true },
              take: 1,
            },
          },
          orderBy: { id: 'desc' },
        })
      : [];
    return {
      total: Number(rows[0]?.total ?? 0),
      items: candidates.map((candidate) => {
        const item = rows.find((row) => row.id === candidate.id)!,
          q = candidate.qualifications[0];
        const summary: LeadPreparationSummary = {
          workflowState:
            item.workflow as LeadPreparationSummary['workflowState'],
          qualification: q
            ? {
                id: q.id,
                status: item.fresh
                  ? 'READY'
                  : q.status === 'READY'
                    ? 'STALE'
                    : (q.status as LeadQualificationView['status']),
                policyVersion: q.policyVersion,
                score: q.score as unknown as LeadQualificationView['score'],
              }
            : null,
          hasApprovedDraft: Boolean(
            item.fresh &&
            q?.status === 'READY' &&
            leadHumanQualificationFresh(candidate, q) &&
            candidate.preparedDrafts.some(
              (draft) =>
                draft.contextVersion === q?.contextVersion &&
                draft.approvedAt &&
                candidate.qualificationReviewedAt &&
                draft.approvedAt >= candidate.qualificationReviewedAt &&
                draft.approvedAt >= q.createdAt,
            ),
          ),
        };
        return { ...leadCandidateSummary(candidate), preparation: summary };
      }),
      hasMore: rows.length > limit,
      nextCursor: rows.length > limit ? leadCursor(ids.at(-1)!) : null,
    };
  }
}
