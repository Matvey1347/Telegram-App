import { TelegramCrmDialogBatchWriter } from './telegram-crm-dialog-batch-writer.service';

const dialog = {
  peer: {
    telegramUserId: '42',
    telegramAccessHash: 'access-hash',
    username: 'alice',
    firstName: 'Alice',
    lastName: null,
    photoUrl: null,
  },
  telegramDialogId: '42',
  unreadCount: 7,
  lastMessage: null,
};

const peerMetadata = {
  telegramUserId: '42',
  username: 'alice',
  firstName: 'Alice',
  lastName: null,
  photoUrl: null,
};
const peer = { id: 'peer-1', telegramUserId: '42', contactId: null };
const conversation = (accountId: string) => ({
  id: `conversation-${accountId}`,
  telegramCrmPeerId: 'peer-1',
  telegramAccessHash: 'access-hash',
  unreadCount: 7,
  contactId: null,
  lastMessageAt: null,
  lastInboundAt: null,
  lastOutboundAt: null,
  contact: null,
});

describe('TelegramCrmDialogBatchWriter', () => {
  it('reuses one workspace Peer across accounts, keeps exact unread, and never auto-creates a Contact', async () => {
    const tx = {
      telegramCrmPeer: {
        findMany: jest
          .fn()
          .mockResolvedValueOnce([])
          .mockResolvedValueOnce([peer])
          .mockResolvedValueOnce([peerMetadata])
          .mockResolvedValueOnce([peer]),
        createMany: jest.fn().mockResolvedValue({ count: 1 }),
        update: jest.fn(),
      },
      telegramCrmConversation: {
        createMany: jest.fn().mockResolvedValue({ count: 1 }),
        findMany: jest
          .fn()
          .mockResolvedValueOnce([conversation('account-1')])
          .mockResolvedValueOnce([conversation('account-2')]),
        update: jest.fn(),
      },
    };
    const prisma = {
      $transaction: jest.fn(
        async (operation: (value: typeof tx) => Promise<unknown>) =>
          operation(tx),
      ),
    };
    const messages = {
      store: jest
        .fn()
        .mockResolvedValue({ created: [], edited: 0, inputs: [] }),
      emitAfterCommit: jest.fn(),
    };
    const writer = new TelegramCrmDialogBatchWriter(
      prisma as never,
      messages as never,
    );
    const advanceCheckpoint = jest.fn();

    await writer.store({
      workspaceId: 'workspace-1',
      accountId: 'account-1',
      dialogs: [dialog],
      advanceCheckpoint,
    });
    await writer.store({
      workspaceId: 'workspace-1',
      accountId: 'account-2',
      dialogs: [dialog],
      advanceCheckpoint,
    });

    expect(tx.telegramCrmPeer.createMany).toHaveBeenCalledTimes(1);
    expect(tx.telegramCrmPeer.createMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: [
          expect.objectContaining({
            workspaceId: 'workspace-1',
            telegramUserId: '42',
          }),
        ],
      }),
    );
    expect(tx.telegramCrmConversation.createMany).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        data: [
          expect.objectContaining({
            telegramCrmPeerId: 'peer-1',
            contactId: null,
            mtprotoAccountId: 'account-1',
            unreadCount: 7,
            readState: 'UNREAD',
          }),
        ],
      }),
    );
    expect(tx.telegramCrmConversation.createMany).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        data: [
          expect.objectContaining({
            telegramCrmPeerId: 'peer-1',
            contactId: null,
            mtprotoAccountId: 'account-2',
            unreadCount: 7,
            readState: 'UNREAD',
          }),
        ],
      }),
    );
    expect(tx.telegramCrmConversation.update).not.toHaveBeenCalled();
    expect(messages.store).toHaveBeenCalledWith(
      tx,
      expect.objectContaining({ workspaceId: 'workspace-1' }),
      [],
      'snapshot',
    );
  });
});
