import { Prisma } from '@prisma/client';
import {
  enqueueLeadAnalysisHints,
  preflightLeadAnalysisHints,
} from './lead-analysis-outbox';
import { leadSource } from './lead.spec-fixtures';
import type { TelegramLeadPolicy } from './lead-policy.service';

describe('lead analysis outbox', () => {
  const make = () => {
    const source = leadSource({
      monitoringActorUserId: 'operator',
      monitoringState: 'ACTIVE',
    });
    const tx = {
      $queryRaw: jest.fn().mockResolvedValue([{ sourceId: source.id }]),
      $executeRaw: jest.fn().mockResolvedValue(1),
    };
    const policy = {
      refresh: jest.fn(),
      access: jest.fn().mockResolvedValue({ workspaceId: 'workspace' }),
      granted: jest.fn().mockReturnValue(true),
    };
    const prisma = {
      telegramLeadAutoConfig: {
        findMany: jest
          .fn()
          .mockResolvedValue([{ sourceId: source.id, source }]),
      },
    };
    const rows = [
      {
        sourceId: source.id,
        externalMessageId: '42',
        hash: 'hash',
        deleted: false,
        contentChanged: true,
        existed: false,
      },
    ];
    const run = async () => {
      const allowed = await preflightLeadAnalysisHints(
        prisma as never,
        policy as unknown as TelegramLeadPolicy,
        'workspace',
        'operator',
        [source.id],
      );
      return enqueueLeadAnalysisHints(
        tx as never,
        policy as unknown as TelegramLeadPolicy,
        'workspace',
        'operator',
        allowed,
        new Map([[source.id, source]]),
        rows,
      );
    };
    return { source, tx, prisma, policy, rows, run };
  };
  it('enqueues opted-in authorized changes as non-dispatchable metadata in the caller transaction', async () => {
    const h = make();
    await h.run();
    expect(h.policy.refresh).toHaveBeenCalledWith('operator');
    expect(h.policy.access).toHaveBeenCalledWith('operator', 'analyze');
    const statements = h.tx.$executeRaw.mock.calls.map(
      ([query]: [Prisma.Sql]) => query.sql,
    );
    expect(statements[0]).toContain('INSERT INTO "TelegramLeadAnalysisQueue"');
    expect(statements[0]).toContain('ON CONFLICT');
    expect(statements[0]).toContain('c.enabled=true');
    expect(statements[0]).toContain('o."workspaceId"');
  });
  it('makes no outbox writes without opt-in, AI grant, actor permission, or matching workspace', async () => {
    for (const deny of [
      (h: ReturnType<typeof make>) =>
        h.prisma.telegramLeadAutoConfig.findMany.mockResolvedValue([]),
      (h: ReturnType<typeof make>) => h.tx.$queryRaw.mockResolvedValue([]),
      (h: ReturnType<typeof make>) => h.policy.granted.mockReturnValue(false),
      (h: ReturnType<typeof make>) =>
        h.policy.access.mockRejectedValue(new Error('revoked')),
      (h: ReturnType<typeof make>) =>
        h.policy.access.mockResolvedValue({ workspaceId: 'other' }),
      (h: ReturnType<typeof make>) => {
        h.source.monitoringActorUserId = 'other';
      },
    ]) {
      const h = make();
      deny(h);
      await expect(h.run()).resolves.toBeUndefined();
      expect(
        (h.tx.$executeRaw.mock.calls as Array<[Prisma.Sql]>).some(([sql]) =>
          sql.sql.includes('INSERT INTO "TelegramLeadAnalysisQueue"'),
        ),
      ).toBe(false);
    }
  });
  it('persists a gap when preflight fails', async () => {
    const h = make();
    h.prisma.telegramLeadAutoConfig.findMany.mockRejectedValue(
      new Error('database unavailable'),
    );
    await h.run();
    expect(
      (h.tx.$executeRaw.mock.calls as Array<[Prisma.Sql]>)[0][0].sql,
    ).toContain('reconcileGeneration');
  });
  it('removes stale hints after opt-in or AI grant is revoked', async () => {
    for (const deleted of [false, true]) {
      const h = make();
      h.rows[0].existed = true;
      h.rows[0].deleted = deleted;
      h.prisma.telegramLeadAutoConfig.findMany.mockResolvedValue([]);
      await h.run();
      expect(h.tx.$executeRaw).toHaveBeenCalled();
      expect(
        (h.tx.$executeRaw.mock.calls as Array<[Prisma.Sql]>)[0][0].sql,
      ).toContain('DELETE FROM');
    }
  });
  it('does not queue URL-only edits and removes stale waiting records for deleted posts', async () => {
    const h = make();
    h.rows[0].contentChanged = false;
    await h.run();
    expect(h.tx.$executeRaw).not.toHaveBeenCalled();
    h.rows[0].deleted = true;
    h.rows[0].existed = true;
    await h.run();
    expect(h.tx.$executeRaw).toHaveBeenCalledTimes(1);
    expect(
      (h.tx.$executeRaw.mock.calls as Array<[Prisma.Sql]>)[0][0].sql,
    ).toContain('DELETE FROM');
  });
});
