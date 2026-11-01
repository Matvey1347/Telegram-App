const containing = (value: Record<string, unknown>): unknown =>
  expect.objectContaining(value);
import { applyCrmReadSnapshot } from './telegram-crm-chat-read-snapshot';
const conversation = { id: 'conversation', workspaceId: 'workspace' };
function setup() {
  const tx = {
    $queryRaw: jest.fn(),
    telegramCrmConversation: {
      findFirst: jest.fn().mockResolvedValue({
        unreadCount: 2,
        lastReadInboxTelegramMessageId: 10,
        unreadSnapshotTopMessageId: 20,
      }),
      updateMany: jest.fn(),
    },
    telegramCrmMessage: {
      count: jest.fn().mockResolvedValue(0),
      updateMany: jest.fn(),
    },
  };
  return { tx };
}
describe('applyCrmReadSnapshot', () => {
  it('uses authoritative unread for deletion after history rows were persisted READ', async () => {
    const { tx } = setup();
    const result = await applyCrmReadSnapshot(tx as never, conversation, {
      unreadCount: 1,
      readInboxMaxId: 10,
      topMessageId: 20,
    });
    expect(result.unreadCount).toBe(1);
    expect(tx.telegramCrmConversation.updateMany).toHaveBeenCalledWith(
      containing({
        data: containing({
          unreadCount: 1,
          unreadSnapshotTopMessageId: 20,
        }),
      }),
    );
  });
  it('preserves queued newer local messages committed after remote snapshot top', async () => {
    const { tx } = setup();
    tx.telegramCrmMessage.count.mockResolvedValue(1);
    const result = await applyCrmReadSnapshot(
      tx as never,
      conversation,
      { unreadCount: 1, readInboxMaxId: 10, topMessageId: 19 },
      [20],
    );
    expect(result.unreadCount).toBe(2);
    expect(tx.telegramCrmMessage.count).toHaveBeenCalledWith({
      where: {
        workspaceId: 'workspace',
        conversationId: 'conversation',
        deletedAt: null,
        direction: 'INBOUND',
        readState: 'UNREAD',
        telegramMessageIdNumeric: { gt: 19 },
      },
    });
  });
  it('does not overwrite a newer read boundary with old snapshot', async () => {
    const { tx } = setup();
    const result = await applyCrmReadSnapshot(tx as never, conversation, {
      unreadCount: 4,
      readInboxMaxId: 8,
      topMessageId: 21,
    });
    expect(result).toEqual({ unreadCount: 2, changed: false });
    expect(tx.telegramCrmConversation.updateMany).not.toHaveBeenCalled();
    expect(tx.telegramCrmMessage.count).not.toHaveBeenCalled();
  });
  it('avoids SQL writes for unchanged snapshot', async () => {
    const { tx } = setup();
    expect(
      await applyCrmReadSnapshot(tx as never, conversation, {
        unreadCount: 2,
        readInboxMaxId: 10,
        topMessageId: 20,
      }),
    ).toEqual({ unreadCount: 2, changed: false });
    expect(tx.telegramCrmConversation.updateMany).not.toHaveBeenCalled();
    expect(tx.telegramCrmMessage.updateMany).not.toHaveBeenCalled();
  });
  it('advances read boundary and watermark while keeping previous higher watermark', async () => {
    const { tx } = setup();
    await applyCrmReadSnapshot(tx as never, conversation, {
      unreadCount: 0,
      readInboxMaxId: 18,
      topMessageId: 19,
    });
    expect(tx.telegramCrmConversation.updateMany).toHaveBeenCalledWith(
      containing({
        data: {
          unreadCount: 0,
          readState: 'READ',
          unreadSnapshotPts: 0,
          lastReadInboxTelegramMessageId: 18,
          unreadSnapshotTopMessageId: 20,
        },
      }),
    );
    expect(tx.telegramCrmMessage.updateMany).toHaveBeenCalledWith(
      containing({
        where: containing({
          telegramMessageIdNumeric: { lte: 18 },
        }),
        data: { readState: 'READ' },
      }),
    );
  });
  it('a delayed older Telegram pts cannot restore deleted unread with the same read boundary', async () => {
    const { tx } = setup();
    tx.telegramCrmConversation.findFirst.mockResolvedValue({
      unreadCount: 1,
      lastReadInboxTelegramMessageId: 10,
      unreadSnapshotTopMessageId: 20,
      unreadSnapshotPts: 80,
    });
    await expect(
      applyCrmReadSnapshot(tx as never, conversation, {
        pts: 79,
        unreadCount: 2,
        readInboxMaxId: 10,
        topMessageId: 20,
      }),
    ).resolves.toEqual({ unreadCount: 1, changed: false });
    expect(tx.telegramCrmMessage.count).not.toHaveBeenCalled();
    expect(tx.telegramCrmConversation.updateMany).not.toHaveBeenCalled();
  });
});
