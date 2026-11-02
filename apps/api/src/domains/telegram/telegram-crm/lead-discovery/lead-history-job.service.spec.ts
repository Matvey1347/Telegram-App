import type { PrismaService } from '../../../../prisma/prisma.service';
import type { TelegramCrmRuntimeManager } from '../telegram-crm-runtime-manager.service';
import { TelegramLeadHistoryJobService } from './lead-history-job.service';
import type { TelegramLeadHistoryWorker } from './lead-history-worker.service';
import type { TelegramLeadPolicy } from './lead-policy.service';
import { leadSource } from './lead.spec-fixtures';

function fixture() {
  const source = leadSource();
  const jobs = {
    findUnique: jest.fn().mockResolvedValue(null),
    upsert: jest.fn(async ({ create }: { create: object }) => ({
      id: 'job',
      ...create,
    })),
    updateMany: jest.fn().mockResolvedValue({ count: 1 }),
  };
  const tx = {
    telegramLeadHistoryJob: jobs,
    $executeRaw: jest.fn().mockResolvedValue(1),
  };
  const prisma = {
    telegramLeadHistoryJob: jobs,
    $transaction: jest.fn((operation: (value: typeof tx) => Promise<unknown>) =>
      operation(tx),
    ),
  };
  const policy = {
    source: jest.fn().mockResolvedValue(source),
    assertProcessing: jest.fn(),
    account: jest.fn().mockResolvedValue({}),
  };
  const worker = { wake: jest.fn() },
    runtime = { liveAccountIds: jest.fn().mockReturnValue(['account']) };
  const service = new TelegramLeadHistoryJobService(
    prisma as unknown as PrismaService,
    policy as unknown as TelegramLeadPolicy,
    worker as unknown as TelegramLeadHistoryWorker,
    runtime as unknown as TelegramCrmRuntimeManager,
  );
  return { source, jobs, prisma, policy, worker, runtime, service };
}
describe('scoped historical collection controls', () => {
  it('returns null before a source has a job and checks workspace access', async () => {
    const h = fixture();
    expect(await h.service.status('user', 'source')).toBeNull();
    expect(h.policy.source).toHaveBeenCalledWith('user', 'source', 'view');
    expect(h.jobs.findUnique).toHaveBeenCalledWith({
      where: {
        sourceId_workspaceId: { sourceId: 'source', workspaceId: 'workspace' },
      },
    });
  });
  it('starts one 90-day collection with the authorized actor and no AI call', async () => {
    const h = fixture();
    const result = await h.service.start('manager', 'source');
    expect(result).toMatchObject({
      sourceId: 'source',
      status: 'RUNNING',
      phase: 'HISTORY_COLLECTION_ONLY',
      coverage: 'UNPROVEN',
    });
    expect(Date.parse(result.startedAt) - Date.parse(result.cutoffAt)).toBe(
      90 * 86400000,
    );
    expect(h.worker.wake).toHaveBeenCalledWith('workspace', 'source');
  });
  it('refuses a source whose grant is revoked before creating any work', async () => {
    const h = fixture();
    h.policy.assertProcessing.mockImplementation(() => {
      throw new Error('NO_GRANT');
    });
    await expect(h.service.start('manager', 'source')).rejects.toThrow(
      'NO_GRANT',
    );
    expect(h.prisma.$transaction).not.toHaveBeenCalled();
    expect(h.worker.wake).not.toHaveBeenCalled();
  });
  it('does not create work on a process that has no existing live account', async () => {
    const h = fixture();
    h.runtime.liveAccountIds.mockReturnValue([]);
    await expect(h.service.start('manager', 'source')).rejects.toThrow(
      'LEAD_EXISTING_LIVE_ACCOUNT_REQUIRED',
    );
    expect(h.prisma.$transaction).not.toHaveBeenCalled();
  });
  it('pause only changes RUNNING to PAUSING and does not erase the cursor', async () => {
    const h = fixture();
    await h.service.pause('manager', 'source');
    expect(h.jobs.updateMany.mock.calls[0][0]).toMatchObject({
      where: {
        sourceId: 'source',
        workspaceId: 'workspace',
        status: 'RUNNING',
      },
      data: { status: 'PAUSING' },
    });
    expect(h.jobs.updateMany.mock.calls[0][0].data).not.toHaveProperty(
      'beforeId',
    );
  });
});
