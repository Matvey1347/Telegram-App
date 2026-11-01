import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../../prisma/prisma.service';
import { TelegramLeadPolicy } from './lead-policy.service';
import {
  TelegramLeadIngestService,
  type LeadIngestEvent,
} from './lead-ingest.service';
import { leadSource, leadObservation } from './lead.spec-fixtures';
import { leadHash } from './lead-normalization';
import { leadCoverageUpdate } from './lead-ingest-coverage';
function fixture(
  sources = [leadSource()],
  existing: ReturnType<typeof leadObservation>[] = [],
) {
  const tx = {
    $queryRaw: jest.fn((sql: Prisma.Sql) => {
      void sql;
      return Promise.resolve([]);
    }),
    telegramChannel: { findMany: jest.fn().mockResolvedValue([]) },
    $executeRaw: jest.fn((sql: Prisma.Sql) => Promise.resolve(sql.sql ? 1 : 0)),
    telegramLeadSource: { findMany: jest.fn().mockResolvedValue(sources) },
    telegramLeadObservation: {
      findMany: jest.fn().mockResolvedValue(existing),
      count: jest.fn().mockResolvedValue(0),
    },
  };
  const database = {
    $transaction: jest.fn(
      (operation: (client: typeof tx) => Promise<unknown>) => operation(tx),
    ),
  };
  const policy = {
    access: jest.fn().mockResolvedValue({ workspaceId: 'workspace' }),
    assertProcessing: jest.fn(
      (source: ReturnType<typeof leadSource>, _mode: string, active = true) => {
        if (
          ['DISABLED', 'ACCESS_LOST'].includes(source.monitoringState) ||
          (active && source.monitoringState !== 'ACTIVE')
        )
          throw new Error('blocked');
      },
    ),
  };
  const service = new TelegramLeadIngestService(
    database as unknown as PrismaService,
    policy as unknown as TelegramLeadPolicy,
  );
  const event = (sourceId = 'source', id = '1'): LeadIngestEvent => ({
    sourceId,
    material: {
      externalMessageId: id,
      text: 'Для замовлення пишіть @business_contact',
      publishedAt: new Date().toISOString(),
    },
    pts: 101,
    ptsCount: 1,
  });
  return { tx, database, policy, service, event };
}
describe('Lead bounded conditional ingestion', () => {
  it('batches100mixedsources into one source read, one dedup read and two bulk writes', async () => {
    const h = fixture(
      Array.from({ length: 100 }, (_, index) =>
        leadSource({ id: `source_${index}` }),
      ),
    );
    const events = Array.from({ length: 100 }, (_, index) =>
      h.event(`source_${index}`, String(index + 1)),
    );
    expect(
      await h.service.ingestBatch('manager', 'workspace', events),
    ).toMatchObject({ received: 100, changed: 100, filtered: 0 });
    expect(h.tx.telegramLeadSource.findMany).toHaveBeenCalledTimes(1);
    expect(h.tx.telegramLeadObservation.findMany).toHaveBeenCalledTimes(1);
    expect(h.tx.telegramLeadObservation.count).toHaveBeenCalledTimes(1);
    expect(
      h.tx.$executeRaw.mock.calls.map(([query]) =>
        query.sql.includes('INSERT INTO "TelegramLeadObservation"'),
      ),
    ).toEqual([false, true, false]);
    expect(h.tx.$executeRaw).toHaveBeenCalledTimes(3);
  });
  it('performs no idle query and no write for duplicate unchanged hash/status/pts', async () => {
    const empty = fixture();
    expect(
      await empty.service.ingestBatch('manager', 'workspace', []),
    ).toMatchObject({ received: 0, changed: 0 });
    expect(empty.database.$transaction).not.toHaveBeenCalled();
    const publishedAt = new Date(),
      text = 'Для замовлення пишіть @business_contact';
    const existing = leadObservation({
      publishedAt,
      text,
      contentHash: leadHash([text, publishedAt.toISOString()]),
    });
    const h = fixture(
      [
        leadSource({
          channelPts: 101,
          checkpointMessageId: 1,
          coverageState: 'CONTINUOUS',
        }),
      ],
      [existing],
    );
    expect(
      await h.service.ingestBatch('manager', 'workspace', [
        {
          sourceId: 'source',
          material: {
            externalMessageId: '1',
            text,
            publishedAt: publishedAt.toISOString(),
          },
          pts: 101,
          ptsCount: 1,
        },
      ]),
    ).toMatchObject({ changed: 0, unchanged: 1 });
    expect(h.tx.$executeRaw).toHaveBeenCalledTimes(1);
    expect(h.tx.telegramLeadObservation.count).not.toHaveBeenCalled();
  });
  it('reports blocked sources separately from harmless content filters', async () => {
    const h = fixture([leadSource({ monitoringState: 'DISABLED' })]);
    expect(
      await h.service.ingestBatch('manager', 'workspace', [h.event()]),
    ).toMatchObject({ blockedSourceIds: ['source'] });
    const organic = fixture();
    const event = organic.event();
    event.material.text = '🎉';
    expect(
      (await organic.service.ingestBatch('manager', 'workspace', [event]))
        .blockedSourceIds,
    ).toBeUndefined();
  });
  it('never drops potential commercial text because the word advertisement is absent', async () => {
    const h = fixture();
    expect(
      await h.service.ingestBatch('manager', 'workspace', [h.event()]),
    ).toMatchObject({ changed: 1, filtered: 0 });
  });
  it('blocks wrong workspace, source gates, daily quota overflow and mismatched message URLs', async () => {
    const h = fixture();
    await expect(
      h.service.ingestBatch('manager', 'other', [h.event()]),
    ).rejects.toThrow('LEAD_WORKSPACE_MISMATCH');
    const disabled = fixture([leadSource({ monitoringState: 'DISABLED' })]);
    expect(
      await disabled.service.ingestBatch('manager', 'workspace', [
        disabled.event(),
      ]),
    ).toMatchObject({ changed: 0, filtered: 1 });
    h.tx.telegramLeadObservation.count.mockResolvedValue(10000);
    await expect(
      h.service.ingestBatch('manager', 'workspace', [h.event()]),
    ).rejects.toThrow('LEAD_DAILY_POST_QUOTA');
    expect(h.tx.$executeRaw).toHaveBeenCalledTimes(1);
    const bad = fixture();
    await expect(
      bad.service.ingestBatch('manager', 'workspace', [
        {
          ...bad.event(),
          material: {
            ...bad.event().material,
            messageUrl: 'https://t.me/other_channel/1',
          },
        },
      ]),
    ).rejects.toThrow('LEAD_MESSAGE_URL_SOURCE_MISMATCH');
  });
  it('updates edited evidence atomically and preserves deletion copies without creating unknown deleted posts', async () => {
    const h = fixture(
      [leadSource()],
      [leadObservation({ expiresAt: new Date(0) })],
    );
    expect(
      await h.service.ingestBatch('manager', 'workspace', [h.event()]),
    ).toMatchObject({ changed: 1 });
    const insert = h.tx.$executeRaw.mock.calls.find(([query]) =>
      query.sql.includes('ON CONFLICT'),
    )?.[0];
    expect(insert?.sql).toContain('"classificationOperationId"');
    expect(insert?.sql).toContain('"candidateId"');
    expect(insert?.sql).not.toContain('"observedAt"=');
    expect(insert?.sql).toContain(
      '"expiresAt"=CASE WHEN "TelegramLeadObservation"."contentHash"<>EXCLUDED."contentHash" THEN EXCLUDED."expiresAt" ELSE "TelegramLeadObservation"."expiresAt" END',
    );
    const deleted = fixture();
    expect(
      await deleted.service.ingestBatch('manager', 'workspace', [
        {
          ...deleted.event(),
          material: { ...deleted.event().material, deleted: true, text: '' },
        },
      ]),
    ).toMatchObject({ changed: 0, filtered: 1 });
  });
  it('does not resurrect a deleted post from a delayed older edit', async () => {
    const h = fixture(
      [leadSource({ channelPts: 110, checkpointMessageId: 1 })],
      [leadObservation({ originalStatus: 'DELETED' })],
    );
    expect(
      await h.service.ingestBatch('manager', 'workspace', [h.event()]),
    ).toMatchObject({ changed: 0, unchanged: 1 });
    expect(h.tx.$executeRaw).toHaveBeenCalledTimes(1);
  });
  it('rejects stale transport bindings and checkpoint recovery before any post mutation', async () => {
    const h = fixture([leadSource({ channelPts: 111 })]);
    expect(
      await h.service.ingestBatch(
        'manager',
        'workspace',
        [{ ...h.event(), pts: undefined }],
        false,
        { sourceId: 'source', startingPts: 100, pts: 110, complete: true },
      ),
    ).toMatchObject({ changed: 0, gap: true });
    expect(h.tx.telegramLeadObservation.findMany).not.toHaveBeenCalled();
    expect(h.tx.$executeRaw).toHaveBeenCalledTimes(1);
    const changed = fixture();
    const event = changed.event();
    event.expectedTransport = {
      accountId: 'old-account',
      channelId: 'other-channel',
      processingReference: 'policy:old',
      monitoringActorUserId: 'manager',
    };
    const result = await changed.service.ingestBatch('manager', 'workspace', [
      event,
    ]);
    expect(result).toMatchObject({ changed: 0, gap: true, filtered: 1 });
    expect(result.blockedSourceIds).toBeUndefined();
    expect(changed.tx.telegramLeadObservation.findMany).not.toHaveBeenCalled();
  });
  it('awaits bounded source row locks then rereads the binding before accepting transport material', async () => {
    const h = fixture();
    const original = leadSource();
    let release: () => void = () => undefined;
    const acquired = new Promise<void>((resolve) => {
      release = resolve;
    });
    h.tx.$queryRaw.mockImplementation(async (sql: Prisma.Sql) => {
      expect(sql.sql).toContain('ORDER BY id FOR UPDATE');
      expect(sql.values).toEqual(['workspace', 'source']);
      await acquired;
      return [];
    });
    const event = h.event();
    event.expectedTransport = {
      accountId: original.accountId,
      channelId: original.channelId,
      processingReference: original.processingReference,
      monitoringActorUserId: original.monitoringActorUserId,
    };
    const pending = h.service.ingestBatch('manager', 'workspace', [event]);
    await Promise.resolve();
    await Promise.resolve();
    expect(h.tx.telegramLeadSource.findMany).not.toHaveBeenCalled();
    h.tx.telegramLeadSource.findMany.mockResolvedValue([
      leadSource({ processingReference: 'policy:changed' }),
    ]);
    release();
    expect(await pending).toMatchObject({ changed: 0, filtered: 1, gap: true });
    expect(h.tx.telegramLeadObservation.findMany).not.toHaveBeenCalled();
    expect(h.tx.$executeRaw).toHaveBeenCalledTimes(1);
  });
  it('blocks owned catalog channels without the explicit own-channel flag in one batch query', async () => {
    const h = fixture();
    h.tx.telegramChannel.findMany.mockResolvedValue([
      {
        telegramChatId: h.event().sourceId === 'source' ? '12345' : '',
        username: null,
      },
    ] as never);
    const source = leadSource();
    h.tx.telegramChannel.findMany.mockResolvedValue([
      { telegramChatId: source.channelId, username: source.username },
    ] as never);
    expect(
      await h.service.ingestBatch('manager', 'workspace', [h.event()]),
    ).toMatchObject({ changed: 0, blockedSourceIds: ['source'] });
    expect(h.tx.telegramChannel.findMany).toHaveBeenCalledTimes(1);
  });
  it('commits empty recovery proof in the same locked transaction and refuses filtered recovery proof', async () => {
    const h = fixture();
    expect(
      await h.service.ingestBatch('manager', 'workspace', [], false, {
        sourceId: 'source',
        startingPts: 100,
        pts: 100,
        complete: true,
      }),
    ).toMatchObject({ gap: false, changed: 0 });
    expect(h.tx.$executeRaw).toHaveBeenCalledTimes(2);
    expect(h.tx.telegramLeadObservation.findMany).not.toHaveBeenCalled();
    const filtered = fixture();
    const event = filtered.event();
    event.material.text = '🎉';
    expect(
      await filtered.service.ingestBatch(
        'manager',
        'workspace',
        [event],
        false,
        { sourceId: 'source', startingPts: 100, pts: 101, complete: true },
      ),
    ).toMatchObject({ gap: true, filtered: 1 });
  });
});
describe('Lead channel-pts coverage proof', () => {
  it('never regresses live111 to stale recovery110 or upgrades stale proof', () => {
    const source = leadSource({ channelPts: 111, coverageState: 'GAPPED' });
    const result = leadCoverageUpdate(source, [], false, {
      sourceId: source.id,
      startingPts: 100,
      pts: 110,
      complete: true,
    });
    expect(result).toMatchObject({ gap: true, sql: undefined });
  });
  it('uses event capture time rather than delayed database time and never regresses last observed time', () => {
    const captured = new Date('2026-10-31T10:00:00Z'),
      later = new Date('2026-10-31T12:00:00Z');
    const source = leadSource({ lastObservedAt: later });
    const event: LeadIngestEvent = {
      sourceId: source.id,
      material: {
        externalMessageId: '1',
        text: 'Матеріал',
        publishedAt: captured.toISOString(),
      },
      pts: 101,
      ptsCount: 1,
      capturedAt: captured,
    };
    const result = leadCoverageUpdate(
      source,
      [event],
      true,
      undefined,
      new Date('2026-10-31T15:00:00Z'),
    );
    expect(result.sql?.values).toContain(captured);
    expect(result.sql?.values).toContain(later);
  });
  it('requires contiguous pts and retains gaps until verified recovery', () => {
    const source = leadSource({
      channelPts: 100,
      coverageState: 'CONTINUOUS',
      coverageFrom: new Date(Date.now() - 86400000),
    });
    const event: LeadIngestEvent = {
      sourceId: source.id,
      material: {
        externalMessageId: '5',
        text: 'Text',
        publishedAt: new Date().toISOString(),
      },
      pts: 105,
      ptsCount: 1,
    };
    expect(leadCoverageUpdate(source, [event], false).gap).toBe(true);
    expect(
      leadCoverageUpdate(source, [{ ...event, pts: 101 }], false).gap,
    ).toBe(false);
  });
});
