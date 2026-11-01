import { loadLeadCandidate } from './lead-candidate-read';
import { leadCandidate } from './lead.spec-fixtures';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../../prisma/prisma.service';
import { TelegramLeadPolicy } from './lead-policy.service';
import { TelegramLeadReadService } from './lead-read.service';
import {
  mapLeadSource,
  filteredLeadSourceIds,
  loadLeadSourceMetrics,
} from './lead-source-metrics';
import { leadFeedCursor, decodeLeadFeedCursor } from './lead-normalization';
import { leadSource, leadObservation } from './lead.spec-fixtures';
const metrics = {
  observedPosts: 100,
  advertisements: 0,
  uniqueCandidates: 0,
  confirmedContacts: 0,
  confirmedLeads: 0,
  qualifiedLeads: 0,
  rejectedCandidates: 0,
  rejectedMaterials: 0,
};
describe('Lead bounded source and material read models', () => {
  it('never reports no ads from connection age, gaps, stale checkpoints or UNKNOWN backlog', () => {
    const now = new Date(),
      source = leadSource({
        coverageState: 'CONTINUOUS',
        coverageFrom: new Date(now.getTime() - 31 * 86400000),
        coverageTo: now,
      });
    expect(mapLeadSource(source, { ...metrics, pendingPosts: 0 }).status).toBe(
      'NO_ADS_30D',
    );
    expect(mapLeadSource(source, { ...metrics, pendingPosts: 1 }).status).toBe(
      'INSUFFICIENT_COVERAGE',
    );
    expect(
      mapLeadSource({ ...source, coverageState: 'GAPPED' }, metrics).status,
    ).toBe('INSUFFICIENT_COVERAGE');
    expect(
      mapLeadSource(
        { ...source, coverageTo: new Date(now.getTime() - 86400000) },
        metrics,
      ).status,
    ).toBe('INSUFFICIENT_COVERAGE');
    expect(
      mapLeadSource({ ...source, coverageFrom: null }, metrics).status,
    ).toBe('INSUFFICIENT_COVERAGE');
    expect(
      mapLeadSource(source, { ...metrics, recentAds: 1, observedLastAdAt: now })
        .status,
    ).not.toBe('NO_ADS_30D');
    expect(
      mapLeadSource(source, { ...metrics, recentAds: 1, observedLastAdAt: now })
        .lastAdAt,
    ).toBe(now.toISOString());
    expect(mapLeadSource(source, metrics).metrics.qualifiedLeads).toBe(0);
    expect(
      mapLeadSource(source, { ...metrics, pendingPosts: 1 }).metrics,
    ).not.toHaveProperty('pendingPosts');
  });
  it('suppresses username source links once their immutable identity becomes unverified', () => {
    const source = leadSource({
      url: 'https://t.me/previous_name',
      lastErrorCode: 'LEAD_SOURCE_IDENTITY_CHANGED',
    });
    expect(mapLeadSource(source, metrics).url).toBeNull();
  });
  it('expands contact arrays once per distinct source/candidate and compares UTC timestamps', async () => {
    const query = jest.fn((input: Prisma.Sql) => {
      expect(input).toBeDefined();
      return Promise.resolve([]);
    });
    await loadLeadSourceMetrics(
      { $queryRaw: query } as unknown as PrismaService,
      'workspace',
      ['source'],
    );
    const sql = query.mock.calls[0][0].sql;
    expect(sql).toContain(
      'SELECT DISTINCT "sourceId","candidateId" FROM scoped',
    );
    expect(sql).toContain('FROM candidate_sources sc JOIN');
    expect(sql.indexOf('candidate_sources AS')).toBeLessThan(
      sql.indexOf('jsonb_array_elements'),
    );
    expect(sql).toContain("AT TIME ZONE 'UTC'");
    expect(sql).not.toContain('o.text');
    expect(sql).toContain('COALESCE(o."editedAt",o."publishedAt")');
    expect(sql).toContain("'UNKNOWN','FAILED','CLASSIFYING','EXTRACTING'");
  });
  it('filters derived source status before cursor pagination with a workspace-scoped SQL aggregate', async () => {
    const query = jest
      .fn<Promise<Array<{ id: string }>>, [Prisma.Sql]>()
      .mockResolvedValue([]);
    await filteredLeadSourceIds(
      { $queryRaw: query } as unknown as PrismaService,
      'workspace',
      'LOW_YIELD',
      25,
      'cursor',
      'search',
    );
    const sql = query.mock.calls[0][0];
    expect(sql.sql.indexOf('WHERE status=')).toBeLessThan(
      sql.sql.indexOf('LIMIT'),
    );
    expect(sql.sql).toContain('ad_class NOT IN');
    expect(sql.sql).toContain("AT TIME ZONE 'UTC'");
    expect(sql.values).toContain('workspace');
    expect(sql.values).toContain('cursor');
    expect(sql.values).toContain(26);
  });
  it('applies ACTIVE as a derived status before page limit rather than raw monitoring state', async () => {
    const prisma = {
        $queryRaw: jest.fn((query: Prisma.Sql) =>
          Promise.resolve(query.values.includes('ACTIVE') ? [] : []),
        ),
      },
      policy = {
        access: jest.fn().mockResolvedValue({ workspaceId: 'workspace' }),
      },
      service = new TelegramLeadReadService(
        prisma as unknown as PrismaService,
        policy as unknown as TelegramLeadPolicy,
      );
    expect(
      await service.sources('user', { status: 'ACTIVE', limit: 10 }),
    ).toEqual({ items: [], hasMore: false, nextCursor: null });
    expect(prisma.$queryRaw).toHaveBeenCalledTimes(1);
    const sql = prisma.$queryRaw.mock.calls[0][0];
    expect(sql.sql).toContain('WHERE status=');
    expect(sql.values).toContain('ACTIVE');
  });
  it('retains compact confirmed source attribution after material expiry without text duplication', async () => {
    const candidate = leadCandidate({ sourceIds: ['source-a', 'source-b'] }),
      prisma = {
        telegramLeadCandidate: {
          findFirst: jest
            .fn()
            .mockResolvedValue({ ...candidate, observations: [] }),
          findMany: jest.fn().mockResolvedValue([]),
        },
        telegramLeadSource: {
          findMany: jest.fn().mockResolvedValue([
            { id: 'source-a', title: 'A', url: null },
            { id: 'source-b', title: 'B', url: null },
          ]),
        },
      };
    const observations: TelegramLeadReadService['observations'] = () =>
      Promise.resolve([]);
    const result = await loadLeadCandidate(
      prisma as unknown as PrismaService,
      'workspace',
      'candidate',
      observations,
    );
    expect(result.sources.map((source) => source.id)).toEqual([
      'source-a',
      'source-b',
    ]);
    expect(result.observations).toEqual([]);
    expect(prisma.telegramLeadSource.findMany).toHaveBeenCalledTimes(1);
  });
  it('uses an opaque observedAt/id tie cursor rather than random UUID chronology', () => {
    const timestamp = new Date('2026-10-31T10:00:00.000Z'),
      id = 'random_uuid_B';
    expect(
      decodeLeadFeedCursor(leadFeedCursor({ id, observedAt: timestamp })),
    ).toEqual({ id, observedAt: timestamp });
    expect(() => decodeLeadFeedCursor('invalid-cursor')).toThrow(
      'LEAD_CURSOR_INVALID',
    );
  });
  it('projects source access loss/deletion honestly and resolves uncertain receipts in one batch without writes', async () => {
    const observation = leadObservation({
      processingStatus: 'CLASSIFYING',
      processingStartedAt: new Date(Date.now() - 180000),
      classificationOperationId: 'dated-operation',
    });
    const receipt = {
      id: 'ledger',
      operationId: 'dated-operation',
      workspaceId: 'workspace',
      businessObjectId: observation.id,
      category: 'LEAD_AD_CLASSIFICATION',
      provider: 'openai',
      model: 'gpt-6-luna',
      providerModel: null,
      createdAt: new Date(),
      finishedAt: null,
      status: 'UNKNOWN',
      pricingStatus: 'UNKNOWN',
      actualCost: null,
      reservedCost: new Prisma.Decimal('.001'),
      durationMs: null,
      errorCategory: 'TIMEOUT',
      pricingVersion: 'verified',
      pricingEffectiveAt: new Date(),
      inputTokens: null,
      outputTokens: null,
      cachedInputTokens: null,
      cacheWriteTokens: null,
      reasoningTokens: null,
      totalTokens: null,
      deadlineAt: new Date(0),
    };
    const prisma = {
        aiOperation: { findMany: jest.fn().mockResolvedValue([receipt]) },
      },
      policy = {};
    const service = new TelegramLeadReadService(
      prisma as unknown as PrismaService,
      policy as TelegramLeadPolicy,
    );
    const views = await service.observations([
      {
        ...observation,
        source: {
          id: 'source',
          title: 'Source',
          url: null,
          monitoringState: 'ACCESS_LOST',
          lastErrorCode: null,
        },
      },
      {
        ...observation,
        id: 'deleted',
        originalStatus: 'DELETED',
        source: {
          id: 'source',
          title: 'Source',
          url: null,
          monitoringState: 'ACCESS_LOST',
          lastErrorCode: null,
        },
      },
    ]);
    expect(views[0]).toMatchObject({
      originalStatus: 'ACCESS_LOST',
      processingStatus: 'UNKNOWN',
      classificationOperation: { id: 'ledger', reservedCost: '0.001000000000' },
    });
    expect(views[1].originalStatus).toBe('DELETED');
    expect(prisma.aiOperation.findMany).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(views)).not.toContain('actorUserId');
  });
});
