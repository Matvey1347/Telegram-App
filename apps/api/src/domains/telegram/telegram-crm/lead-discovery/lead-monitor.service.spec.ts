import {
  Logger,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { TelegramLeadTransportEvents } from '../../../../telegram/shared/mtproto/telegram-lead-transport-events';
import { TelegramLeadMonitorService } from './lead-monitor.service';
import { TelegramLeadIngestService } from './lead-ingest.service';
import {
  LeadMonitorProof,
  persistLeadGaps,
  type WatchedLeadSource,
} from './lead-monitor-proof';
const source = (index = 1): WatchedLeadSource => ({
  id: `source-${index}`,
  workspaceId: 'workspace',
  accountId: 'account',
  channelId: String(index),
  monitoringActorUserId: 'operator',
  processingReference: 'policy:reviewed-source',
  bindingRevision: 0,
});
const result = {
  received: 1,
  changed: 1,
  unchanged: 0,
  filtered: 0,
  gap: false,
};
function setup(enabled = true, count = 1, live = false) {
  const sources = Array.from({ length: count }, (_, index) =>
    source(index + 1),
  );
  const updateMany = jest.fn().mockResolvedValue({ count });
  const pauseMany = jest
    .fn()
    .mockResolvedValue(sources.map((row) => ({ id: row.id })));
  const tx = {
    $executeRaw: jest.fn().mockResolvedValue(1),
    telegramLeadSource: { updateMany, updateManyAndReturn: pauseMany },
  };
  const prisma = {
    telegramLeadSource: { findMany: jest.fn().mockResolvedValue(sources) },
    $transaction: jest.fn((work: (input: typeof tx) => Promise<unknown>) =>
      work(tx),
    ),
  };
  const ingest = { ingestBatch: jest.fn().mockResolvedValue(result) };
  const transport = { recover: jest.fn().mockResolvedValue(result) };
  const moduleRef = {
    registerRequestByContextId: jest.fn(),
    resolve: jest.fn((token: unknown) =>
      Promise.resolve(token === TelegramLeadIngestService ? ingest : transport),
    ),
  };
  const config = { get: jest.fn().mockReturnValue(enabled ? 'true' : 'false') };
  const events = new TelegramLeadTransportEvents();
  const service = new TelegramLeadMonitorService(
    prisma as never,
    config as never,
    events,
    moduleRef as never,
    { liveAccountIds: () => (live ? ['account'] : []) } as never,
  );
  return {
    service,
    prisma,
    updateMany,
    pauseMany,
    tx,
    ingest,
    transport,
    events,
    moduleRef,
  };
}
const newPost = (events: TelegramLeadTransportEvents, id: number) =>
  events.emit({
    type: 'channel',
    workspaceId: 'workspace',
    accountId: 'account',
    event: {
      type: 'post.new',
      pts: id,
      ptsCount: 1,
      post: {
        channelId: '1',
        messageId: id,
        text: 'Synthetic business material',
        publishedAt: new Date('2026-11-01T00:00:00Z'),
        editedAt: null,
      },
    },
  });
describe('event-only bounded Discovery monitoring', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });
  it('disabled discovery performs no startup query, timer or event work', async () => {
    const { service, prisma, events, ingest } = setup(false);
    await service.onApplicationBootstrap();
    newPost(events, 1);
    await jest.advanceTimersByTimeAsync(1000);
    expect(prisma.telegramLeadSource.findMany).not.toHaveBeenCalled();
    expect(ingest.ingestBatch).not.toHaveBeenCalled();
    expect(jest.getTimerCount()).toBe(0);
    service.onApplicationShutdown();
  });
  it('1000 sources load once and create no periodic idle query/write', async () => {
    const { service, prisma, updateMany } = setup(true, 1000);
    await service.onApplicationBootstrap();
    expect(prisma.telegramLeadSource.findMany).toHaveBeenCalledTimes(1);
    expect(updateMany).toHaveBeenCalledTimes(1); // Meaningful startup proof invalidation.
    await jest.advanceTimersByTimeAsync(86_400_000);
    expect(prisma.telegramLeadSource.findMany).toHaveBeenCalledTimes(1);
    expect(updateMany).toHaveBeenCalledTimes(1);
    expect(jest.getTimerCount()).toBe(0);
    service.onApplicationShutdown();
  });
  it('coalesces duplicate events into one authenticated batch and stops its flush timer', async () => {
    const { service, events, ingest, moduleRef } = setup();
    await service.onApplicationBootstrap();
    newPost(events, 1);
    newPost(events, 1);
    expect(ingest.ingestBatch).not.toHaveBeenCalled();
    await jest.advanceTimersByTimeAsync(50);
    expect(ingest.ingestBatch).toHaveBeenCalledTimes(1);
    expect(ingest.ingestBatch).toHaveBeenCalledWith('operator', 'workspace', [
      expect.objectContaining({
        sourceId: 'source-1',
        material: expect.objectContaining({
          externalMessageId: '1',
        }) as unknown,
      }),
    ]);
    expect(moduleRef.registerRequestByContextId).toHaveBeenCalledWith(
      expect.objectContaining({
        headers: { 'x-workspace-id': 'workspace' },
        user: { sub: 'operator' },
      }),
      expect.anything(),
    );
    expect(jest.getTimerCount()).toBe(0);
    service.onApplicationShutdown();
  });
  it('bounds overflow at1000 identifiers and100 per batch without creating extra connections', async () => {
    const { service, events, ingest, transport } = setup();
    await service.onApplicationBootstrap();
    for (let id = 1; id <= 1001; id++) newPost(events, id);
    await jest.runAllTimersAsync();
    expect(ingest.ingestBatch).toHaveBeenCalledTimes(10);
    const calls = ingest.ingestBatch.mock.calls as unknown as Array<
      [string, string, unknown[]]
    >;
    expect(calls.every((call) => call[2].length <= 100)).toBe(true);
    expect(transport.recover).not.toHaveBeenCalled();
    expect(jest.getTimerCount()).toBe(0);
    service.onApplicationShutdown();
  });
  it('caps automatic recovery at20 sources and invalidates every excess source proof', async () => {
    const { service, transport, updateMany } = setup(true, 25, true);
    await service.onApplicationBootstrap();
    for (let index = 0; index < 100; index++) await Promise.resolve();
    await jest.runAllTimersAsync();
    expect(transport.recover).toHaveBeenCalledTimes(20);
    const calls = updateMany.mock.calls as unknown as Array<
      [{ where: { id: { in: string[] } }; data: { coverageState: string } }]
    >;
    expect(
      calls.some(
        ([input]) =>
          input.where.id.in.includes('source-25') &&
          input.data.coverageState === 'GAPPED',
      ),
    ).toBe(true);
    service.onApplicationShutdown();
  });
  it('pauses a denied source once and evicts it rather than querying again on every new post', async () => {
    const { service, events, ingest, pauseMany } = setup();
    await service.onApplicationBootstrap();
    ingest.ingestBatch.mockResolvedValueOnce({
      ...result,
      filtered: 1,
      blockedSourceIds: ['source-1'],
    });
    newPost(events, 1);
    await jest.runAllTimersAsync();
    expect(pauseMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          monitoringState: 'PAUSED',
          lastErrorCode: 'LEAD_PROCESSING_REVIEW_REQUIRED',
        }) as unknown,
      }),
    );
    newPost(events, 2);
    await jest.runAllTimersAsync();
    expect(ingest.ingestBatch).toHaveBeenCalledTimes(1);
    service.onApplicationShutdown();
  });
  it('stops monitoring after the initiating operator loses permission', async () => {
    jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    const { service, events, ingest } = setup();
    await service.onApplicationBootstrap();
    ingest.ingestBatch.mockRejectedValue(
      new ForbiddenException('permission revoked'),
    );
    newPost(events, 1);
    await jest.runAllTimersAsync();
    newPost(events, 2);
    await jest.runAllTimersAsync();
    expect(ingest.ingestBatch).toHaveBeenCalledTimes(1);
    service.onApplicationShutdown();
  });
  it('does not leak rejected source content into logs or retry a failed capture forever', async () => {
    const warn = jest
      .spyOn(Logger.prototype, 'warn')
      .mockImplementation(() => undefined);
    const { service, events, ingest } = setup();
    await service.onApplicationBootstrap();
    ingest.ingestBatch.mockRejectedValue(
      new Error('PRIVATE MATERIAL MUST NOT BE LOGGED'),
    );
    newPost(events, 1);
    await jest.runAllTimersAsync();
    expect(ingest.ingestBatch).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(warn.mock.calls)).not.toContain('PRIVATE');
    expect(jest.getTimerCount()).toBe(0);
    service.onApplicationShutdown();
  });
});
describe('monotonic in-memory coverage uncertainty', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });
  it('manual recovery clears only the marker it actually started against', () => {
    const proof = new LeadMonitorProof(),
      events = new TelegramLeadTransportEvents();
    events.stream.subscribe((event) => proof.receive(event));
    proof.mark(source());
    const finish = events.beginRecovery({
      workspaceId: 'workspace',
      accountId: 'account',
      sourceId: 'source-1',
    });
    proof.mark(source());
    proof.gaps.clear(); // The newer marker was persisted while the older RPC was pending.
    finish(true);
    expect(proof.gaps.has('source-1')).toBe(true);
    expect(proof.uncertain.has('source-1')).toBe(true);
    const freshFinish = events.beginRecovery({
      workspaceId: 'workspace',
      accountId: 'account',
      sourceId: 'source-1',
    });
    freshFinish(true);
    expect(proof.uncertain.has('source-1')).toBe(false);
    expect(proof.gaps.size).toBe(0);
  });
  it('rechecks a pending gap after acquiring the workspace lock and protects newer DB proofs', async () => {
    let current = true;
    const updateMany = jest.fn();
    const tx = {
      $executeRaw: jest.fn().mockImplementation(() => {
        current = false;
        return Promise.resolve(1);
      }),
      telegramLeadSource: { updateMany },
    };
    const prisma = {
      $transaction: (work: (value: typeof tx) => Promise<void>) => work(tx),
    };
    const markedAt = new Date('2026-11-01T01:00:00Z');
    await persistLeadGaps(
      prisma as never,
      [{ ...source(), gapMarkedAt: markedAt }],
      () => current,
    );
    expect(updateMany).not.toHaveBeenCalled();
    await persistLeadGaps(prisma as never, [
      { ...source(), gapMarkedAt: markedAt },
    ]);
    expect(updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          AND: [
            {
              OR: [
                {
                  id: 'source-1',
                  accountId: 'account',
                  channelId: '1',
                  processingReference: 'policy:reviewed-source',
                  monitoringActorUserId: 'operator',
                  bindingRevision: 0,
                  OR: [{ coverageTo: null }, { coverageTo: { lte: markedAt } }],
                },
              ],
            },
          ],
        }) as unknown,
      }),
    );
  });
  it('mutes quota-exhausted capture until the next UTC day without a wake timer', async () => {
    jest.setSystemTime(new Date('2026-11-01T12:00:00Z'));
    const { service, events, ingest } = setup();
    await service.onApplicationBootstrap();
    ingest.ingestBatch.mockRejectedValueOnce(
      new BadRequestException('LEAD_DAILY_POST_QUOTA'),
    );
    jest.spyOn(Logger.prototype, 'warn').mockImplementation();
    newPost(events, 1);
    await jest.advanceTimersByTimeAsync(50);
    newPost(events, 2);
    await jest.advanceTimersByTimeAsync(1000);
    expect(ingest.ingestBatch).toHaveBeenCalledTimes(1);
    expect(jest.getTimerCount()).toBe(0);
    jest.setSystemTime(new Date('2026-11-02T00:00:01Z'));
    newPost(events, 3);
    await jest.advanceTimersByTimeAsync(50);
    expect(ingest.ingestBatch).toHaveBeenCalledTimes(2);
    service.onApplicationShutdown();
  });

  it('does not replace a queued newer deletion with an older material event', async () => {
    const { service, events, ingest } = setup();
    await service.onApplicationBootstrap();
    events.emit({
      type: 'channel',
      workspaceId: 'workspace',
      accountId: 'account',
      event: {
        type: 'post.deleted',
        channelId: '1',
        messageIds: [7],
        pts: 10,
        ptsCount: 1,
      },
    });
    newPost(events, 7);
    await jest.advanceTimersByTimeAsync(50);
    expect(ingest.ingestBatch).toHaveBeenCalledWith('operator', 'workspace', [
      expect.objectContaining({
        pts: 10,
        material: expect.objectContaining({
          externalMessageId: '7',
          deleted: true,
        }) as unknown,
      }),
    ]);
    service.onApplicationShutdown();
  });
});
