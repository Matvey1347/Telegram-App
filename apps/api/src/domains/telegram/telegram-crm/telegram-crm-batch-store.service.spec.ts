import { TelegramCrmBatchStoreService } from './telegram-crm-batch-store.service';
import type { Prisma } from '@prisma/client';
import { TelegramCrmNotificationGroups } from './telegram-crm-notification-groups';

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
      data: expect.objectContaining({
        unreadCount: 0,
        readState: 'READ',
      }) as unknown,
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

  it.each(['history.inboxRead', 'history.outboxRead'] as const)(
    'reconciles a new-message intent on %s even when the prior and final unread counts are zero',
    async (readType) => {
      const sourceKey =
        'account:account-current:conversation:conversation-current';
      const intents = new Set<string>();
      const groups = new TelegramCrmNotificationGroups();
      const tx = {
        telegramCrmConversation: {
          findMany: jest.fn().mockResolvedValue([
            {
              id: 'conversation-current',
              mtprotoAccountId: 'account-current',
              telegramCrmPeerId: 'peer-current',
              contactId: null,
              unreadCount: 0,
              lastReadInboxTelegramMessageId: 41,
              lastReadOutboxTelegramMessageId: 41,
              peer: { telegramUserId: '777' },
              contact: null,
            },
          ]),
          update: jest.fn(),
        },
        telegramCrmMessage: { updateMany: jest.fn() },
        operationsNotification: {
          findMany: jest.fn(() =>
            Promise.resolve(
              intents.size ? [{ recipientMemberId: 'member-current' }] : [],
            ),
          ),
          deleteMany: jest.fn(
            (query: { where: { sourceKey: { in: string[] } } }) => {
              for (const key of query.where.sourceKey.in) intents.delete(key);
              return Promise.resolve({ count: 1 });
            },
          ),
        },
      };
      const prisma = {
        $transaction: jest.fn(
          async (operation: (value: typeof tx) => Promise<unknown>) =>
            operation(tx),
        ),
      };
      const messages = {
        store: jest.fn(() => {
          intents.add(sourceKey);
          return Promise.resolve({
            created: [],
            edited: 0,
            inputs: [],
            notificationIds: ['intent-created-in-this-transaction'],
          });
        }),
        reconcileIncomingNotificationGroups: jest.fn(
          (
            client: Prisma.TransactionClient,
            workspaceId: string,
            reads: {
              conversationId: string;
              contactId: string | null;
              unreadCount: number;
            }[],
          ) => groups.reconcile(client, workspaceId, reads),
        ),
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
        workspaceId: 'workspace-current',
        accountId: 'account-current',
        updates: [
          {
            type: 'message.new',
            message: {
              telegramUserId: '777',
              telegramMessageId: 42,
              direction: 'INBOUND',
              text: 'New reply',
              sentAt: new Date(),
              editedAt: null,
              contentMetadata: null,
            },
          },
          {
            type: readType,
            telegramUserId: '777',
            maxTelegramMessageId: 42,
            stillUnreadCount: 0,
          },
        ],
      });
      expect(messages.store).toHaveBeenCalledTimes(1);
      expect(tx.telegramCrmMessage.updateMany).toHaveBeenCalledTimes(1);
      expect(messages.reconcileIncomingNotificationGroups).toHaveBeenCalledWith(
        tx,
        'workspace-current',
        readType === 'history.inboxRead'
          ? [
              {
                conversationId: 'conversation-current',
                contactId: null,
                unreadCount: 0,
              },
            ]
          : [],
      );
      expect(
        messages.emitNotificationInvalidationsAfterCommit,
      ).toHaveBeenCalledWith(
        'workspace-current',
        readType === 'history.inboxRead' ? ['member-current'] : [],
      );
      expect(intents.has(sourceKey)).toBe(readType !== 'history.inboxRead');
    },
  );
  it('preserves the older-history cursor during a recent-page refresh', async () => {
    const tx = {
      telegramCrmConversation: { findUnique: jest.fn(), update: jest.fn() },
    };
    const store = {
      store: jest.fn().mockResolvedValue({ created: [], edited: 0 }),
      emitAfterCommit: jest.fn(),
    };
    const service = new TelegramCrmBatchStoreService(
      {
        $transaction: async (
          operation: (client: typeof tx) => Promise<unknown>,
        ) => operation(tx),
      } as never,
      {} as never,
      store as never,
    );
    await service.importHistory({
      workspaceId: 'workspace-1',
      accountId: 'account-1',
      conversation: { id: 'conversation-1', contactId: null },
      messages: [],
      nextBeforeTelegramMessageId: 900,
      exhausted: false,
      preserveHistoryCursor: true,
    });
    expect(tx.telegramCrmConversation.findUnique).not.toHaveBeenCalled();
    expect(tx.telegramCrmConversation.update).not.toHaveBeenCalled();
    expect(store.emitAfterCommit).toHaveBeenCalledWith(
      'workspace-1',
      { created: [], edited: 0 },
      'history',
    );
  });
  it('invalidates a history snapshot only after its transaction commits, including metadata-only enrichment', async () => {
    const persisted = {
      created: [],
      edited: 1,
      inputs: [{ conversation: { id: 'conversation', contactId: null } }],
    };
    const messages = {
      store: jest.fn().mockResolvedValue(persisted),
      emitAfterCommit: jest.fn(),
    };
    const tx = {
      telegramCrmConversation: {
        findUnique: jest.fn().mockResolvedValue({
          historyCursorTelegramMessageId: 500,
          historyExhausted: false,
        }),
        update: jest.fn(),
      },
    };
    const prisma = {
      $transaction: jest.fn(
        async (operation: (client: typeof tx) => Promise<unknown>) =>
          operation(tx),
      ),
    };
    const service = new TelegramCrmBatchStoreService(
      prisma as never,
      {} as never,
      messages as never,
    );
    const input = {
      workspaceId: 'workspace',
      accountId: 'account',
      conversation: { id: 'conversation', contactId: null },
      messages: [],
      nextBeforeTelegramMessageId: 500,
      exhausted: false,
    };
    expect(await service.importHistory(input)).toEqual({
      imported: 0,
      edited: 1,
    });
    expect(tx.telegramCrmConversation.update).not.toHaveBeenCalled();
    expect(messages.emitAfterCommit).toHaveBeenCalledWith(
      'workspace',
      persisted,
      'history',
    );
    messages.emitAfterCommit.mockClear();
    prisma.$transaction.mockRejectedValueOnce(new Error('commit failed'));
    await expect(service.importHistory(input)).rejects.toThrow('commit failed');
    expect(messages.emitAfterCommit).not.toHaveBeenCalled();
  });
});
