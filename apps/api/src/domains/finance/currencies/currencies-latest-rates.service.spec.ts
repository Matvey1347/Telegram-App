import { Prisma } from '@prisma/client';
import { CurrenciesService } from './currencies.service';

describe('CurrenciesService.getLatestRates', () => {
  it('returns one bounded workspace-scoped latest-rate query and performs no writes', async () => {
    const rows = [
      {
        id: 'rate-1',
        workspaceId: 'workspace-1',
        baseCurrency: 'USD',
        targetCurrency: 'EUR',
        rate: 0.9,
        date: new Date('2026-08-28T00:00:00.000Z'),
      },
    ];
    const queryRaw = jest.fn((sql: Prisma.Sql) => {
      void sql;
      return Promise.resolve(rows);
    });
    const prisma = {
      $queryRaw: queryRaw,
      exchangeRate: {
        findMany: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
      },
    };
    const workspaceService = {
      resolveWorkspaceIdForUser: jest.fn().mockResolvedValue('workspace-1'),
    };
    const service = new CurrenciesService(
      prisma as never,
      workspaceService as never,
    );

    await expect(service.getLatestRates('user-1')).resolves.toBe(rows);

    const sql = queryRaw.mock.calls[0][0];
    expect(sql.values).toContain('workspace-1');
    expect(sql.strings.join(' ')).toContain('SELECT DISTINCT ON');
    expect(sql.strings.join(' ')).toContain('rate."date" <= NOW()');
    expect(workspaceService.resolveWorkspaceIdForUser).toHaveBeenCalledTimes(1);
    expect(prisma.$queryRaw).toHaveBeenCalledTimes(1);
    expect(prisma.exchangeRate.findMany).not.toHaveBeenCalled();
    expect(prisma.exchangeRate.create).not.toHaveBeenCalled();
    expect(prisma.exchangeRate.update).not.toHaveBeenCalled();
    expect(prisma.exchangeRate.delete).not.toHaveBeenCalled();
  });
});
