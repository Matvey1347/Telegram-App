import type { Prisma } from '@prisma/client';
import {
  AI_RETENTION_BATCH_SIZE,
  AiUsageRetentionService,
} from './ai-usage-retention.service';

describe('AI usage retention', () => {
  it('runs one bounded pass and preserves unresolved operations and reserved budgets', async () => {
    const execute = jest
      .fn()
      .mockResolvedValueOnce(7)
      .mockResolvedValueOnce(8)
      .mockResolvedValueOnce(9);
    const service = new AiUsageRetentionService({
      $executeRaw: execute,
    } as never);
    await expect(
      service.cleanup(new Date('2026-10-31T12:00:00Z')),
    ).resolves.toEqual({ operations: 7, daily: 8, budgetPeriods: 9 });
    expect(execute).toHaveBeenCalledTimes(4);
    const queries = (execute.mock.calls as [Prisma.Sql][]).map(
      (call) => call[0],
    );
    for (const query of queries) {
      expect(query.sql).toMatch(/LIMIT \? FOR UPDATE(?: OF [dr])? SKIP LOCKED/);
      expect(query.values).toContain(AI_RETENTION_BATCH_SIZE);
      expect(AI_RETENTION_BATCH_SIZE).toBe(20_000);
      expect(query.sql).not.toContain('UPDATE "AiBudgetPeriod"');
    }
    expect(queries[0].sql).toContain("'SUCCEEDED', 'FAILED', 'RECONCILED'");
    expect(queries[0].sql).not.toContain("'UNKNOWN'");
    expect(queries[0].sql).not.toContain("'RUNNING'");
    expect(queries[2].sql).toContain('AND "reserved" = 0');
    expect(queries[3].sql).toContain('DELETE FROM "AiOperationResult"');
    expect(queries[3].sql).not.toContain("'UNKNOWN'");
    // Reconciliation retracts the original UNKNOWN cube row before writing the
    // settled one, so its dimensions must survive even after 90 days.
    expect(queries[1].sql).toContain('AND NOT EXISTS');
    expect(queries[1].sql).toContain(
      `o."workspaceId" = d."workspaceId" AND o."status" = 'UNKNOWN'`,
    );
    for (const dimension of ['category', 'provider', 'model']) {
      expect(queries[1].sql).toContain(`o."${dimension}" = d."${dimension}"`);
    }
    expect(queries[1].sql).toContain(`o."createdAt" >= d."day"::timestamp`);
    expect(queries[1].sql).toContain(
      `o."createdAt" < (d."day" + 1)::timestamp`,
    );
    expect(queries[1].values).toContainEqual(new Date('2026-08-02T00:00:00Z'));
  });
  it('propagates a storage failure without unbounded retry or refund', async () => {
    const execute = jest.fn().mockRejectedValue(new Error('unavailable'));
    await expect(
      new AiUsageRetentionService({ $executeRaw: execute } as never).cleanup(),
    ).rejects.toThrow('unavailable');
    expect(execute).toHaveBeenCalledTimes(1);
  });
});
