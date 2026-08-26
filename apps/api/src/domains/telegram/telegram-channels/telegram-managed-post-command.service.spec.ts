/* eslint-disable @typescript-eslint/no-unsafe-assignment -- focused Prisma test doubles */
import { TelegramManagedPostCommandService } from './telegram-managed-post-command.service';

describe('TelegramManagedPostCommandService group assignment', () => {
  function setup(group: { id: string } | null = { id: 'group-1' }) {
    const tx = {
      postGroup: { findFirst: jest.fn().mockResolvedValue(group) },
      telegramManagedPost: {
        count: jest.fn().mockResolvedValue(3),
        create: jest.fn().mockResolvedValue({ id: 'post-1' }),
      },
    };
    const prisma = {
      $transaction: jest.fn(
        async (callback: (client: typeof tx) => Promise<unknown>) =>
          callback(tx),
      ),
    };
    const workspace = {
      resolveAssignedMemberId: jest.fn().mockResolvedValue({
        workspaceId: 'workspace-1',
        assignedMemberId: 'member-1',
      }),
    };
    const channels = {
      findOne: jest.fn().mockResolvedValue({ id: 'channel-1' }),
    };
    const presentation = {
      attachManagedPostIcons: jest.fn((posts: unknown[]) =>
        Promise.resolve(posts),
      ),
    };
    const media = {
      persistImageUrls: jest.fn().mockResolvedValue([]),
    };
    const service = new TelegramManagedPostCommandService(
      prisma as never,
      workspace as never,
      {} as never,
      channels as never,
      presentation as never,
      {} as never,
      {} as never,
      media as never,
    );
    return { service, prisma, tx };
  }

  it('validates and assigns a group in the managed-post transaction', async () => {
    const { service, prisma, tx } = setup();

    await service.createManagedPost(
      'user-1',
      'channel-1',
      { title: 'Post' },
      { groupId: 'group-1' },
    );

    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(tx.postGroup.findFirst).toHaveBeenCalledWith({
      where: {
        id: 'group-1',
        workspaceId: 'workspace-1',
        telegramChannelId: 'channel-1',
      },
      select: { id: true },
    });
    expect(tx.telegramManagedPost.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          groupId: 'group-1',
          groupPosition: 3,
        }),
      }),
    );
  });

  it('rejects a group from another workspace or channel', async () => {
    const { service, tx } = setup(null);

    await expect(
      service.createManagedPost(
        'user-1',
        'channel-1',
        { title: 'Post' },
        { groupId: 'foreign-group' },
      ),
    ).rejects.toThrow('Post group is unavailable');
    expect(tx.telegramManagedPost.create).not.toHaveBeenCalled();
  });
});
