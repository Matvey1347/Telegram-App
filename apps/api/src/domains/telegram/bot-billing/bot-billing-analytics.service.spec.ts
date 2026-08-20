import { BotBillingAnalyticsService } from './bot-billing-analytics.service';

describe('BotBillingAnalyticsService', () => {
  it('returns zero-valued Finance summaries when a bot has no billing data', async () => {
    const prisma = {
      telegramBotUser: { groupBy: jest.fn().mockResolvedValue([]) },
      $queryRaw: jest.fn().mockResolvedValue([]),
    };
    const service = new BotBillingAnalyticsService(prisma as never);

    await expect(service.summariesForBots('workspace-1', ['finance-1'])).resolves.toEqual(
      new Map([
        [
          'finance-1',
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
          { botIntegrationId: 'finance-1', _count: { _all: 3 } },
        ]),
      },
      $queryRaw: jest.fn().mockResolvedValue([
          {
            botIntegrationId: 'finance-1',
            activeSubscriptions: 2,
            paidUsers: 2,
            failedPayments: 1,
          },
        ]),
    };
    const service = new BotBillingAnalyticsService(prisma as never);

    const summaries = await service.summariesForBots('workspace-1', ['finance-1']);

    expect(summaries.get('finance-1')).toEqual({
      registeredUsers: 3,
      paidUsers: 2,
      activeSubscriptions: 2,
      failedPayments: 1,
    });
    expect(prisma.telegramBotUser.groupBy).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { workspaceId: 'workspace-1', botIntegrationId: { in: ['finance-1'] } },
      }),
    );
    expect(prisma.$queryRaw).toHaveBeenCalledTimes(1);
  });

  it('keeps multi-bot summaries isolated to the requested workspace and bot ids', async () => {
    const prisma = {
      telegramBotUser: {
        groupBy: jest.fn().mockResolvedValue([
          { botIntegrationId: 'finance-1', _count: { _all: 1 } },
          { botIntegrationId: 'finance-2', _count: { _all: 4 } },
        ]),
      },
      $queryRaw: jest.fn().mockResolvedValue([
        { botIntegrationId: 'finance-1', activeSubscriptions: 1, paidUsers: 1, failedPayments: 0 },
        { botIntegrationId: 'finance-2', activeSubscriptions: 2, paidUsers: 2, failedPayments: 1 },
        { botIntegrationId: 'foreign-bot', activeSubscriptions: 99, paidUsers: 99, failedPayments: 99 },
      ]),
    };
    const service = new BotBillingAnalyticsService(prisma as never);

    const summaries = await service.summariesForBots('workspace-1', [
      'finance-1',
      'finance-2',
    ]);

    expect(summaries).toEqual(
      new Map([
        ['finance-1', { registeredUsers: 1, activeSubscriptions: 1, paidUsers: 1, failedPayments: 0 }],
        ['finance-2', { registeredUsers: 4, activeSubscriptions: 2, paidUsers: 2, failedPayments: 1 }],
      ]),
    );
    expect(summaries.has('foreign-bot')).toBe(false);
    expect(prisma.telegramBotUser.groupBy).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          workspaceId: 'workspace-1',
          botIntegrationId: { in: ['finance-1', 'finance-2'] },
        },
      }),
    );
  });
});
