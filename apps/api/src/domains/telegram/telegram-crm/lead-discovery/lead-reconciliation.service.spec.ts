import { TelegramLeadReconciliationService } from './lead-reconciliation.service';
import { leadObservation, leadSource } from './lead.spec-fixtures';
import type { PrismaService } from '../../../../prisma/prisma.service';
import type { TelegramLeadPolicy } from './lead-policy.service';

function fixture() {
  const source = leadSource();
  const observation = leadObservation();
  const config = {
    enabled: true,
    reconcileNeeded: true,
    reconcileGeneration: 3,
    reconcileRunningGeneration: null,
    reconcileSnapshotId: null,
    reconcileSnapshotObservedAt: null,
    reconcileCursorId: null,
    reconcileCursorObservedAt: null,
  };
  const tx = {
    $queryRaw: jest.fn().mockResolvedValue([{ sourceId: source.id }]),
    $executeRaw: jest.fn().mockResolvedValue(1),
    telegramLeadSource: {
      findMany: jest.fn().mockResolvedValue([source]),
      findFirst: jest.fn().mockResolvedValue(source),
    },
    telegramChannel: { findMany: jest.fn().mockResolvedValue([]) },
    telegramLeadAutoConfig: {
      findUnique: jest.fn().mockResolvedValue(config),
      findUniqueOrThrow: jest.fn().mockResolvedValue(config),
      update: jest.fn(),
      upsert: jest.fn(),
    },
    telegramLeadObservation: {
      findFirst: jest.fn().mockResolvedValue(observation),
      findMany: jest.fn().mockResolvedValue([observation]),
    },
    telegramLeadAnalysisQueue: {
      findMany: jest.fn().mockResolvedValue([
        {
          observationId: observation.id,
          contentHash: observation.contentHash,
        },
      ]),
    },
  };
  const prisma = {
    telegramLeadAutoConfig: {
      findMany: jest.fn().mockResolvedValue([{ sourceId: source.id, source }]),
    },
    $transaction: jest.fn((op: (tx: unknown) => unknown) => op(tx)),
  };
  const policy = {
    source: jest.fn().mockResolvedValue(source),
    refresh: jest.fn(),
    access: jest.fn().mockResolvedValue({ workspaceId: source.workspaceId }),
    granted: jest.fn().mockReturnValue(true),
    assertProcessing: jest.fn(),
  };
  return {
    source,
    observation,
    config,
    tx,
    prisma,
    policy,
    service: new TelegramLeadReconciliationService(
      prisma as unknown as PrismaService,
      policy as unknown as TelegramLeadPolicy,
    ),
  };
}
describe('bounded reconciliation', () => {
  it('queues existing observations and clears the gap only after a complete stable pass', async () => {
    const h = fixture();
    await expect(h.service.reconcilePage('manager', 'source')).resolves.toEqual(
      { processed: 1, complete: true, blocked: false },
    );
    expect(
      (
        h.tx.telegramLeadAutoConfig.update.mock.calls as Array<
          [{ data: unknown }]
        >
      )[0][0].data,
    ).toMatchObject({
      reconcileNeeded: false,
      reconcileRunningGeneration: null,
    });
    expect(h.tx.telegramLeadObservation.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ take: 100 }),
    );
  });
  it('restarts after a concurrent gap generation and never clears it', async () => {
    const h = fixture();
    h.tx.telegramLeadAutoConfig.findUniqueOrThrow.mockResolvedValue({
      ...h.config,
      reconcileGeneration: 4,
    });
    await expect(
      h.service.reconcilePage('manager', 'source'),
    ).resolves.toMatchObject({ complete: false });
    expect(h.tx.telegramLeadAutoConfig.update).not.toHaveBeenCalled();
  });
  it('does not advance the cursor when capacity prevents enqueue', async () => {
    const h = fixture();
    h.tx.telegramLeadAnalysisQueue.findMany.mockResolvedValue([]);
    await expect(
      h.service.reconcilePage('manager', 'source'),
    ).resolves.toMatchObject({ processed: 0, complete: false, blocked: true });
    expect(
      (
        h.tx.telegramLeadAutoConfig.update.mock.calls as Array<
          [{ data: unknown }]
        >
      )[0][0].data,
    ).toMatchObject({ reconcileNeeded: true, reconcileCursorId: null });
  });
  it('does not rewrite an unchanged blocked reconciliation checkpoint', async () => {
    const h = fixture();
    const blocked = {
      ...h.config,
      reconcileRunningGeneration: 3,
      reconcileSnapshotId: h.observation.id,
      reconcileSnapshotObservedAt: h.observation.observedAt,
      overflowedAt: new Date(),
    };
    h.tx.telegramLeadAutoConfig.findUnique.mockResolvedValue(blocked);
    h.tx.telegramLeadAutoConfig.findUniqueOrThrow.mockResolvedValue(blocked);
    h.tx.telegramLeadAnalysisQueue.findMany.mockResolvedValue([]);
    await h.service.reconcilePage('manager', 'source');
    expect(h.tx.telegramLeadAutoConfig.update).not.toHaveBeenCalled();
  });
  it('rejects a failed authorization before opening a transaction', async () => {
    const h = fixture();
    h.policy.access.mockRejectedValue(new Error('revoked'));
    await expect(h.service.reconcilePage('manager', 'source')).rejects.toThrow(
      'LEAD_AUTOMATION_NOT_AUTHORIZED',
    );
    expect(h.prisma.$transaction).not.toHaveBeenCalled();
  });
  it('marks a new opt-in as needing a full pass', async () => {
    const h = fixture();
    h.tx.telegramLeadAutoConfig.findUnique.mockResolvedValue(null);
    await h.service.setEnabled('manager', 'source', true);
    expect(
      (
        h.tx.telegramLeadAutoConfig.upsert.mock.calls as Array<
          [{ create: unknown }]
        >
      )[0][0].create,
    ).toMatchObject({
      enabled: true,
      reconcileNeeded: true,
      reconcileGeneration: 1,
    });
  });
});
