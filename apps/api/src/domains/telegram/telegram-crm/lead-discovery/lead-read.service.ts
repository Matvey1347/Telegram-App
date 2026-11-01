import { TelegramLeadPreparationContext } from './lead-preparation-context.service';
import {
  leadIdentityUnverified,
  leadReferenceUnavailable,
} from './lead-source-reference';
import {
  loadLeadCandidate,
  loadLeadCandidatePage,
  loadLeadCandidateSummaries,
} from './lead-candidate-read';
import { Injectable, NotFoundException, Optional } from '@nestjs/common';
import { Prisma, type TelegramLeadSource } from '@prisma/client';
import type {
  LeadSourceMetrics,
  LeadSourceListFilter,
  LeadFeedFilter,
  LeadCandidateListFilter,
  LeadObservationView,
} from '@telegram-system/shared';
import { PrismaService } from '../../../../prisma/prisma.service';
import {
  mapAiOperationView,
  aiOperationPresentationSelect,
} from '../../../operations/ai/ai-operation-presentation';
import { TelegramLeadPolicy } from './lead-policy.service';
import {
  loadLeadSourceMetrics,
  mapLeadSource,
  filteredLeadSourceIds,
} from './lead-source-metrics';
import {
  decodeLeadCursor,
  leadCursor,
  leadLimit,
  decodeLeadFeedCursor,
  leadFeedCursor,
} from './lead-normalization';
const observationInclude = {
  source: {
    select: {
      title: true,
      id: true,
      url: true,
      monitoringState: true,
      lastErrorCode: true,
    },
  },
} satisfies Prisma.TelegramLeadObservationInclude;
type ObservationRow = Prisma.TelegramLeadObservationGetPayload<{
  include: typeof observationInclude;
}>;
@Injectable()
export class TelegramLeadReadService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly policy: TelegramLeadPolicy,
    @Optional() private readonly preparation?: TelegramLeadPreparationContext,
  ) {}
  async metrics(workspaceId: string, ids: string[]) {
    const qualification =
      this.preparation && ids.length
        ? {
            enabled: this.preparation.enabled(),
            policyVersion: this.preparation.scorePolicy().version,
            policy: this.preparation.scorePolicy(),
            sourceIds: this.preparation.enabled()
              ? await this.preparation.eligibleSources(workspaceId)
              : [],
          }
        : undefined;
    return loadLeadSourceMetrics(this.prisma, workspaceId, ids, qualification);
  }
  mapSource(source: TelegramLeadSource, metrics?: LeadSourceMetrics) {
    return mapLeadSource(source, metrics);
  }
  async source(userId: string, id: string) {
    const row = await this.policy.source(userId, id);
    return this.mapSource(
      row,
      (await this.metrics(row.workspaceId, [id])).get(id),
    );
  }
  async sources(userId: string, filter: LeadSourceListFilter = {}) {
    const access = await this.policy.access(userId),
      limit = leadLimit(filter.limit),
      cursor = decodeLeadCursor(filter.cursor);
    if (
      filter.status &&
      ['ACTIVE', 'LOW_YIELD', 'NO_ADS_30D', 'INSUFFICIENT_COVERAGE'].includes(
        filter.status,
      )
    ) {
      const ids = await filteredLeadSourceIds(
        this.prisma,
        access.workspaceId,
        filter.status,
        limit,
        cursor,
        filter.search,
      );
      const pageIds = ids.slice(0, limit).map((row) => row.id);
      const rows = pageIds.length
        ? await this.prisma.telegramLeadSource.findMany({
            where: { workspaceId: access.workspaceId, id: { in: pageIds } },
            orderBy: { id: 'desc' },
          })
        : [];
      const metrics = await this.metrics(access.workspaceId, pageIds);
      return {
        items: rows.map((row) => this.mapSource(row, metrics.get(row.id))),
        hasMore: ids.length > limit,
        nextCursor: ids.length > limit ? leadCursor(pageIds.at(-1)!) : null,
      };
    }
    const rows = await this.prisma.telegramLeadSource.findMany({
      where: {
        workspaceId: access.workspaceId,
        ...(cursor ? { id: { lt: cursor } } : {}),
        ...(filter.search
          ? {
              title: {
                contains: filter.search.slice(0, 100),
                mode: 'insensitive',
              },
            }
          : {}),
        ...(filter.status &&
        ['ACTIVE', 'PAUSED', 'DISABLED', 'ACCESS_LOST'].includes(filter.status)
          ? { monitoringState: filter.status }
          : {}),
      },
      orderBy: { id: 'desc' },
      take: limit + 1,
    });
    const page = rows.slice(0, limit),
      metrics = await this.metrics(
        access.workspaceId,
        page.map((row) => row.id),
      );
    return {
      items: page.map((row) => this.mapSource(row, metrics.get(row.id))),
      hasMore: rows.length > limit,
      nextCursor: rows.length > limit ? leadCursor(page.at(-1)!.id) : null,
    };
  }
  async observations(rows: ObservationRow[]): Promise<LeadObservationView[]> {
    if (!rows.length) return [];
    const ids = [
      ...new Set(
        rows.flatMap((row) =>
          [row.classificationOperationDbId, row.extractionOperationDbId].filter(
            (id): id is string => Boolean(id),
          ),
        ),
      ),
    ];
    const operationIds = [
      ...new Set(
        rows.flatMap((row) =>
          [row.classificationOperationId, row.extractionOperationId].filter(
            (id): id is string => Boolean(id),
          ),
        ),
      ),
    ];
    const operations =
      ids.length || operationIds.length
        ? await this.prisma.aiOperation.findMany({
            select: aiOperationPresentationSelect,
            where: {
              workspaceId: rows[0].workspaceId,
              OR: [
                ...(ids.length ? [{ id: { in: ids } }] : []),
                ...(operationIds.length
                  ? [
                      {
                        operationId: { in: operationIds },
                        businessObjectId: { in: rows.map((row) => row.id) },
                      },
                    ]
                  : []),
              ],
            },
          })
        : [];
    const operation = (
      row: ObservationRow,
      stage: 'classification' | 'extraction',
    ) => {
      const id =
        stage === 'classification'
          ? row.classificationOperationDbId
          : row.extractionOperationDbId;
      const operationId =
        stage === 'classification'
          ? row.classificationOperationId
          : row.extractionOperationId;
      const found = operations.find(
        (op) =>
          op.id === id ||
          (op.operationId === operationId && op.businessObjectId === row.id),
      );
      return found ? mapAiOperationView(found) : null;
    };
    return rows.map((row) => ({
      id: row.id,
      sourceId: row.sourceId,
      sourceTitle: row.source.title,
      externalMessageId: row.externalMessageId,
      messageUrl: leadReferenceUnavailable(row.source) ? null : row.messageUrl,
      publishedAt: row.publishedAt.toISOString(),
      observedAt: row.observedAt.toISOString(),
      expiresAt: row.expiresAt.toISOString(),
      text: row.text,
      links: row.links as unknown as string[],
      contentHash: row.contentHash,
      originalStatus:
        row.originalStatus === 'DELETED'
          ? 'DELETED'
          : leadIdentityUnverified(row.source)
            ? 'UNKNOWN'
            : row.source.monitoringState === 'ACCESS_LOST'
              ? 'ACCESS_LOST'
              : (row.originalStatus as LeadObservationView['originalStatus']),
      processingStatus:
        ['CLASSIFYING', 'EXTRACTING'].includes(row.processingStatus) &&
        row.processingStartedAt &&
        Date.now() - row.processingStartedAt.getTime() > 120000
          ? 'UNKNOWN'
          : row.processingStatus,
      classificationVersion: row.classificationVersion,
      classification:
        row.classification as unknown as LeadObservationView['classification'],
      extraction:
        row.extraction as unknown as LeadObservationView['extraction'],
      candidateId: row.candidateId,
      reviewStatus: row.reviewStatus as LeadObservationView['reviewStatus'],
      classificationOperation: operation(row, 'classification'),
      extractionOperation: operation(row, 'extraction'),
    }));
  }
  async observation(userId: string, id: string) {
    const access = await this.policy.access(userId);
    const row = await this.prisma.telegramLeadObservation.findFirst({
      where: { id, workspaceId: access.workspaceId },
      include: observationInclude,
    });
    if (!row) throw new NotFoundException('LEAD_OBSERVATION_NOT_FOUND');
    return (await this.observations([row]))[0];
  }
  async feed(userId: string, filter: LeadFeedFilter = {}) {
    const access = await this.policy.access(userId),
      limit = leadLimit(filter.limit),
      cursor = decodeLeadFeedCursor(filter.cursor);
    const where: Prisma.TelegramLeadObservationWhereInput = {
      workspaceId: access.workspaceId,
      ...(cursor
        ? {
            OR: [
              { observedAt: { lt: cursor.observedAt } },
              { observedAt: cursor.observedAt, id: { lt: cursor.id } },
            ],
          }
        : {}),
      ...(filter.sourceId ? { sourceId: filter.sourceId } : {}),
      ...(filter.reviewStatus ? { reviewStatus: filter.reviewStatus } : {}),
      ...(filter.riskStatus
        ? { candidate: { riskStatus: filter.riskStatus } }
        : {}),
      ...(filter.classification
        ? {
            classification: {
              path: ['classification'],
              equals: filter.classification,
            },
          }
        : {}),
    };
    const rows = await this.prisma.telegramLeadObservation.findMany({
      where,
      include: observationInclude,
      orderBy: [{ observedAt: 'desc' }, { id: 'desc' }],
      take: limit + 1,
    });
    return {
      items: await this.observations(rows.slice(0, limit)),
      hasMore: rows.length > limit,
      nextCursor: rows.length > limit ? leadFeedCursor(rows[limit - 1]) : null,
    };
  }
  async candidate(userId: string, id: string) {
    const { workspaceId } = await this.policy.access(userId);
    return loadLeadCandidate(this.prisma, workspaceId, id, (rows) =>
      this.observations(rows),
    );
  }
  async candidates(userId: string, filter: LeadCandidateListFilter = {}) {
    const { workspaceId } = await this.policy.access(userId);
    return loadLeadCandidatePage(this.prisma, workspaceId, filter);
  }
  async candidateSummaries(userId: string, ids: string[]) {
    const { workspaceId } = await this.policy.access(userId);
    return loadLeadCandidateSummaries(this.prisma, workspaceId, ids);
  }
}
