import { TelegramLeadMetadataDiagnostics } from './lead-metadata-diagnostics.service';
import { leadSource } from './lead.spec-fixtures';

function fixture() {
  const source = leadSource();
  const policy = {
    prisma: {
      telegramLeadObservation: {
        findFirst: jest.fn(),
        findMany: jest.fn().mockResolvedValue([]),
      },
      telegramLeadHistoryJob: {
        findUnique: jest.fn().mockResolvedValue({
          cutoffAt: new Date('2026-08-01T00:00:00Z'),
          status: 'COMPLETED',
        }),
      },
    },
    source: jest.fn().mockResolvedValue(source),
    assertProcessing: jest.fn(),
    account: jest.fn(),
    refresh: jest.fn(),
  };
  const history = jest.fn().mockResolvedValue({
    items: [
      {
        text: 'private content',
        metadata: {
          complete: false,
          incompleteReasons: [
            'UNSUPPORTED_ENTITY',
            'MEDIA_CONTENT_UNAVAILABLE',
          ],
          unsupportedEntityTypes: ['MessageEntityBold'],
          mediaType: 'PHOTO',
        },
      },
      {
        text: 'another post',
        metadata: { complete: true, incompleteReasons: [], mediaType: null },
      },
      { text: 'unknown metadata' },
    ],
    hasMore: true,
    nextBeforeId: 123,
  });
  const readPhoto = jest.fn();
  const runtime = {
    withLiveAccountHandle: jest.fn(
      (
        _w: string,
        _a: string,
        cb: (handle: {
          leadDiscovery: {
            history: typeof history;
            readPhoto: typeof readPhoto;
          };
        }) => Promise<unknown>,
      ) => cb({ leadDiscovery: { history, readPhoto } }),
    ),
  };
  const transport = {
    scan: jest.fn().mockResolvedValue({ received: 1, hasMore: false }),
  };
  return {
    source,
    policy,
    history,
    readPhoto,
    runtime,
    transport,
    service: new TelegramLeadMetadataDiagnostics(
      policy as never,
      runtime as never,
      transport as never,
    ),
  };
}

describe('metadata diagnostics', () => {
  it('checks one photo without AI or a database write and wipes its bytes', async () => {
    const h = fixture();
    const publishedAt = new Date('2026-10-01T12:00:00Z');
    const data = Buffer.from([255, 216, 255, 1]);
    h.policy.prisma.telegramLeadObservation.findFirst
      .mockResolvedValueOnce({
        id: 'observation',
        externalMessageId: '42',
        text: 'caption',
        publishedAt,
        editedAt: null,
        targetEvidence: [],
        contentHash: 'hash',
      })
      .mockResolvedValueOnce({ id: 'observation' });
    h.readPhoto.mockResolvedValue({
      data,
      mime: 'image/jpeg',
      post: { text: 'caption', publishedAt, editedAt: null },
    });
    expect(
      await h.service.checkPhoto('manager', 'source', 'observation'),
    ).toEqual({ available: true, mime: 'image/jpeg', bytes: 4 });
    expect(data.equals(Buffer.alloc(4))).toBe(true);
    expect(h.readPhoto).toHaveBeenCalledTimes(1);
  });
  it('rejects changed content and still wipes the image', async () => {
    const h = fixture();
    const publishedAt = new Date('2026-10-01T12:00:00Z');
    const data = Buffer.from([255, 216, 255, 1]);
    h.policy.prisma.telegramLeadObservation.findFirst.mockResolvedValue({
      id: 'observation',
      externalMessageId: '42',
      text: 'caption',
      publishedAt,
      editedAt: null,
      targetEvidence: [],
      contentHash: 'hash',
    });
    h.readPhoto.mockResolvedValue({
      data,
      mime: 'image/jpeg',
      post: { text: 'changed', publishedAt, editedAt: null },
    });
    await expect(
      h.service.checkPhoto('manager', 'source', 'observation'),
    ).rejects.toThrow('LEAD_MEDIA_POST_CHANGED');
    expect(data.equals(Buffer.alloc(4))).toBe(true);
  });
  it('refreshes only within the existing job cutoff without modifying its checkpoint', async () => {
    const h = fixture();
    await h.service.refresh('manager', 'source', { beforeId: 456, limit: 50 });
    expect(h.transport.scan).toHaveBeenCalledWith('manager', 'source', {
      beforeId: 456,
      limit: 50,
      cutoffAt: new Date('2026-08-01T00:00:00Z'),
    });
    expect(
      h.policy.prisma.telegramLeadHistoryJob.findUnique,
    ).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          sourceId_workspaceId: {
            sourceId: 'source',
            workspaceId: 'workspace',
          },
        },
      }),
    );
  });
  it('does not refresh while a history job is active', async () => {
    const h = fixture();
    h.policy.prisma.telegramLeadHistoryJob.findUnique.mockResolvedValue({
      cutoffAt: new Date(),
      status: 'RUNNING',
    });
    await expect(h.service.refresh('manager', 'source', {})).rejects.toThrow(
      'LEAD_HISTORY_IN_PROGRESS',
    );
    expect(h.transport.scan).not.toHaveBeenCalled();
  });
  it('returns bounded aggregate reasons without message content', async () => {
    const h = fixture();
    const result = await h.service.sample('manager', 'source', 456);
    expect(result).toEqual({
      count: 3,
      complete: 1,
      reasons: {
        UNSUPPORTED_ENTITY: 1,
        MEDIA_CONTENT_UNAVAILABLE: 1,
        METADATA_UNAVAILABLE: 1,
      },
      entityTypes: { MessageEntityBold: 1 },
      mediaTypes: { PHOTO: 1 },
      hasMore: true,
      nextBeforeId: 123,
      historyCoverage: {
        eligible: 0,
        matched: 0,
        filtered: 0,
        reachedCutoff: false,
      },
    });
    expect(JSON.stringify(result)).not.toContain('private content');
    expect(h.history).toHaveBeenCalledWith(
      h.source.channelId,
      expect.objectContaining({ limit: 50, beforeId: 456 }),
    );
    expect(h.policy.assertProcessing).toHaveBeenCalledWith(
      h.source,
      'ingest',
      false,
    );
  });
  it('compares eligible in-window message identities without exposing contents or writes', async () => {
    const h = fixture();
    h.history.mockResolvedValueOnce({
      items: [
        {
          messageId: 17,
          publishedAt: new Date('2026-08-02T00:00:00Z'),
          text: 'private',
          metadata: { complete: true, incompleteReasons: [], mediaType: null },
        },
        {
          messageId: 18,
          publishedAt: new Date('2026-08-02T00:00:00Z'),
          text: 'missing',
          metadata: { complete: true, incompleteReasons: [], mediaType: null },
        },
        {
          messageId: 19,
          publishedAt: new Date('2026-07-31T00:00:00Z'),
          text: 'old',
          metadata: { complete: true, incompleteReasons: [], mediaType: null },
        },
      ] as never,
      hasMore: false,
      nextBeforeId: null as never,
    });
    h.policy.prisma.telegramLeadObservation.findMany.mockResolvedValueOnce([
      { externalMessageId: '17' },
    ]);
    const result = await h.service.sample('manager', 'source');
    expect(result.historyCoverage).toEqual({
      eligible: 2,
      matched: 1,
      filtered: 0,
      reachedCutoff: true,
    });
    expect(JSON.stringify(result)).not.toContain('private');
    expect(
      h.policy.prisma.telegramLeadObservation.findMany,
    ).toHaveBeenCalledTimes(1);
  });
  it('rejects changed bindings after the Telegram read', async () => {
    const h = fixture();
    h.policy.source.mockResolvedValueOnce(h.source).mockResolvedValueOnce({
      ...h.source,
      bindingRevision: h.source.bindingRevision + 1,
    });
    await expect(h.service.sample('manager', 'source')).rejects.toThrow(
      'LEAD_HISTORY_SOURCE_CHANGED',
    );
  });
  it('does not open Telegram without an eligible source', async () => {
    const h = fixture();
    h.policy.assertProcessing.mockImplementation(() => {
      throw new Error('LEAD_PROCESSING_NOT_APPROVED');
    });
    await expect(h.service.sample('manager', 'source')).rejects.toThrow(
      'LEAD_PROCESSING_NOT_APPROVED',
    );
    expect(h.runtime.withLiveAccountHandle).not.toHaveBeenCalled();
  });
});
