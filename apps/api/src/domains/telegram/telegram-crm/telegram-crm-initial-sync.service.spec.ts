import type {
  TelegramCrmMtprotoDialog,
  TelegramCrmMtprotoHandle,
} from '../../../telegram/shared/telegram-crm-mtproto.types';
import { TelegramCrmInitialSyncService } from './telegram-crm-initial-sync.service';

type ListPrivateDialogs = TelegramCrmMtprotoHandle['listPrivateDialogs'];
type HandleOperation = (
  handle: Pick<TelegramCrmMtprotoHandle, 'listPrivateDialogs'> &
    Partial<Pick<TelegramCrmMtprotoHandle, 'getHistory'>>,
) => Promise<unknown>;
type WithAccountHandle = (
  workspaceId: string,
  accountId: string,
  purpose: 'sync' | 'send',
  operation: HandleOperation,
) => Promise<unknown>;
type ImportDialogs = (input: {
  dialogs: TelegramCrmMtprotoDialog[];
}) => Promise<{
  importedPeers: number;
  importedConversations: number;
  importedMessages: number;
}>;

const callArgument = (mock: { mock: { calls: unknown[][] } }): unknown =>
  mock.mock.calls[0]?.[0];

const dialog = (id: number) => ({
  peer: {
    telegramUserId: String(id),
    telegramAccessHash: `hash-${id}`,
    username: `user_${id}`,
    firstName: null,
    lastName: null,
    photoUrl: null,
  },
  telegramDialogId: String(id),
  unreadCount: 0,
  lastMessage: null,
});

const noHistoryCandidates = () => ({
  telegramCrmConversation: { findMany: jest.fn().mockResolvedValue([]) },
});

describe('TelegramCrmInitialSyncService', () => {
  it('emits workspace-visible progress after each page and on completion', async () => {
    const events = { emit: jest.fn() };
    const prisma = {
      ...noHistoryCandidates(),
      telegramCrmAccountSyncState: {
        findFirst: jest.fn().mockResolvedValue(null),
        upsert: jest.fn(),
        updateMany: jest.fn(),
        update: jest.fn(),
      },
    };
    const service = new TelegramCrmInitialSyncService(
      prisma as never,
      {
        require: jest.fn().mockResolvedValue({
          workspaceId: 'workspace-1',
          memberId: 'member-1',
        }),
      } as never,
      {
        withAccountHandle: jest.fn(
          (_workspaceId, _accountId, _purpose, operation) =>
            operation({
              listPrivateDialogs: jest.fn().mockResolvedValue({
                dialogs: [dialog(1)],
                scanned: 1,
                nextCursor: null,
                exhausted: true,
              }),
            }),
        ),
        wakeAccount: jest.fn(),
      } as never,
      {
        importDialogs: jest.fn().mockResolvedValue({
          importedPeers: 1,
          importedConversations: 1,
          importedMessages: 2,
        }),
      } as never,
      events as never,
    );

    await service.run('user-1', 'account-1');

    expect(events.emit.mock.calls.map(([event]) => event.phase)).toEqual([
      'STARTED',
      'RUNNING',
      'COMPLETED',
    ]);
    expect(events.emit).toHaveBeenLastCalledWith(
      expect.objectContaining({
        type: 'sync.progress',
        workspaceId: 'workspace-1',
        accountId: 'account-1',
        ownerMemberId: 'member-1',
        scannedDialogs: 1,
        importedPeers: 1,
        importedConversations: 1,
        importedMessages: 2,
        current: 1,
        total: 1,
      }),
    );
  });

  it('does not invent a dialog total when sync fails before Telegram responds', async () => {
    const events = { emit: jest.fn() };
    const service = new TelegramCrmInitialSyncService(
      {
        telegramCrmAccountSyncState: {
          findFirst: jest.fn().mockResolvedValue(null),
          upsert: jest.fn(),
          updateMany: jest.fn(),
        },
      } as never,
      {
        require: jest.fn().mockResolvedValue({
          workspaceId: 'workspace-1',
          memberId: 'member-1',
        }),
      } as never,
      {
        withAccountHandle: jest.fn().mockRejectedValue(new Error('offline')),
      } as never,
      {} as never,
      events as never,
    );

    await expect(service.run('user-1', 'account-1')).rejects.toThrow('offline');

    expect(events.emit).toHaveBeenLastCalledWith(
      expect.objectContaining({
        phase: 'FAILED',
        current: 0,
        total: 0,
      }),
    );
  });

  it('still emits failed progress and preserves the sync error when failure state persistence fails', async () => {
    const events = { emit: jest.fn() };
    const service = new TelegramCrmInitialSyncService(
      {
        telegramCrmAccountSyncState: {
          findFirst: jest.fn().mockResolvedValue(null),
          upsert: jest.fn(),
          updateMany: jest
            .fn()
            .mockRejectedValue(new Error('database offline')),
        },
      } as never,
      {
        require: jest.fn().mockResolvedValue({
          workspaceId: 'workspace-1',
          memberId: 'member-1',
        }),
      } as never,
      {
        withAccountHandle: jest
          .fn()
          .mockRejectedValue(new Error('MTProto offline')),
      } as never,
      {} as never,
      events as never,
    );

    await expect(service.run('user-1', 'account-1')).rejects.toThrow(
      'MTProto offline',
    );
    expect(events.emit).toHaveBeenLastCalledWith(
      expect.objectContaining({ phase: 'FAILED' }),
    );
  });

  it('syncs only selected connected workspace accounts sequentially', async () => {
    const order: string[] = [];
    const prisma = {
      ...noHistoryCandidates(),
      telegramUserAccountIntegration: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'account-1',
            assignedMember: { id: 'member-1', userId: 'user-1' },
          },
          { id: 'account-2', assignedMember: null },
        ]),
      },
      workspaceMember: {
        findFirst: jest
          .fn()
          .mockResolvedValue({ id: 'owner-1', userId: 'owner-user-1' }),
      },
      telegramCrmAccountSyncState: {
        findFirst: jest.fn().mockResolvedValue(null),
        upsert: jest.fn(),
        updateMany: jest.fn(),
        update: jest.fn(),
      },
    };
    const runtime = {
      withAccountHandle: jest.fn(
        (_workspaceId, accountId, _purpose, operation) => {
          order.push(`start:${accountId}`);
          return operation({
            listPrivateDialogs: jest.fn().mockImplementation(async () => {
              order.push(`finish:${accountId}`);
              return {
                dialogs: [],
                scanned: 0,
                nextCursor: null,
                exhausted: true,
              };
            }),
          });
        },
      ),
      wakeAccount: jest.fn(),
    };
    const service = new TelegramCrmInitialSyncService(
      prisma as never,
      {} as never,
      runtime as never,
      {
        importDialogs: jest.fn().mockResolvedValue({
          importedPeers: 0,
          importedConversations: 0,
          importedMessages: 0,
        }),
      } as never,
    );

    await expect(service.runWorkspace('workspace-1')).resolves.toMatchObject({
      details: { accountsProcessed: 2, accountsFailed: 0 },
    });
    expect(prisma.telegramUserAccountIntegration.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          workspaceId: 'workspace-1',
          crmSyncEnabled: true,
          status: 'connected',
        }),
      }),
    );
    expect(order).toEqual([
      'start:account-1',
      'finish:account-1',
      'start:account-2',
      'finish:account-2',
    ]);
  });

  it('skips a scheduled workspace sync when it has no selected source', async () => {
    const service = new TelegramCrmInitialSyncService(
      {
        telegramUserAccountIntegration: {
          findMany: jest.fn().mockResolvedValue([]),
        },
      } as never,
      {} as never,
      {} as never,
      {} as never,
    );

    await expect(service.runWorkspace('workspace-1')).resolves.toMatchObject({
      skipped: true,
      details: { accountsProcessed: 0 },
    });
  });

  it('starts a fresh scan when a previous initial import is complete', async () => {
    const listPrivateDialogs = jest.fn().mockResolvedValue({
      dialogs: [dialog(1)],
      scanned: 1,
      nextCursor: null,
      exhausted: true,
    });
    const prisma = {
      ...noHistoryCandidates(),
      telegramCrmAccountSyncState: {
        findFirst: jest.fn().mockResolvedValue({
          initialImportStatus: 'COMPLETED',
          initialImportCursor: 'old-cursor',
        }),
        upsert: jest.fn(),
        updateMany: jest.fn(),
        update: jest.fn(),
      },
    };
    const runtime = {
      withAccountHandle: jest.fn(
        (_workspaceId, _accountId, _purpose, operation) =>
          operation({ listPrivateDialogs }),
      ),
      wakeAccount: jest.fn(),
    };
    const service = new TelegramCrmInitialSyncService(
      prisma as never,
      {
        require: jest.fn().mockResolvedValue({
          workspaceId: 'workspace-1',
          memberId: 'member-1',
        }),
      } as never,
      runtime as never,
      {
        importDialogs: jest.fn().mockResolvedValue({
          importedPeers: 1,
          importedConversations: 1,
          importedMessages: 0,
        }),
      } as never,
    );

    await service.run('user-1', 'account-1');

    expect(listPrivateDialogs).toHaveBeenCalledWith(
      expect.objectContaining({ cursor: null }),
    );
  });
  it('bounds imported dialogs without advancing past an unprocessed page', async () => {
    let nextId = 1;
    const listPrivateDialogs = jest.fn<
      ReturnType<ListPrivateDialogs>,
      Parameters<ListPrivateDialogs>
    >(({ limit = 100 }) => {
      const dialogs = Array.from({ length: Math.min(95, limit) }, () =>
        dialog(nextId++),
      );
      return Promise.resolve({
        dialogs,
        scanned: dialogs.length,
        total: 1_500,
        nextCursor: `cursor-${nextId}`,
        exhausted: false,
      });
    });
    const prisma = {
      ...noHistoryCandidates(),
      telegramCrmAccountSyncState: {
        findFirst: jest.fn().mockResolvedValue(null),
        upsert: jest.fn(),
        updateMany: jest.fn(),
        update: jest.fn(),
      },
    };
    const runtime = {
      withAccountHandle: jest.fn<
        ReturnType<WithAccountHandle>,
        Parameters<WithAccountHandle>
      >((_workspaceId, _accountId, _purpose, operation) =>
        operation({ listPrivateDialogs }),
      ),
      wakeAccount: jest.fn(),
    };
    const batchStore = {
      importDialogs: jest.fn<
        ReturnType<ImportDialogs>,
        Parameters<ImportDialogs>
      >(({ dialogs }) =>
        Promise.resolve({
          importedPeers: dialogs.length,
          importedConversations: dialogs.length,
          importedMessages: 0,
        }),
      ),
    };
    const service = new TelegramCrmInitialSyncService(
      prisma as never,
      {
        require: jest.fn().mockResolvedValue({ workspaceId: 'workspace-1' }),
      } as never,
      runtime as never,
      batchStore as never,
    );

    const result = await service.run('user-1', 'account-1');

    expect(result.importedConversations).toBe(1_000);
    expect(result.exhausted).toBe(false);
    expect(listPrivateDialogs).toHaveBeenLastCalledWith(
      expect.objectContaining({ limit: 50 }),
    );
    expect(
      batchStore.importDialogs.mock.calls.at(-1)?.[0].dialogs,
    ).toHaveLength(50);
    expect(runtime.wakeAccount).not.toHaveBeenCalled();
    const progressUpdate = callArgument(
      prisma.telegramCrmAccountSyncState.update,
    );
    expect(progressUpdate).toMatchObject({
      data: { initialImportStatus: 'IN_PROGRESS' },
    });
  });

  it('marks completion and wakes live sync only after Telegram is exhausted', async () => {
    const prisma = {
      ...noHistoryCandidates(),
      telegramCrmAccountSyncState: {
        findFirst: jest.fn().mockResolvedValue(null),
        upsert: jest.fn(),
        updateMany: jest.fn(),
        update: jest.fn(),
      },
    };
    const runtime = {
      withAccountHandle: jest.fn<
        ReturnType<WithAccountHandle>,
        Parameters<WithAccountHandle>
      >((_workspaceId, _accountId, _purpose, operation) =>
        operation({
          listPrivateDialogs: jest
            .fn<
              ReturnType<ListPrivateDialogs>,
              Parameters<ListPrivateDialogs>
            >()
            .mockResolvedValue({
              dialogs: [dialog(1)],
              scanned: 1,
              total: 1,
              nextCursor: null,
              exhausted: true,
            }),
        }),
      ),
      wakeAccount: jest.fn(),
    };
    const service = new TelegramCrmInitialSyncService(
      prisma as never,
      {
        require: jest.fn().mockResolvedValue({ workspaceId: 'workspace-1' }),
      } as never,
      runtime as never,
      {
        importDialogs: jest.fn().mockResolvedValue({
          importedPeers: 1,
          importedConversations: 1,
          importedMessages: 0,
        }),
      } as never,
    );

    await expect(service.run('user-1', 'account-1')).resolves.toMatchObject({
      exhausted: true,
      importedConversations: 1,
    });
    expect(runtime.wakeAccount).toHaveBeenCalledWith(
      'account-1',
      'workspace-1',
    );
    const completedUpdate = callArgument(
      prisma.telegramCrmAccountSyncState.update,
    );
    expect(completedUpdate).toMatchObject({
      data: { initialImportStatus: 'COMPLETED' },
    });
  });

  it('imports the latest 51 Telegram messages once so the first DB page knows whether older messages exist', async () => {
    const messages = Array.from({ length: 51 }, (_, index) => ({
      telegramMessageId: 100 - index,
      telegramUserId: '1',
      direction: 'INBOUND' as const,
      text: `message-${index}`,
      sentAt: new Date(2026, 8, 6, 12, index),
      editedAt: null,
      contentMetadata: null,
    }));
    const prisma = {
      telegramCrmAccountSyncState: {
        findFirst: jest.fn().mockResolvedValue(null),
        upsert: jest.fn(),
        updateMany: jest.fn(),
        update: jest.fn(),
      },
      telegramCrmConversation: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'conversation-1',
            contactId: 'contact-1',
            telegramAccessHash: 'stored-hash',
            peer: { telegramUserId: '1' },
          },
        ]),
      },
    };
    const getHistory = jest.fn().mockResolvedValue({
      messages,
      nextBeforeTelegramMessageId: 49,
      exhausted: false,
    });
    const batchStore = {
      importDialogs: jest.fn().mockResolvedValue({
        importedPeers: 1,
        importedConversations: 1,
        importedMessages: 1,
      }),
      importHistoryBatch: jest
        .fn()
        .mockResolvedValue({ imported: 50, edited: 0 }),
    };
    const service = new TelegramCrmInitialSyncService(
      prisma as never,
      {
        require: jest.fn().mockResolvedValue({
          workspaceId: 'workspace-1',
          memberId: 'member-1',
        }),
      } as never,
      {
        withAccountHandle: jest.fn(
          (_workspaceId, _accountId, _purpose, operation) =>
            operation({
              listPrivateDialogs: jest.fn().mockResolvedValue({
                dialogs: [dialog(1)],
                scanned: 1,
                total: 1,
                nextCursor: null,
                exhausted: true,
              }),
              getHistory,
            }),
        ),
        wakeAccount: jest.fn(),
      } as never,
      batchStore as never,
    );

    await expect(service.run('user-1', 'account-1')).resolves.toMatchObject({
      importedMessages: 51,
    });
    expect(getHistory).toHaveBeenCalledWith({
      telegramUserId: '1',
      telegramAccessHash: 'stored-hash',
      beforeTelegramMessageId: null,
      limit: 51,
    });
    expect(batchStore.importHistoryBatch).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceId: 'workspace-1',
        accountId: 'account-1',
        histories: [
          expect.objectContaining({
            conversation: {
              id: 'conversation-1',
              contactId: 'contact-1',
            },
            messages,
            exhausted: false,
          }),
        ],
      }),
    );
  });
});
