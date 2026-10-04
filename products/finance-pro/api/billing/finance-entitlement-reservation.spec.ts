import { FinanceEntitlementService } from './finance-entitlement.service';

describe('FinanceEntitlementService AI reservation dimensions', () => {
  it('persists workspace and runtime dimensions for operator cost analytics', async () => {
    const usage = {
      count: jest.fn().mockResolvedValue(0),
      create: jest.fn().mockResolvedValue({ id: 'reservation-1' }),
    };
    const transaction = {
      $executeRaw: jest.fn().mockResolvedValue(1),
      aiUsageEvent: usage,
    };
    const prisma = {
      botSubscription: {
        findMany: jest.fn().mockResolvedValue([
          {
            plan: { code: 'ULTIMATE' },
            currentPeriodEnd: new Date('2030-01-01T00:00:00.000Z'),
            cancelAtPeriodEnd: false,
            grants: [],
          },
        ]),
      },
      financeProfile: {
        findFirst: jest.fn().mockResolvedValue({
          botIntegration: { workspaceId: 'workspace-1' },
          telegramUser: { runtimeInstanceId: 'runtime-1' },
        }),
      },
      $transaction: jest.fn(
        (callback: (tx: typeof transaction) => Promise<unknown>) =>
          callback(transaction),
      ),
    };
    const service = new FinanceEntitlementService(prisma as never);

    await expect(
      service.reserveCapability(
        {
          profileId: 'profile-1',
          botIntegrationId: 'bot-1',
          telegramBotUserId: 'user-1',
        },
        'FINANCE_HISTORY_QA',
        'AI_INSIGHTS',
        'gpt-5-mini',
      ),
    ).resolves.toEqual({ id: 'reservation-1' });
    const createCalls = usage.create.mock.calls as unknown as Array<
      [
        {
          data: Record<string, unknown>;
          select: { id: boolean };
        },
      ]
    >;
    const created = createCalls[0]?.[0];
    expect(created?.data).toMatchObject({
      workspaceId: 'workspace-1',
      botIntegrationId: 'bot-1',
      runtimeInstanceId: 'runtime-1',
      telegramBotUserId: 'user-1',
      profileId: 'profile-1',
      feature: 'AI_INSIGHTS',
    });
    expect(created?.select).toEqual({ id: true });
  });
});
