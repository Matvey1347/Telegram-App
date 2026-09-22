import { BotBillingAnalyticsService } from './bot-billing-analytics.service';

describe('BotBillingAnalyticsService', () => {
  it('keeps gifted and manual access out of paying-user and revenue metrics', () => {
    const service = new BotBillingAnalyticsService({} as never);
    const now = new Date('2026-09-21T12:00:00.000Z');

    expect(service.calculate(4, [
      { telegramBotUserId: 'payer', source: 'STRIPE', status: 'ACTIVE', currency: 'USD', interval: 'MONTH', amountMinor: 1_000, currentPeriodEnd: null, providerSubscription: { mode: 'LIVE' } },
      { telegramBotUserId: 'gifted', source: 'GIFT', status: 'ACTIVE', currency: null, interval: null, amountMinor: null, currentPeriodEnd: null, providerSubscription: null },
      { telegramBotUserId: 'manual', source: 'MANUAL', status: 'ACTIVE', currency: null, interval: null, amountMinor: null, currentPeriodEnd: null, providerSubscription: null },
    ], now)).toMatchObject({
      paidUsers: 1,
      grantedUsers: 2,
      activeSubscriptions: 3,
      freeUsers: 1,
      monthly: 1,
      mrr: [{ currency: 'USD', amountMinor: 1_000 }],
    });
  });

  it('aggregates real AI cost by model and user across a logical bot', async () => {
    const prisma = {
      telegramBotRuntimeInstance: { findFirst: jest.fn().mockResolvedValue({ id: 'runtime-local' }) },
      aiUsageEvent: {
        aggregate: jest.fn().mockResolvedValue({ _count: { _all: 2, estimatedCostMicros: 2 }, _sum: { inputTokens: 120, cachedInputTokens: 20, outputTokens: 30, estimatedCostMicros: 90 } }),
        groupBy: jest.fn().mockResolvedValueOnce([{ model: 'gpt-5-mini', _count: { _all: 2 }, _sum: { inputTokens: 120, outputTokens: 30, estimatedCostMicros: 90 } }]).mockResolvedValueOnce([{ telegramBotUserId: 'user-1', _count: { _all: 2 }, _sum: { estimatedCostMicros: 90 } }]),
      },
      telegramBotUser: { findMany: jest.fn().mockResolvedValue([{ id: 'user-1', telegramUserId: '42', username: 'alice', firstName: 'Alice' }]) },
    };
    const service = new BotBillingAnalyticsService(prisma as never);
    await expect(service.aiUsage('workspace-1', 'bot-1')).resolves.toMatchObject({ requests: 2, estimatedCostMicros: 90, unpricedRequests: 0, byModel: [{ model: 'gpt-5-mini', requests: 2 }], byUser: [{ telegramBotUserId: 'user-1', username: 'alice', requests: 2 }] });
    expect(prisma.aiUsageEvent.aggregate).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.not.objectContaining({ runtimeInstanceId: expect.anything() }),
    }));
  });

  it('returns zero-valued Finance summaries when a bot has no billing data', async () => {
    const prisma = {
      telegramBotUser: { groupBy: jest.fn().mockResolvedValue([]) },
      $queryRaw: jest.fn().mockResolvedValue([]),
    };
    const service = new BotBillingAnalyticsService(prisma as never);

    await expect(service.summariesForRuntimes('workspace-1', ['runtime-1'])).resolves.toEqual(
      new Map([
        [
          'runtime-1',
          {
            registeredUsers: 0,
            paidUsers: 0,
            activeSubscriptions: 0,
            failedPayments: 0,
          },
        ],
      ]),
    );
  });

  it('uses the billing overview rules for paid, active, and failed subscriptions', async () => {
    const prisma = {
      telegramBotUser: {
        groupBy: jest.fn().mockResolvedValue([
          { runtimeInstanceId: 'runtime-1', _count: { _all: 3 } },
        ]),
      },
      $queryRaw: jest.fn().mockResolvedValue([
          {
            runtimeInstanceId: 'runtime-1',
            activeSubscriptions: 2,
            paidUsers: 2,
            failedPayments: 1,
          },
        ]),
    };
    const service = new BotBillingAnalyticsService(prisma as never);

    const summaries = await service.summariesForRuntimes('workspace-1', ['runtime-1']);

    expect(summaries.get('runtime-1')).toEqual({
      registeredUsers: 3,
      paidUsers: 2,
      activeSubscriptions: 2,
      failedPayments: 1,
    });
    expect(prisma.telegramBotUser.groupBy).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { workspaceId: 'workspace-1', runtimeInstanceId: { in: ['runtime-1'] } },
      }),
    );
    expect(prisma.$queryRaw).toHaveBeenCalledTimes(1);
  });

  it('keeps multi-bot summaries isolated to the requested workspace and bot ids', async () => {
    const prisma = {
      telegramBotUser: {
        groupBy: jest.fn().mockResolvedValue([
          { runtimeInstanceId: 'runtime-1', _count: { _all: 1 } },
          { runtimeInstanceId: 'runtime-2', _count: { _all: 4 } },
        ]),
      },
      $queryRaw: jest.fn().mockResolvedValue([
        { runtimeInstanceId: 'runtime-1', activeSubscriptions: 1, paidUsers: 1, failedPayments: 0 },
        { runtimeInstanceId: 'runtime-2', activeSubscriptions: 2, paidUsers: 2, failedPayments: 1 },
        { runtimeInstanceId: 'foreign-runtime', activeSubscriptions: 99, paidUsers: 99, failedPayments: 99 },
      ]),
    };
    const service = new BotBillingAnalyticsService(prisma as never);

    const summaries = await service.summariesForRuntimes('workspace-1', [
      'runtime-1',
      'runtime-2',
    ]);

    expect(summaries).toEqual(
      new Map([
        ['runtime-1', { registeredUsers: 1, activeSubscriptions: 1, paidUsers: 1, failedPayments: 0 }],
        ['runtime-2', { registeredUsers: 4, activeSubscriptions: 2, paidUsers: 2, failedPayments: 1 }],
      ]),
    );
    expect(summaries.has('foreign-runtime')).toBe(false);
    expect(prisma.telegramBotUser.groupBy).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          workspaceId: 'workspace-1',
          runtimeInstanceId: { in: ['runtime-1', 'runtime-2'] },
        },
      }),
    );
  });
});
