import { Subject } from 'rxjs';
import type { PrismaService } from '../../../../prisma/prisma.service';
import type { ModuleRef } from '@nestjs/core';
import type { ConfigService } from '@nestjs/config';
import type {
  TelegramLeadTransportEvents,
  TelegramLeadTransportEvent,
} from '../../../../telegram/shared/mtproto/telegram-lead-transport-events';
import { TelegramLeadHistoryWorker } from './lead-history-worker.service';
import { TelegramLeadTransportService } from './lead-transport.service';
import { leadSource } from './lead.spec-fixtures';

type Row = {
  workspaceId: string;
  sourceId: string;
  actorUserId: string;
  status: string;
  cutoffAt: Date;
  beforeId: number | null;
  pages: number;
  received: number;
  hasGaps: boolean;
  lastErrorCode: string | null;
  leaseToken: string | null;
  leaseUntil: Date | null;
  completedAt: Date | null;
};
function fixture() {
  const row: Row = {
    workspaceId: 'workspace',
    sourceId: 'source',
    actorUserId: 'user',
    status: 'RUNNING',
    cutoffAt: new Date('2026-08-01T00:00:00Z'),
    beforeId: null,
    pages: 0,
    received: 0,
    hasGaps: false,
    lastErrorCode: null,
    leaseToken: null,
    leaseUntil: null,
    completedAt: null,
  };
  const events = new Subject<TelegramLeadTransportEvent>();
  const scan = jest.fn();
  const source = leadSource();
  const jobs = {
    findUnique: jest.fn(async () => ({ ...row })),
    findMany: jest.fn(async () => [
      { workspaceId: row.workspaceId, sourceId: row.sourceId },
    ]),
    updateMany: jest.fn(
      async ({
        where,
        data,
      }: {
        where: Record<string, any>;
        data: Record<string, any>;
      }) => {
        if (
          where.workspaceId !== row.workspaceId ||
          where.sourceId !== row.sourceId
        )
          return { count: 0 };
        if (typeof where.status === 'string' && where.status !== row.status)
          return { count: 0 };
        if (where.status?.in && !where.status.in.includes(row.status))
          return { count: 0 };
        if (where.leaseToken && where.leaseToken !== row.leaseToken)
          return { count: 0 };
        if (
          where.leaseUntil?.gt &&
          (!row.leaseUntil || row.leaseUntil <= where.leaseUntil.gt)
        )
          return { count: 0 };
        if (
          where.leaseUntil?.lte &&
          (!row.leaseUntil || row.leaseUntil > where.leaseUntil.lte)
        )
          return { count: 0 };
        if (where.OR && row.leaseUntil && row.leaseUntil > new Date())
          return { count: 0 };
        for (const [key, value] of Object.entries(data)) {
          if (typeof value === 'object' && value && 'increment' in value)
            (row as any)[key] += (value as { increment: number }).increment;
          else (row as any)[key] = value;
        }
        return { count: 1 };
      },
    ),
  };
  const tx = {
    telegramLeadHistoryJob: jobs,
    telegramLeadSource: { findMany: jest.fn(async () => [source]) },
    telegramChannel: { findMany: jest.fn().mockResolvedValue([]) },
    $executeRaw: jest.fn().mockResolvedValue(0),
    $queryRaw: jest.fn().mockResolvedValue([{ id: 'source' }]),
  };
  const prisma = {
    telegramLeadHistoryJob: jobs,
    $transaction: jest.fn((run: (arg: typeof tx) => Promise<unknown>) =>
      run(tx),
    ),
  };
  const moduleRef = {
    registerRequestByContextId: jest.fn(),
    resolve: jest.fn(async (kind: unknown) =>
      kind === TelegramLeadTransportService
        ? { scan }
        : { assertProcessing: jest.fn() },
    ),
  };
  const config = {
    get: jest.fn((key: string): string | undefined =>
      key === 'INTERNAL_LEAD_DISCOVERY_ENABLED' ? 'true' : undefined,
    ),
  };
  const worker = new TelegramLeadHistoryWorker(
    prisma as unknown as PrismaService,
    moduleRef as unknown as ModuleRef,
    { stream: events.asObservable() } as TelegramLeadTransportEvents,
    config as unknown as ConfigService,
  );
  return { row, scan, jobs, worker, events, config, source, tx };
}
async function until(check: () => boolean) {
  for (let i = 0; i < 100; i++) {
    if (check()) return;
    await new Promise<void>((resolve) => setImmediate(resolve));
  }
  throw new Error('condition not met');
}
const page = (
  before: number | null,
  hasMore: boolean,
  reachedCutoff = false,
) => ({
  received: 50,
  changed: 50,
  unchanged: 0,
  filtered: 0,
  gap: false,
  nextBeforeId: before,
  hasMore,
  reachedCutoff,
  historySourceSnapshot: {
    accountId: 'account',
    channelId: '12345',
    processingReference: 'policy:source',
    monitoringActorUserId: 'manager',
    bindingRevision: 0,
  },
});
describe('bounded history collection worker', () => {
  it('keeps history recovery idle during manual acceptance', async () => {
    const h = fixture();
    h.config.get.mockImplementation((key: string) =>
      key === 'INTERNAL_LEAD_DISCOVERY_ENABLED'
        ? 'true'
        : key === 'INTERNAL_LEAD_DISCOVERY_RECOVERY_MODE'
          ? 'manual'
          : undefined,
    );
    await h.worker.onApplicationBootstrap();
    h.worker.wake('workspace', 'source');
    expect(h.jobs.findMany).not.toHaveBeenCalled();
    expect(h.scan).not.toHaveBeenCalled();
    h.worker.onApplicationShutdown();
  });
  it('does not query or register listeners when the feature is disabled', async () => {
    const h = fixture();
    h.config.get.mockReturnValue('false');
    await h.worker.onApplicationBootstrap();
    h.worker.wake('workspace', 'source');
    expect(h.jobs.findMany).not.toHaveBeenCalled();
    expect(h.jobs.findUnique).not.toHaveBeenCalled();
    h.worker.onApplicationShutdown();
  });
  it('processes multiple 50-post pages through the same lease and stops at the 90-day boundary', async () => {
    const h = fixture();
    h.scan
      .mockResolvedValueOnce(page(100, true))
      .mockResolvedValueOnce(page(50, true))
      .mockResolvedValueOnce(page(1, true, true));
    h.worker.wake('workspace', 'source');
    await until(() => h.row.status === 'COMPLETED');
    expect(h.scan).toHaveBeenCalledTimes(3);
    expect(h.row.pages).toBe(3);
    expect(h.row.received).toBe(150);
    expect(h.scan.mock.calls[1][2]).toMatchObject({
      beforeId: 100,
      cutoffAt: h.row.cutoffAt,
      historyLeaseToken: expect.any(String),
    });
    expect(h.scan.mock.calls[2][2].historyLeaseToken).toBe(
      h.scan.mock.calls[0][2].historyLeaseToken,
    );
    h.worker.onApplicationShutdown();
  });
  it('pauses after an admitted page and does not start another page', async () => {
    const h = fixture();
    let complete!: (value: unknown) => void;
    h.scan.mockImplementation(
      () =>
        new Promise((resolve) => {
          complete = resolve;
        }),
    );
    h.worker.wake('workspace', 'source');
    await until(() => h.scan.mock.calls.length === 1);
    h.row.status = 'PAUSING';
    complete(page(100, true));
    await until(() => h.row.status === 'PAUSED');
    expect(h.row.beforeId).toBe(100);
    expect(h.row.pages).toBe(1);
    expect(h.scan).toHaveBeenCalledTimes(1);
    h.worker.onApplicationShutdown();
  });
  it('never advances a cursor when access was revoked after the RPC', async () => {
    const h = fixture();
    h.scan.mockResolvedValue({
      ...page(100, true),
      blockedSourceIds: ['source'],
      filtered: 50,
    });
    h.worker.wake('workspace', 'source');
    await until(() => h.row.status === 'FAILED');
    expect(h.row.lastErrorCode).toBe('LEAD_HISTORY_ACCESS_REVOKED');
    expect(h.row.hasGaps).toBe(true);
    expect(h.row.beforeId).toBeNull();
    expect(h.row.pages).toBe(0);
    h.worker.onApplicationShutdown();
  });
  it('records a gap when posts are filtered during a completed historical run', async () => {
    const h = fixture();
    h.scan.mockResolvedValue({ ...page(null, false), filtered: 1 });
    h.worker.wake('workspace', 'source');
    await until(() => h.row.status === 'COMPLETED');
    expect(h.row.hasGaps).toBe(true);
    h.worker.onApplicationShutdown();
  });
  it('pauses without advancing when a source snapshot changed during the RPC', async () => {
    const h = fixture();
    h.scan.mockResolvedValue({
      ...page(100, true),
      filtered: 50,
      gap: true,
      historyFenceLost: true,
    });
    h.worker.wake('workspace', 'source');
    await until(() => h.row.status === 'PAUSED');
    expect(h.row.beforeId).toBeNull();
    expect(h.row.pages).toBe(0);
    expect(h.row.hasGaps).toBe(true);
    expect(h.row.lastErrorCode).toBe('LEAD_HISTORY_SOURCE_CHANGED');
    h.worker.onApplicationShutdown();
  });
  it('continues historical pagination when coverage has a gap but the source fence remains valid', async () => {
    const h = fixture();
    h.scan.mockResolvedValueOnce({
      ...page(100, true),
      gap: true,
      historyFenceLost: false,
    });
    h.scan.mockResolvedValueOnce(page(null, false));
    h.worker.wake('workspace', 'source');
    await until(() => h.row.status === 'COMPLETED');
    expect(h.row.pages).toBe(2);
    expect(h.row.hasGaps).toBe(true);
    h.worker.onApplicationShutdown();
  });
  it('locks and rechecks the source before completing even an empty page', async () => {
    const h = fixture();
    h.source.accountId = 'new-account';
    h.scan.mockResolvedValue(page(null, false));
    h.worker.wake('workspace', 'source');
    await until(() => h.row.status === 'PAUSED');
    expect(h.row.beforeId).toBeNull();
    expect(h.row.pages).toBe(0);
    expect(h.row.lastErrorCode).toBe('LEAD_HISTORY_SOURCE_CHANGED');
    h.worker.onApplicationShutdown();
  });
  it('does not complete an empty page when the channel becomes owned without approval', async () => {
    const h = fixture();
    h.tx.telegramChannel.findMany.mockResolvedValue([
      { telegramChatId: '-10012345', username: null },
    ]);
    h.scan.mockResolvedValue(page(null, false));
    h.worker.wake('workspace', 'source');
    await until(() => h.row.status === 'PAUSED');
    expect(h.row.pages).toBe(0);
    expect(h.row.lastErrorCode).toBe('LEAD_HISTORY_SOURCE_CHANGED');
    h.worker.onApplicationShutdown();
  });
  it('latches a reconnect event arriving while an unavailable runtime call is in flight', async () => {
    const h = fixture();
    let reject!: (error: Error) => void;
    h.scan
      .mockImplementationOnce(
        () =>
          new Promise((_resolve, fail) => {
            reject = fail;
          }),
      )
      .mockResolvedValueOnce(page(null, false));
    await h.worker.onApplicationBootstrap();
    await until(() => h.scan.mock.calls.length === 1);
    h.events.next({
      workspaceId: 'workspace',
      accountId: 'account',
      type: 'connected',
    });
    await until(() => h.jobs.findMany.mock.calls.length >= 2);
    reject(new Error('LEAD_EXISTING_LIVE_ACCOUNT_REQUIRED'));
    await until(() => h.row.status === 'COMPLETED');
    expect(h.scan).toHaveBeenCalledTimes(2);
    h.worker.onApplicationShutdown();
  });
  it('pauses an expired lease after an RPC failure without advancing the cursor', async () => {
    const h = fixture();
    h.scan.mockImplementation(async () => {
      h.row.leaseUntil = new Date(Date.now() - 1);
      throw new Error('delayed RPC');
    });
    h.worker.wake('workspace', 'source');
    await until(() => h.row.status === 'PAUSED');
    expect(h.row.lastErrorCode).toBe('LEAD_HISTORY_LEASE_EXPIRED');
    expect(h.row.beforeId).toBeNull();
    expect(h.row.leaseToken).toBeNull();
    h.worker.onApplicationShutdown();
  });
  it('does not overwrite a new owner when an old worker returns after expiry', async () => {
    const h = fixture();
    h.scan.mockImplementation(async () => {
      h.row.leaseToken = 'new-owner';
      h.row.leaseUntil = new Date(Date.now() + 60_000);
      throw new Error('old worker');
    });
    h.worker.wake('workspace', 'source');
    await until(() =>
      h.jobs.updateMany.mock.calls.some(
        ([call]) => call.data.lastErrorCode === 'LEAD_HISTORY_LEASE_EXPIRED',
      ),
    );
    expect(h.row.status).toBe('RUNNING');
    expect(h.row.leaseToken).toBe('new-owner');
    h.worker.onApplicationShutdown();
  });
});
