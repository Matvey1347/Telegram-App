import { ForbiddenException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AiUsageReadService } from './ai-usage-read.service';
import {
  decodeOperationCursor,
  usageRange,
  usageTotals,
} from './ai-usage-read.helpers';
import { usageAggregateQuery } from './ai-usage-aggregate';
import { usageBudgets } from './ai-usage-budget';

const now = new Date('2026-10-31T23:59:00Z');
function setup() {
  const prisma = {
    $queryRaw: jest.fn().mockResolvedValue([]),
    aiWorkspaceConfig: { findUnique: jest.fn().mockResolvedValue(null) },
    aiCategoryConfig: { findUnique: jest.fn().mockResolvedValue(null) },
    aiBudgetPeriod: { findMany: jest.fn().mockResolvedValue([]) },
  };
  const auth = {
    require: jest.fn().mockResolvedValue({ workspaceId: 'workspace-a' }),
  };
  const registry = { models: () => [{ modelId: 'allowed-model' }] };
  return {
    prisma,
    auth,
    service: new AiUsageReadService(
      prisma as never,
      auth as never,
      registry as never,
    ),
  };
}
describe('AI usage read model', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(now);
  });
  afterEach(() => jest.useRealTimers());
  it('requires permission and prevents requested workspace crossover before DB queries', async () => {
    const { service, prisma, auth } = setup();
    await expect(
      service.dashboard('actor', { workspaceId: 'other' }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(auth.require).toHaveBeenCalledWith(
      'actor',
      'operations.viewAiUsage',
    );
    expect(prisma.$queryRaw).not.toHaveBeenCalled();
    auth.require.mockRejectedValue(new ForbiddenException());
    await expect(service.operations('actor', {})).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });
  it('validates real dates, retention, future dates and inclusive UTC boundaries', () => {
    expect(
      usageRange(
        { from: '2026-10-01', to: '2026-10-31' },
        now,
      ).end.toISOString(),
    ).toBe('2026-11-01T00:00:00.000Z');
    for (const query of [
      { from: '2026-02-30' },
      { to: '2026-11-01' },
      { from: '2026-01-01' },
      { from: '2026-10-31', to: '2026-10-30' },
    ])
      expect(() => usageRange(query, now)).toThrow();
    expect(usageRange({}, now).from.toISOString()).toBe(
      '2026-10-02T00:00:00.000Z',
    );
  });
  it('does not invent exact zero averages for unpriced usage and preserves decimal/token precision', () => {
    expect(usageTotals().averageKnownCost).toBeNull();
    const result = usageTotals({
      knownCost: '0.000000000003',
      pricedRequests: 2,
      unpricedRequests: 5,
      inputTokens: 9007199254740993n,
    } as never);
    expect(result.knownCost).toBe('0.000000000003');
    expect(result.averageKnownCost).toBe('0.000000000002');
    expect(result.inputTokens).toBe('9007199254740993');
    expect(result.unpricedRequests).toBe(5);
  });
  it('returns an empty dashboard without initializing configuration or writes', async () => {
    const { service, prisma } = setup();
    const result = await service.dashboard('actor', {});
    expect(result.timeline).toHaveLength(30);
    expect(result.summary.selected.averageKnownCost).toBeNull();
    expect(result.budgets).toHaveLength(2);
    expect(result.budgets[0].remaining).toBeNull();
    expect(prisma.$queryRaw).toHaveBeenCalledTimes(2);
    expect(prisma.aiWorkspaceConfig.findUnique).toHaveBeenCalledTimes(1);
    expect(prisma.aiCategoryConfig.findUnique).not.toHaveBeenCalled();
  });
  it('uses daily SQL rollups, exact SALES scope, and stale RUNNING overlay', () => {
    const query = usageAggregateQuery(
      'tenant',
      { scope: 'SALES', status: 'UNKNOWN' },
      usageRange({}, now),
      now,
    );
    expect(query.sql).toContain('FROM "AiUsageDaily"');
    expect(query.sql).toContain('UNION ALL');
    expect(query.sql).toContain('"deadlineAt" <=');
    expect(query.values).toContain('SALES_FIRST_DRAFT');
    expect(query.values).not.toContain('LEAD_AD_CLASSIFICATION');
    expect(query.values).toContain('UNKNOWN');
  });
  it('includes held uncertain spend in warning and available balances', () => {
    const result = usageBudgets(
      now,
      undefined,
      {
        dailyBudget: new Prisma.Decimal('1'),
        monthlyBudget: null,
        warningPercent: 80,
      } as never,
      null,
      [
        {
          scope: 'WORKSPACE',
          period: 'DAY',
          periodStart: new Date('2026-10-31'),
          spent: new Prisma.Decimal('.2'),
          reserved: new Prisma.Decimal('.7'),
        },
      ] as never,
    );
    expect(result[0]).toMatchObject({
      spent: '0.200000000000',
      reserved: '0.700000000000',
      remaining: '0.100000000000',
      warning: true,
      exhausted: false,
    });
  });
  it('rejects invalid filters, page limits and malformed or wrong-kind cursors', async () => {
    const { service, prisma } = setup();
    await expect(
      service.operations('actor', { model: 'untrusted' }),
    ).rejects.toThrow();
    await expect(service.operations('actor', { limit: 51 })).rejects.toThrow();
    await expect(
      service.operations('actor', {
        cursor: Buffer.from(
          JSON.stringify({
            v: 1,
            kind: 'other',
            id: 'id',
            at: now.toISOString(),
          }),
        ).toString('base64url'),
      }),
    ).rejects.toThrow();
    expect(() => decodeOperationCursor('%%%')).toThrow();
    expect(prisma.$queryRaw).not.toHaveBeenCalled();
  });
  it('paginates with strict timestamp/id tuples and omits private fields', async () => {
    const { service, prisma } = setup();
    const row = {
      id: 'id1',
      operationId: 'op',
      workspaceId: 'workspace-a',
      category: 'SALES_FOLLOW_UP',
      provider: 'openai',
      model: 'allowed-model',
      status: 'RUNNING',
      deadlineAt: new Date('2026-10-31T23:00:00Z'),
      createdAt: now,
      reservedCost: new Prisma.Decimal('.5'),
      fingerprint: 'private',
      configurationSnapshot: { secret: 'private' },
    };
    prisma.$queryRaw.mockResolvedValue([row, { ...row, id: 'id2' }]);
    const first = await service.operations('actor', {
      status: 'UNKNOWN',
      limit: 1,
    });
    expect(first.hasMore).toBe(true);
    expect(first.items[0].status).toBe('UNKNOWN');
    expect(first.items[0]).not.toHaveProperty('fingerprint');
    expect(first.items[0]).not.toHaveProperty('configurationSnapshot');
    await service.operations('actor', { limit: 1, cursor: first.nextCursor! });
    const sql = (prisma.$queryRaw.mock.calls as [Prisma.Sql][])[1][0];
    expect(sql.sql).toContain('("createdAt", "id") <');
    expect(sql.values).toContain('id1');
    expect(sql.values.at(-1)).toBe(2);
  });
  it('discovers retained holds across all dates while preserving selected workspace and dimensions', async () => {
    const { service, prisma } = setup();
    await service.operations('actor', {
      unresolved: true,
      from: '2020-01-01',
      to: '2020-01-02',
      category: 'SALES_FOLLOW_UP',
      scope: 'SALES',
      limit: 50,
    });
    const sql = (prisma.$queryRaw.mock.calls as [Prisma.Sql][])[0][0];
    expect(sql.sql).toContain(`AND "status" IN ('RUNNING', 'UNKNOWN')`);
    expect(sql.sql).not.toContain('"createdAt" >=');
    expect(sql.values).toContain('workspace-a');
    expect(sql.values).toContain('SALES_FOLLOW_UP');
    expect(sql.values).not.toContain('2020-01-01');
    expect(sql.values.at(-1)).toBe(33);
    await expect(
      service.operations('actor', { unresolved: true, workspaceId: 'foreign' }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.$queryRaw).toHaveBeenCalledTimes(1);
  });
  it('counts all-age held operations outside the selected dashboard date range', async () => {
    const { service, prisma } = setup();
    prisma.$queryRaw
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ pending: 2n, unresolved: 3n }]);
    const result = await service.dashboard('actor', {
      from: '2026-10-30',
      to: '2026-10-31',
    });
    expect(result.pendingRequests).toBe(2);
    expect(result.unresolvedRequests).toBe(3);
    const outstanding = (prisma.$queryRaw.mock.calls as [Prisma.Sql][])[1][0];
    expect(outstanding.sql).not.toContain('"createdAt"');
    expect(outstanding.values).toContain('workspace-a');
    expect(result.timeline).toHaveLength(2);
  });
  it('filters candidate first-offer receipts inside the existing workspace/date/cursor history query without another ledger', async () => {
    const { service, prisma } = setup();
    const page = await service.operations('actor', {
      businessScope: 'CANDIDATE_FIRST_OFFER',
      limit: 10,
    });
    expect(page.items).toEqual([]);
    expect(prisma.$queryRaw).toHaveBeenCalledTimes(1);
    const calls = prisma.$queryRaw.mock.calls as unknown as Array<[Prisma.Sql]>;
    const query = calls[0][0];
    expect(query.text).toContain(
      `"businessObjectId" LIKE 'lead-candidate-draft:%'`,
    );
    expect(query.text).toContain(`"category"='SALES_FIRST_DRAFT'`);
    expect(query.values).toContain('workspace-a');
    expect(query.values).toContain(11);
    expect(query.text).not.toContain('INSERT');
  });
});
