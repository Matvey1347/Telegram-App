import { FinanceLimitService } from './finance-limit.service';

describe('FinanceLimitService', () => {
  it('explicitly excludes investment contributions from spending limits', async () => {
    const queryRaw = jest.fn().mockResolvedValue([]);
    const service = new FinanceLimitService({
      financeProfile: {
        findUnique: jest.fn().mockResolvedValue({
          timezone: 'UTC',
          botIntegration: { workspaceId: 'workspace-1' },
        }),
      },
      financeSpendingLimit: { findMany: jest.fn().mockResolvedValue([]) },
      $queryRaw: queryRaw,
    } as never);

    await service.list('profile-1');

    const calls = queryRaw.mock.calls as unknown as Array<
      [TemplateStringsArray, ...unknown[]]
    >;
    const template = calls[0][0];
    expect(template.join(' ')).toContain(`t."purpose" = 'ORDINARY'`);
  });
});
