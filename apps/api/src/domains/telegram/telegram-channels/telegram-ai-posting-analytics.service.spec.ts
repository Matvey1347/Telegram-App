import { NotFoundException } from '@nestjs/common';
import { TelegramAiPostingAnalyticsService } from './telegram-ai-posting-analytics.service';

describe('TelegramAiPostingAnalyticsService', () => {
  const setup = () => {
    const prisma: any = {
      telegramChannel: {
        findFirst: jest.fn().mockResolvedValue({ id: 'channel' }),
      },
      $queryRaw: jest.fn(),
      telegramAiPostingSettings: {
        findFirst: jest.fn().mockResolvedValue({
          aiDailyBudget: { toString: () => '2.5' },
          aiMonthlyBudget: { toString: () => '30' },
        }),
      },
      aiBudgetPeriod: { findMany: jest.fn().mockResolvedValue([]) },
    };
    const workspace: any = {
      resolveWorkspaceIdForUser: jest.fn().mockResolvedValue('workspace'),
    };
    return {
      service: new TelegramAiPostingAnalyticsService(prisma, workspace),
      prisma,
    };
  };

  it('reports ledger costs, posting dimensions, forecast, rejected tests and limits', async () => {
    const { service, prisma } = setup();
    prisma.$queryRaw
      .mockResolvedValueOnce([
        {
          operations: 4,
          failedOperations: 1,
          retryOperations: 1,
          unpricedOperations: 1,
          knownCost: '1.25',
        },
      ])
      .mockResolvedValueOnce([
        {
          stage: 'TELEGRAM_POSTING_TEXT',
          operations: 2,
          unpricedOperations: 0,
          knownCost: '0.75',
        },
      ])
      .mockResolvedValueOnce([
        {
          mode: 'TEST',
          operations: 4,
          unpricedOperations: 1,
          knownCost: '1.25',
        },
      ])
      .mockResolvedValueOnce([{ unpricedOperations: 0, knownCost: '0.4' }])
      .mockResolvedValueOnce([
        { readyPosts: 2, unpricedReadyPosts: 0, knownCost: '0.8' },
      ])
      .mockResolvedValueOnce([{ unpricedOperations: 0, knownCost: '0.7' }]);

    const result = await service.read('user', 'channel', {
      from: '2026-11-01',
      to: '2026-11-08',
    });

    expect(result.expenses).toMatchObject({
      knownCost: '1.250000000000',
      unpricedOperations: 1,
      failedOperations: 1,
      retryOperations: 1,
    });
    expect(result.byStage[0]).toMatchObject({
      stage: 'text',
      knownCost: '0.750000000000',
    });
    expect(result.rejectedTests.knownCost).toBe('0.400000000000');
    expect(result.costPerReadyPost).toBe('0.4');
    expect(result.monthlyForecast.knownCost).toBe('3');
    expect(result.budgets.daily.limit).toBe('2.5');
    expect(prisma.$queryRaw).toHaveBeenCalledTimes(6);

    const queryRaw = (prisma as { $queryRaw: jest.Mock }).$queryRaw;
    const rejectedQuery = (queryRaw.mock.calls[3] as unknown[])[0] as {
      sql: string;
      values: unknown[];
    };
    expect(rejectedQuery.sql).toContain(
      `WHEN jsonb_typeof(r."publications") = 'array'`,
    );
    expect(rejectedQuery.sql).toContain(
      `WHEN jsonb_typeof(r."publications") = 'object'`,
    );
    expect(rejectedQuery.sql).toContain(
      "jsonb_typeof(r.\"publications\"->'items') = 'array'",
    );
    expect(rejectedQuery.sql).toContain("ELSE '[]'::jsonb");
    expect(rejectedQuery.sql).toContain('WITH ORDINALITY');
    expect(rejectedQuery.sql).toContain('p.ordinal - 1 AS publication_index');
    expect(rejectedQuery.sql).toContain("p.item->>'status' = 'REJECTED'");
    expect(rejectedQuery.sql).toContain('r."workspaceId" = ?');
    expect(rejectedQuery.sql).toContain('r."telegramChannelId" = ?');
    expect(rejectedQuery.sql).toContain('r."createdAt" >= ?');
    expect(rejectedQuery.sql).toContain('r."createdAt" < ?');
    expect(rejectedQuery.sql).toContain(
      'r.publication_index = o."aiPostingPublicationIndex"',
    );
    expect(rejectedQuery.sql).toContain(`o."aiPostingMode" = 'TEST'`);
    expect(rejectedQuery.sql).toContain(
      '"actualCost" IS NULL AND "pricingStatus" NOT IN',
    );
    expect(rejectedQuery.sql).toContain('SUM("actualCost")');
    expect(rejectedQuery.sql).toContain(
      'SUM(allocated_planning_cost::numeric)',
    );
    expect(rejectedQuery.values).toEqual([
      'workspace',
      'channel',
      new Date('2026-11-01T00:00:00.000Z'),
      new Date('2026-11-09T00:00:00.000Z'),
      'workspace',
      'channel',
    ]);

    expect(Object.keys(result)).toEqual([
      'channelId',
      'currency',
      'from',
      'to',
      'expenses',
      'byStage',
      'byMode',
      'rejectedTests',
      'readyPosts',
      'unpricedReadyPosts',
      'costPerReadyPost',
      'monthlyForecast',
      'budgets',
    ]);
  });

  it('returns no zero cost per ready post when ready draft costs are unknown', async () => {
    const { service, prisma } = setup();
    prisma.$queryRaw
      .mockResolvedValueOnce([{ knownCost: '0', unpricedOperations: 0 }])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ knownCost: '0', unpricedOperations: 0 }])
      .mockResolvedValueOnce([
        { readyPosts: 1, unpricedReadyPosts: 1, knownCost: '0' },
      ])
      .mockResolvedValueOnce([{ knownCost: '0', unpricedOperations: 0 }]);
    const result = await service.read('user', 'channel', {});
    expect(result.costPerReadyPost).toBeNull();
  });

  it('enforces channel workspace isolation before querying spend', async () => {
    const { service, prisma } = setup();
    prisma.telegramChannel.findFirst.mockResolvedValue(null);
    await expect(
      service.read('user', 'other-channel', {}),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.$queryRaw).not.toHaveBeenCalled();
  });

  it('rejects periods outside retained detailed-operation history', async () => {
    const { service, prisma } = setup();
    await expect(
      service.read('user', 'channel', {
        from: '2026-01-01',
        to: '2026-04-01',
      }),
    ).rejects.toThrow('AI_POSTING_ANALYTICS_RANGE_INVALID');
    expect(prisma.$queryRaw).not.toHaveBeenCalled();
  });
});
