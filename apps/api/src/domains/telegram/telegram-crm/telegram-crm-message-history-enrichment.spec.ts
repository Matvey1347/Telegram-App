import type { Prisma } from '@prisma/client';
import type { CrmMessageRow } from './telegram-crm-message.mapper';
import {
  TelegramCrmMessageBatchWriter,
  type CrmMessageBatchInput,
} from './telegram-crm-message-batch-writer.service';

const sentAt = new Date('2026-10-01T12:00:00.000Z');
const context = { workspaceId: 'workspace', accountId: 'account' };
function fixture(count = 1) {
  const current: CrmMessageRow = {
    id: 'stored-message',
    workspaceId: context.workspaceId,
    mtprotoAccountId: context.accountId,
    conversationId: 'conversation',
    telegramMessageId: '501',
    telegramMessageIdNumeric: 501,
    clientIdempotencyKey: 'ai:draft:2',
    direction: 'OUTBOUND',
    origin: 'MANUAL',
    sentByMemberId: 'member',
    text: null,
    contentMetadata: {
      aiDraftId: 'draft',
      aiDraftRevision: 2,
      manualRequestHash: 'receipt',
      requestReplyToMessageId: 'original',
    },
    sentAt,
    editedAt: null,
    deletedAt: null,
    readState: 'UNKNOWN',
    deliveryState: 'SENT',
    createdAt: sentAt,
  };
  const rows = Array.from({ length: count }, (_, index) =>
    index === 0
      ? current
      : {
          ...current,
          id: `stored-message-${index}`,
          telegramMessageId: String(501 + index),
          telegramMessageIdNumeric: 501 + index,
        },
  );
  const byId = new Map(rows.map((row) => [row.id, row]));
  const casLosers = new Set<string>();
  const tx = {
    $queryRaw: jest.fn((query: Prisma.Sql) => {
      if (!query.sql.includes('UPDATE "TelegramCrmMessage"'))
        return Promise.resolve([]);
      const values = query.values;
      const updated: Array<{ id: string }> = [];
      for (let offset = 0; offset < values.length - 2; offset += 5) {
        const [id, expectedEditedAt, text, editedAt, metadata] = values.slice(
          offset,
          offset + 5,
        );
        const row = byId.get(String(id));
        if (
          !row ||
          row.deletedAt ||
          casLosers.has(row.id) ||
          (row.editedAt?.getTime() ?? null) !==
            (expectedEditedAt instanceof Date
              ? expectedEditedAt.getTime()
              : null)
        )
          continue;
        if (
          values.at(-2) !== row.workspaceId ||
          values.at(-1) !== row.mtprotoAccountId
        )
          continue;
        row.text = text as string | null;
        row.editedAt = editedAt as Date | null;
        row.contentMetadata = JSON.parse(String(metadata)) as Prisma.JsonObject;
        updated.push({ id: row.id });
      }
      return Promise.resolve(updated);
    }),
    $executeRaw: jest.fn(),
    telegramCrmDeletedMessage: { findMany: jest.fn().mockResolvedValue([]) },
    telegramCrmMessage: {
      findMany: jest.fn((query: { where?: { id?: { in?: string[] } } }) =>
        Promise.resolve(
          rows
            .filter(
              (row) =>
                !query.where?.id?.in || query.where.id.in.includes(row.id),
            )
            .map((row) => ({ ...row })),
        ),
      ),
      createManyAndReturn: jest.fn().mockResolvedValue([]),
    },
  };
  const events = { emit: jest.fn() };
  const writer = new TelegramCrmMessageBatchWriter(events as never);
  const history = (
    contentMetadata: Prisma.JsonObject,
  ): CrmMessageBatchInput => ({
    conversation: { id: current.conversationId, contactId: null },
    message: {
      telegramMessageId: 501,
      telegramUserId: 'peer',
      direction: 'OUTBOUND',
      text: null,
      sentAt,
      editedAt: null,
      contentMetadata,
    },
  });
  const writes = () =>
    tx.$queryRaw.mock.calls.filter(([query]) =>
      query.sql.includes('UPDATE "TelegramCrmMessage"'),
    );
  return { current, rows, casLosers, tx, events, writer, history, writes };
}

describe('Authoritative CRM history enrichment', () => {
  it.each([null, {}])(
    'replaces empty legacy metadata %s with its fetched attachment',
    async (previous) => {
      const h = fixture();
      h.current.contentMetadata = previous;
      h.current.origin = 'TELEGRAM_SYNC';
      h.current.sentByMemberId = null;
      h.current.clientIdempotencyKey = null;
      const metadata = {
        mediaType: 'MessageMediaPhoto',
        media: {
          kind: 'image',
          fileName: 'photo.jpg',
          mimeType: 'image/jpeg',
          size: 1234,
        },
      };
      const incoming = h.history(metadata);
      expect(
        await h.writer.store(h.tx as never, context, [incoming], 'history'),
      ).toMatchObject({ created: [], edited: 1 });
      expect(h.current.contentMetadata).toEqual({
        ...metadata,
        telegramText: true,
      });
      expect(
        await h.writer.store(h.tx as never, context, [incoming], 'history'),
      ).toMatchObject({ edited: 0 });
      expect(h.writes()).toHaveLength(1);
    },
  );
  it.each([
    {
      mediaType: 'MessageMediaPhoto',
      media: {
        kind: 'image',
        fileName: 'photo.jpg',
        mimeType: 'image/jpeg',
        size: 1234,
      },
    },
    {
      mediaType: 'MessageMediaDocument',
      media: {
        kind: 'file',
        fileName: 'brief.pdf',
        mimeType: 'application/pdf',
        size: 5678,
      },
    },
  ])(
    'enriches an existing unedited $mediaType once while preserving manual provenance',
    async (metadata) => {
      const h = fixture();
      const incoming = h.history({
        ...metadata,
        manualRequestHash: 'untrusted-replacement',
      });
      const result = await h.writer.store(
        h.tx as never,
        context,
        [incoming],
        'history',
      );
      expect(result).toMatchObject({ created: [], edited: 1 });
      expect(h.current).toMatchObject({
        origin: 'MANUAL',
        sentByMemberId: 'member',
        clientIdempotencyKey: 'ai:draft:2',
        contentMetadata: {
          ...metadata,
          telegramText: true,
          aiDraftId: 'draft',
          aiDraftRevision: 2,
          manualRequestHash: 'receipt',
          requestReplyToMessageId: 'original',
        },
      });
      expect(
        h.tx.telegramCrmMessage.createManyAndReturn,
      ).not.toHaveBeenCalled();
      expect(h.tx.$executeRaw).not.toHaveBeenCalled();
      const repeat = await h.writer.store(
        h.tx as never,
        context,
        [incoming],
        'history',
      );
      expect(repeat).toMatchObject({ created: [], edited: 0, inputs: [] });
      expect(h.writes()).toHaveLength(1);
    },
  );

  it.each([null, new Date('2026-10-01T13:00:00.000Z')])(
    'rejects an older history edit version %s',
    async (editedAt) => {
      const h = fixture();
      h.current.editedAt = new Date('2026-10-02T12:00:00.000Z');
      h.current.text = 'Newer authoritative text';
      const incoming = h.history({
        mediaType: 'MessageMediaPhoto',
        media: { kind: 'image' },
      });
      incoming.message.editedAt = editedAt;
      const result = await h.writer.store(
        h.tx as never,
        context,
        [incoming],
        'history',
      );
      expect(result).toMatchObject({ created: [], edited: 0 });
      expect(h.writes()).toHaveLength(0);
      expect(h.current.text).toBe('Newer authoritative text');
    },
  );

  it('still ignores an unedited live replay instead of treating it as a history snapshot', async () => {
    const h = fixture();
    const result = await h.writer.store(
      h.tx as never,
      context,
      [h.history({ mediaType: 'MessageMediaPhoto' })],
      'live',
    );
    expect(result.edited).toBe(0);
    expect(h.writes()).toHaveLength(0);
  });
  it('enriches 100 existing messages in one scoped bulk write and one read, then repeats without writes', async () => {
    const h = fixture(100);
    const messages = h.rows.map((row) => {
      const incoming = h.history({
        mediaType: 'MessageMediaPhoto',
        media: { kind: 'image' },
      });
      incoming.message.telegramMessageId = row.telegramMessageIdNumeric!;
      return incoming;
    });
    const result = await h.writer.store(
      h.tx as never,
      context,
      messages,
      'history',
    );
    expect(result).toMatchObject({ created: [], edited: 100 });
    expect(h.tx.$queryRaw).toHaveBeenCalledTimes(2); // conversation lock + one UPDATE
    expect(h.tx.telegramCrmMessage.findMany).toHaveBeenCalledTimes(2); // preflight + authoritative results
    const sql = h.writes()[0][0].sql;
    expect(sql).toContain('message."workspaceId" =');
    expect(sql).toContain('message."mtprotoAccountId" =');
    expect(sql).toContain('message."deletedAt" IS NULL');
    expect(sql).toContain('IS NOT DISTINCT FROM incoming."expectedEditedAt"');
    expect(
      await h.writer.store(h.tx as never, context, messages, 'history'),
    ).toMatchObject({ edited: 0, inputs: [] });
    expect(h.writes()).toHaveLength(1);
  });
  it('returns only bulk CAS winners while skipping stale, deleted and tombstoned messages', async () => {
    const h = fixture(5);
    h.rows[1].editedAt = new Date('2026-10-02T12:00:00.000Z');
    h.rows[2].deletedAt = new Date('2026-10-02T12:00:00.000Z');
    h.tx.telegramCrmDeletedMessage.findMany.mockResolvedValue([
      { telegramMessageId: 504 },
    ]);
    h.casLosers.add(h.rows[4].id);
    const messages = h.rows.map((row) => {
      const incoming = h.history({ mediaType: 'MessageMediaPhoto' });
      incoming.message.telegramMessageId = row.telegramMessageIdNumeric!;
      return incoming;
    });
    const result = await h.writer.store(
      h.tx as never,
      context,
      messages,
      'history',
    );
    expect(result.edited).toBe(1);
    expect(result.editedMessages?.map((row) => row.id)).toEqual([h.current.id]);
    expect(
      result.inputs.map((input) => input.message.telegramMessageId),
    ).toEqual([501]);
    expect(h.rows[4].contentMetadata).not.toHaveProperty('mediaType');
  });
});
