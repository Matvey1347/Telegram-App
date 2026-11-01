import { Prisma } from '@prisma/client';
import { syncCrmDialogFolders } from './telegram-crm-folder-sync';

function fixture(count = 2) {
  const folders = Array.from({ length: count }, (_, index) => ({
    id: `f${index + 1}`,
    telegramFolderId: index + 1,
    workspaceId: 'w',
    mtprotoAccountId: 'a',
    name: `Folder ${index + 1}`,
    color: null,
    emojiPresentation: null,
    excludeRead: false,
    isActive: true,
  }));
  const memberships = [
    { conversationId: 'c1', folderId: 'f1' },
    { conversationId: 'c2', folderId: 'f2' },
  ];
  const tx = {
    $executeRaw: jest.fn().mockResolvedValue(0),
    telegramCrmFolder: {
      findMany: jest.fn().mockResolvedValue(folders),
      createMany: jest.fn(),
      updateMany: jest.fn(),
    },
    telegramAdvertiserTag: { findMany: jest.fn().mockResolvedValue([]) },
    telegramCrmConversationFolder: {
      findMany: jest
        .fn()
        .mockImplementation(({ where }) =>
          Promise.resolve(
            memberships.filter((row) =>
              where.conversationId.in.includes(row.conversationId),
            ),
          ),
        ),
      deleteMany: jest.fn(),
      createMany: jest.fn(),
    },
  };
  const dialog = (userId: string, extra: Record<string, unknown>) =>
    ({ peer: { telegramUserId: userId }, ...extra }) as any;
  const run = (dialogs: any[], extra = {}) =>
    syncCrmDialogFolders(
      tx as unknown as Prisma.TransactionClient,
      { workspaceId: 'w', accountId: 'a', dialogs, ...extra },
      new Map([
        ['u1', 'c1'],
        ['u2', 'c2'],
      ]),
    );
  return { tx, run, dialog };
}

describe('canonical CRM folder reconciliation', () => {
  it('preserves snapshots absent from a partial page and undefined recovery metadata', async () => {
    const { tx, run, dialog } = fixture();
    await run([dialog('u1', {})]);
    expect(tx.$executeRaw).not.toHaveBeenCalled();
    await run([dialog('u1', { folderIds: [] })]);
    expect(tx.telegramCrmConversationFolder.deleteMany).toHaveBeenCalledWith({
      where: {
        workspaceId: 'w',
        mtprotoAccountId: 'a',
        OR: [{ conversationId: 'c1', folderId: 'f1' }],
      },
    });
    expect(tx.telegramCrmConversationFolder.createMany).not.toHaveBeenCalled();
  });

  it('stores structural memberships for unlinked chats independently of selected import tags and current read state', async () => {
    const { tx, run, dialog } = fixture();
    await run([
      dialog('u1', {
        folderIds: [],
        folderMembershipIds: [1, 2],
        unreadCount: 0,
      }),
    ]);
    expect(tx.telegramCrmConversationFolder.deleteMany).not.toHaveBeenCalled();
    expect(tx.telegramCrmConversationFolder.createMany).toHaveBeenCalledWith({
      data: [
        {
          workspaceId: 'w',
          mtprotoAccountId: 'a',
          conversationId: 'c1',
          folderId: 'f2',
        },
      ],
      skipDuplicates: true,
    });
  });

  it('does not delete known memberships when a partial metadata snapshot cannot resolve a native id', async () => {
    const { tx, run, dialog } = fixture();
    await run([dialog('u1', { folderIds: [999] })]);
    expect(tx.telegramCrmConversationFolder.findMany).not.toHaveBeenCalled();
    expect(tx.telegramCrmConversationFolder.deleteMany).not.toHaveBeenCalled();
  });

  it('uses fixed reads for 100 folders and suppresses unchanged membership writes', async () => {
    const { tx, run, dialog } = fixture(100);
    await run([
      dialog('u1', { folderIds: [1] }),
      dialog('u2', { folderIds: [2] }),
    ]);
    expect(tx.telegramCrmFolder.findMany).toHaveBeenCalledTimes(1);
    expect(tx.telegramCrmConversationFolder.findMany).toHaveBeenCalledTimes(1);
    expect(tx.telegramCrmConversationFolder.createMany).not.toHaveBeenCalled();
    expect(tx.telegramCrmConversationFolder.deleteMany).not.toHaveBeenCalled();
    expect(tx.telegramCrmFolder.updateMany).not.toHaveBeenCalled();
  });
});

it('purges only removed folder memberships so native ID reuse cannot resurrect old pages', async () => {
  const { tx, run } = fixture();
  await run([], { folders: [] });
  expect(tx.telegramCrmConversationFolder.deleteMany).toHaveBeenCalledWith({
    where: {
      workspaceId: 'w',
      mtprotoAccountId: 'a',
      folderId: { in: ['f1', 'f2'] },
    },
  });
  expect(tx.telegramCrmFolder.updateMany).toHaveBeenCalledWith(
    expect.objectContaining({ data: { isActive: false } }),
  );
});
