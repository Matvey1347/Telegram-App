import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../../prisma/prisma.service';
import { TelegramLeadRetentionService } from './lead-retention.service';
describe('bounded daily Discovery retention', () => {
  it('does no idle work; deletes text before unlinked expired candidates while retaining linked attribution and aliases', async () => {
    const execute = jest
      .fn<Promise<number>, [Prisma.Sql]>()
      .mockResolvedValueOnce(2)
      .mockResolvedValueOnce(4)
      .mockResolvedValueOnce(20)
      .mockResolvedValueOnce(3);
    const service = new TelegramLeadRetentionService({
      $executeRaw: execute,
    } as unknown as PrismaService);
    expect(execute).not.toHaveBeenCalled();
    expect(await service.cleanup(new Date('2026-11-01T01:00:00Z'))).toEqual({
      drafts: 2,
      qualifications: 4,
      observations: 20,
      candidates: 3,
    });
    expect(execute).toHaveBeenCalledTimes(4);
    const [drafts, qualifications, observations, candidates] =
      execute.mock.calls.map((call) => call[0]);
    expect(observations.text).toContain(
      'DELETE FROM "TelegramLeadObservation"',
    );
    expect(candidates.text).toContain('"contactId" IS NULL');
    expect(candidates.text).toContain('"mergedIntoId"');
    expect(candidates.text).toContain('NOT EXISTS');
    expect(candidates.text).toContain("q.status IN ('GENERATING', 'UNKNOWN')");
    expect(candidates.text).toContain("d.status IN ('GENERATING', 'UNKNOWN')");
    expect(candidates.text).toContain(
      'q."candidateId"=c.id AND q."workspaceId"=c."workspaceId"',
    );
    expect(candidates.text).toContain(
      'd."candidateId"=c.id AND d."workspaceId"=c."workspaceId"',
    );
    expect(drafts.text).toContain("status NOT IN ('GENERATING', 'UNKNOWN')");
    expect(qualifications.text).toContain(
      "status NOT IN ('GENERATING', 'UNKNOWN')",
    );
    for (const query of [drafts, qualifications, observations, candidates]) {
      expect(query.values).toContain(20_000);
      expect(query.text).toContain('SKIP LOCKED');
      expect(query.text).not.toContain('AiBudgetPeriod');
    }
  });
  it('surfaces DB failure without automatic retries or provider reconciliation', async () => {
    const execute = jest
      .fn<Promise<number>, [Prisma.Sql]>()
      .mockRejectedValue(new Error('database unavailable'));
    const service = new TelegramLeadRetentionService({
      $executeRaw: execute,
    } as unknown as PrismaService);
    await expect(service.cleanup()).rejects.toThrow('database unavailable');
    expect(execute).toHaveBeenCalledTimes(1);
  });
});
