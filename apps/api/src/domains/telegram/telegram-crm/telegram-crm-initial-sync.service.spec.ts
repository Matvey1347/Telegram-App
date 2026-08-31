import type {
  TelegramCrmMtprotoDialog,
  TelegramCrmMtprotoHandle,
} from '../../../telegram/shared/telegram-crm-mtproto.types';
import { TelegramCrmInitialSyncService } from './telegram-crm-initial-sync.service';

type ListPrivateDialogs = TelegramCrmMtprotoHandle['listPrivateDialogs'];
type HandleOperation = (
  handle: Pick<TelegramCrmMtprotoHandle, 'listPrivateDialogs'>,
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

describe('TelegramCrmInitialSyncService', () => {
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
        nextCursor: `cursor-${nextId}`,
        exhausted: false,
      });
    });
    const prisma = {
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
});
