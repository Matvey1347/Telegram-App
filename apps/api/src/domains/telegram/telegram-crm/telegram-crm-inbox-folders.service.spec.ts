import { ForbiddenException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { TelegramCrmInboxFoldersService } from './telegram-crm-inbox-folders.service';

function setup(size = 3, own = false) {
  const folders = Array.from({ length: size }, (_, index) => ({
    id: `folder-${index}`,
    name: `Folder ${index}`,
    color: null,
    emojiPresentation: null,
    excludeRead: index === 1,
  }));
  const prisma = {
    telegramCrmFolder: { findMany: jest.fn().mockResolvedValue(folders) },
    $queryRaw: jest
      .fn<
        Promise<Array<{ folderId: string; unreadCount: bigint }>>,
        [Prisma.Sql]
      >()
      .mockResolvedValue([
        { folderId: 'folder-0', unreadCount: 7n },
        { folderId: 'folder-1', unreadCount: 5n },
      ]),
    telegramCrmConversation: {
      aggregate: jest.fn().mockResolvedValue({ _sum: { unreadCount: 9 } }),
    },
  };
  const auth = {
    require: jest.fn().mockResolvedValue({ workspaceId: 'workspace' }),
    scope: jest
      .fn()
      .mockResolvedValue(own ? { assignedMemberId: 'member' } : {}),
  };
  return {
    service: new TelegramCrmInboxFoldersService(prisma as never, auth as never),
    prisma,
    auth,
  };
}
describe('CRM Inbox folder unread messages', () => {
  it('keeps overlap separate, includes zero folders, and returns a distinct global message sum', async () => {
    const h = setup();
    const result = await h.service.list('manager');
    expect(result.totalUnread).toBe(9);
    expect(result.items.map((folder) => folder.unreadCount)).toEqual([7, 5, 0]);
    expect(result.items[1].excludeRead).toBe(true);
    const sql = h.prisma.$queryRaw.mock.calls[0][0];
    expect(sql.sql).toContain('SUM(conversation."unreadCount")');
    expect(sql.sql).not.toContain('contactId" IS NOT NULL');
    expect(sql.sql).toContain(
      'conversation."mtprotoAccountId" = membership."mtprotoAccountId"',
    );
    expect(sql.sql).toContain(
      'folder."mtprotoAccountId" = membership."mtprotoAccountId"',
    );
    expect(sql.values).toEqual(['workspace']);
  });
  it('uses bounded reads for 100 folders and filters own counts before aggregation', async () => {
    const h = setup(100, true);
    const result = await h.service.list('manager');
    expect(result.items).toHaveLength(100);
    expect(h.prisma.telegramCrmFolder.findMany).toHaveBeenCalledTimes(1);
    expect(h.prisma.$queryRaw).toHaveBeenCalledTimes(1);
    expect(h.prisma.telegramCrmConversation.aggregate).toHaveBeenCalledTimes(2);
    expect(h.prisma.$queryRaw.mock.calls[0][0].values).toEqual([
      'workspace',
      'member',
    ]);
    expect(h.prisma.telegramCrmConversation.aggregate).toHaveBeenCalledWith({
      where: {
        workspaceId: 'workspace',
        state: 'ACTIVE',
        contact: { ownerMemberId: 'member' },
      },
      _sum: { unreadCount: true },
    });
    expect(h.prisma.telegramCrmFolder.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          workspaceId: 'workspace',
          isActive: true,
        }) as unknown,
      }),
    );
  });
  it('denies unauthorized reads before querying folder names or totals', async () => {
    const h = setup();
    h.auth.require.mockRejectedValue(new ForbiddenException());
    await expect(h.service.list('denied')).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    expect(h.prisma.telegramCrmFolder.findMany).not.toHaveBeenCalled();
    expect(h.prisma.$queryRaw).not.toHaveBeenCalled();
    expect(h.prisma.telegramCrmConversation.aggregate).not.toHaveBeenCalled();
  });
});
