import type { Prisma } from '@prisma/client';
import type { CrmMessageRow } from './telegram-crm-message.mapper';
import {
  TelegramCrmMessageBatchWriter,
  type CrmMessageBatchInput,
} from './telegram-crm-message-batch-writer.service';

const sentAt = new Date('2026-10-01T12:00:00.000Z');
const context = { workspaceId: 'workspace', accountId: 'account' };
function fixture() {
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
  const tx = {
    $queryRaw: jest.fn().mockResolvedValue([]),
    $executeRaw: jest.fn(),
    telegramCrmDeletedMessage: { findMany: jest.fn().mockResolvedValue([]) },
    telegramCrmMessage: {
      findMany: jest.fn(() => Promise.resolve([{ ...current }])),
      createManyAndReturn: jest.fn().mockResolvedValue([]),
      updateMany: jest.fn(
        ({
          data,
        }: {
          data: Pick<CrmMessageRow, 'text' | 'editedAt' | 'contentMetadata'>;
        }) => {
          Object.assign(current, data);
          return Promise.resolve({ count: 1 });
        },
      ),
      findUniqueOrThrow: jest.fn(() => Promise.resolve({ ...current })),
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
  return { current, tx, events, writer, history };
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
      expect(h.tx.telegramCrmMessage.updateMany).toHaveBeenCalledTimes(1);
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
      expect(h.tx.telegramCrmMessage.updateMany).toHaveBeenCalledTimes(1);
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
      expect(h.tx.telegramCrmMessage.updateMany).not.toHaveBeenCalled();
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
    expect(h.tx.telegramCrmMessage.updateMany).not.toHaveBeenCalled();
  });
});
