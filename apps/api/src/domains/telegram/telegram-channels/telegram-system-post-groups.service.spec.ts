/* eslint-disable @typescript-eslint/no-unsafe-assignment -- focused Prisma test doubles */
import { TelegramSystemPostGroupsService } from './telegram-system-post-groups.service';

describe('TelegramSystemPostGroupsService', () => {
  const prisma = {
    telegramChannel: { findFirst: jest.fn() },
    postGroup: { findMany: jest.fn() },
  };
  const workspace = {
    resolveWorkspaceMembershipForUser: jest.fn(),
  };
  const groups = { ensureSystemBotPostsGroup: jest.fn() };
  const service = new TelegramSystemPostGroupsService(
    prisma as never,
    workspace as never,
    groups as never,
  );

  beforeEach(() => {
    jest.clearAllMocks();
    workspace.resolveWorkspaceMembershipForUser.mockResolvedValue({
      id: 'member-1',
      workspaceId: 'workspace-1',
    });
    prisma.telegramChannel.findFirst.mockResolvedValue({
      id: 'channel-1',
      assignedMemberId: null,
    });
    groups.ensureSystemBotPostsGroup.mockResolvedValue({
      id: 'system-group',
      title: 'System Bot posts',
    });
    prisma.postGroup.findMany.mockResolvedValue([
      { id: 'custom-group', title: 'Ideas' },
    ]);
  });

  it('returns the System Bot group first and only scoped custom groups', async () => {
    await expect(
      service.optionsForSystemBotPost('user-1', 'channel-1'),
    ).resolves.toEqual([
      { id: 'system-group', title: 'System Bot posts', isDefault: true },
      { id: 'custom-group', title: 'Ideas', isDefault: false },
    ]);
    expect(groups.ensureSystemBotPostsGroup).toHaveBeenCalledWith(
      prisma,
      'workspace-1',
      'channel-1',
      'member-1',
    );
    expect(prisma.postGroup.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          workspaceId: 'workspace-1',
          telegramChannelId: 'channel-1',
          isSystem: false,
        }),
        take: 99,
      }),
    );
  });

  it('rejects a channel outside the active workspace', async () => {
    prisma.telegramChannel.findFirst.mockResolvedValue(null);

    await expect(
      service.optionsForSystemBotPost('user-1', 'foreign-channel'),
    ).rejects.toThrow('Telegram channel not found');
    expect(groups.ensureSystemBotPostsGroup).not.toHaveBeenCalled();
  });
});
