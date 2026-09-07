import { TelegramCrmBatchStoreService } from './telegram-crm-batch-store.service';

describe('TelegramCrmBatchStoreService', () => {
  it('does not dispatch after-commit events when the persistence transaction rolls back', async () => {
    const prisma = {
      $transaction: jest.fn().mockRejectedValue(new Error('rollback')),
    };
    const messages = {
      emitAfterCommit: jest.fn(),
      emitReadsAfterCommit: jest.fn(),
      emitPeerMetadataAfterCommit: jest.fn(),
    };
    const service = new TelegramCrmBatchStoreService(
      prisma as never,
      {} as never,
      messages as never,
    );

    await expect(
      service.applyUpdates({
        workspaceId: 'workspace-1',
        accountId: 'account-1',
        updates: [],
      }),
    ).rejects.toThrow('rollback');
    expect(messages.emitAfterCommit).not.toHaveBeenCalled();
    expect(messages.emitReadsAfterCommit).not.toHaveBeenCalled();
    expect(messages.emitPeerMetadataAfterCommit).not.toHaveBeenCalled();
  });

  it('reconciles Telegram unread state when the read marker stays the same', async () => {
    const conversation = {
      id: 'conversation-1',
      telegramCrmPeerId: 'peer-1',
      contactId: 'contact-1',
      unreadCount: 2,
      lastInboundAt: new Date('2026-09-06T10:00:00.000Z'),
      lastOutboundAt: null,
      lastMessageAt: new Date('2026-09-06T10:00:00.000Z'),
      lastReadInboxTelegramMessageId: 42,
      lastReadOutboxTelegramMessageId: null,
      peer: {
        telegramUserId: '777',
        username: 'ada',
        firstName: 'Ada',
        lastName: null,
        photoUrl: null,
      },
      contact: { ownerMemberId: 'member-1' },
    };
    const tx = {
      telegramCrmConversation: {
        findMany: jest.fn().mockResolvedValue([conversation]),
        update: jest.fn(),
      },
      telegramCrmPeer: { findMany: jest.fn() },
      telegramCrmMessage: { updateMany: jest.fn() },
    };
    const prisma = {
      $transaction: jest.fn(
        async (operation: (client: typeof tx) => Promise<unknown>) =>
          operation(tx),
      ),
    };
    const messages = {
      store: jest.fn().mockResolvedValue({
        created: [],
        edited: 0,
        inputs: [],
      }),
      reconcileIncomingNotificationGroups: jest
        .fn()
        .mockResolvedValue(['member-1']),
      emitAfterCommit: jest.fn(),
      emitReadsAfterCommit: jest.fn(),
      emitPeerMetadataAfterCommit: jest.fn(),
      emitNotificationInvalidationsAfterCommit: jest.fn(),
    };
    const service = new TelegramCrmBatchStoreService(
      prisma as never,
      {} as never,
      messages as never,
    );

    await service.applyUpdates({
      workspaceId: 'workspace-1',
      accountId: 'account-1',
      updates: [
        {
          type: 'history.inboxRead',
          telegramUserId: '777',
          maxTelegramMessageId: 42,
          stillUnreadCount: 0,
        },
      ],
    });

    expect(tx.telegramCrmConversation.update).toHaveBeenCalledWith({
      where: { id: 'conversation-1' },
      data: expect.objectContaining({ unreadCount: 0, readState: 'READ' }),
    });
    expect(messages.reconcileIncomingNotificationGroups).toHaveBeenCalledWith(
      tx,
      'workspace-1',
      [
        {
          conversationId: 'conversation-1',
          contactId: 'contact-1',
          unreadCount: 0,
        },
      ],
    );
    expect(
      messages.emitNotificationInvalidationsAfterCommit,
    ).toHaveBeenCalledWith('workspace-1', ['member-1']);

    tx.telegramCrmConversation.update.mockClear();
    messages.reconcileIncomingNotificationGroups.mockClear();
    await service.applyUpdates({
      workspaceId: 'workspace-1',
      accountId: 'account-1',
      updates: [
        {
          type: 'history.inboxRead',
          telegramUserId: '777',
          maxTelegramMessageId: 42,
          stillUnreadCount: 2,
        },
      ],
    });

    expect(tx.telegramCrmConversation.update).not.toHaveBeenCalled();
    expect(messages.reconcileIncomingNotificationGroups).toHaveBeenCalledWith(
      tx,
      'workspace-1',
      [],
    );
  });
});
