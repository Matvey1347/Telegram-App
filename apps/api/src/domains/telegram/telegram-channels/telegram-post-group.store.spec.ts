/* eslint-disable @typescript-eslint/no-unsafe-assignment -- focused Prisma test doubles */
import { TelegramPostGroupStore } from './telegram-post-group.store';

describe('TelegramPostGroupStore advertise system group', () => {
  const client = {
    telegramChannel: {
      findFirst: jest.fn(),
    },
    postGroup: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
      update: jest.fn(),
      upsert: jest.fn(),
    },
    workspaceMember: {
      findFirst: jest.fn(),
    },
  };
  const store = new TelegramPostGroupStore(
    client as never,
    {} as never,
    {} as never,
  );

  beforeEach(() => {
    jest.clearAllMocks();
    client.telegramChannel.findFirst.mockResolvedValue({ id: 'channel-1' });
  });

  it('canonicalizes an existing case-insensitive trimmed group without replacing user content', async () => {
    client.postGroup.findMany.mockResolvedValue([
      {
        id: 'group-1',
        title: '  AdVeRtIsE ',
        description: 'Keep this description',
        icon: 'icon-1',
        isSystem: false,
        systemKey: null,
      },
    ]);
    client.postGroup.update.mockResolvedValue({ id: 'group-1' });

    await store.ensureAdvertiseSystemGroup(
      client as never,
      'workspace-1',
      'channel-1',
      'member-1',
    );

    expect(client.postGroup.update).toHaveBeenCalledWith({
      where: { id: 'group-1' },
      data: {
        title: 'Advertise',
        icon: '💰',
        isSystem: true,
        systemKey: 'ADVERTISE',
      },
    });
    expect(client.postGroup.upsert).not.toHaveBeenCalled();
    expect(client.workspaceMember.findFirst).not.toHaveBeenCalled();
  });

  it('is idempotent when the canonical system group already exists', async () => {
    const existing = {
      id: 'group-1',
      title: 'Advertise',
      icon: '💰',
      isSystem: true,
      systemKey: 'ADVERTISE',
    };
    client.postGroup.findMany.mockResolvedValue([existing]);

    await expect(
      store.ensureAdvertiseSystemGroup(
        client as never,
        'workspace-1',
        'channel-1',
      ),
    ).resolves.toBe(existing);

    expect(client.postGroup.update).not.toHaveBeenCalled();
    expect(client.postGroup.upsert).not.toHaveBeenCalled();
  });

  it('rejects a preferred member from another workspace and falls back to the oldest local member', async () => {
    client.postGroup.findMany.mockResolvedValue([]);
    client.workspaceMember.findFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ id: 'oldest-local-member' });
    client.postGroup.upsert.mockResolvedValue({ id: 'group-new' });

    await store.ensureAdvertiseSystemGroup(
      client as never,
      'workspace-1',
      'channel-1',
      'foreign-member',
    );

    expect(client.workspaceMember.findFirst).toHaveBeenNthCalledWith(1, {
      where: { id: 'foreign-member', workspaceId: 'workspace-1' },
      select: { id: true },
    });
    expect(client.workspaceMember.findFirst).toHaveBeenNthCalledWith(2, {
      where: { workspaceId: 'workspace-1' },
      select: { id: true },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    });
    expect(client.postGroup.upsert).toHaveBeenCalledWith({
      where: {
        telegramChannelId_systemKey: {
          telegramChannelId: 'channel-1',
          systemKey: 'ADVERTISE',
        },
      },
      update: { title: 'Advertise', icon: '💰', isSystem: true },
      create: {
        workspaceId: 'workspace-1',
        telegramChannelId: 'channel-1',
        title: 'Advertise',
        icon: '💰',
        isSystem: true,
        systemKey: 'ADVERTISE',
        createdByMemberId: 'oldest-local-member',
      },
    });
  });

  it('does not create a group when the channel belongs to another workspace', async () => {
    client.telegramChannel.findFirst.mockResolvedValue(null);

    await expect(
      store.ensureAdvertiseSystemGroup(
        client as never,
        'workspace-1',
        'foreign-channel',
        'member-1',
      ),
    ).rejects.toThrow('Telegram channel not found');

    expect(client.telegramChannel.findFirst).toHaveBeenCalledWith({
      where: { id: 'foreign-channel', workspaceId: 'workspace-1' },
      select: { id: true },
    });
    expect(client.postGroup.findMany).not.toHaveBeenCalled();
    expect(client.postGroup.upsert).not.toHaveBeenCalled();
  });
});

describe('TelegramPostGroupStore System Bot posts group', () => {
  const client = {
    telegramChannel: { findFirst: jest.fn() },
    postGroup: {
      findFirst: jest.fn(),
      update: jest.fn(),
      upsert: jest.fn(),
    },
    workspaceMember: { findFirst: jest.fn() },
  };
  const store = new TelegramPostGroupStore(
    client as never,
    {} as never,
    {} as never,
  );

  beforeEach(() => {
    jest.clearAllMocks();
    client.telegramChannel.findFirst.mockResolvedValue({ id: 'channel-1' });
  });

  it('does not write when the canonical group already exists', async () => {
    const existing = {
      id: 'system-group',
      title: 'System Bot posts',
      isSystem: true,
      systemKey: 'SYSTEM_BOT_POSTS',
    };
    client.postGroup.findFirst.mockResolvedValue(existing);

    await expect(
      store.ensureSystemBotPostsGroup(
        client as never,
        'workspace-1',
        'channel-1',
      ),
    ).resolves.toBe(existing);
    expect(client.postGroup.update).not.toHaveBeenCalled();
    expect(client.postGroup.upsert).not.toHaveBeenCalled();
  });

  it('creates the group with a validated local creator', async () => {
    client.postGroup.findFirst.mockResolvedValue(null);
    client.workspaceMember.findFirst.mockResolvedValue({ id: 'member-1' });
    client.postGroup.upsert.mockResolvedValue({ id: 'system-group' });

    await store.ensureSystemBotPostsGroup(
      client as never,
      'workspace-1',
      'channel-1',
      'member-1',
    );

    expect(client.workspaceMember.findFirst).toHaveBeenCalledWith({
      where: { id: 'member-1', workspaceId: 'workspace-1' },
      select: { id: true },
    });
    expect(client.postGroup.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          workspaceId: 'workspace-1',
          telegramChannelId: 'channel-1',
          title: 'System Bot posts',
          isSystem: true,
          systemKey: 'SYSTEM_BOT_POSTS',
          createdByMemberId: 'member-1',
        }),
      }),
    );
  });

  it('rejects a channel outside the workspace', async () => {
    client.telegramChannel.findFirst.mockResolvedValue(null);

    await expect(
      store.ensureSystemBotPostsGroup(
        client as never,
        'workspace-1',
        'foreign-channel',
      ),
    ).rejects.toThrow('Telegram channel not found');
    expect(client.postGroup.findFirst).not.toHaveBeenCalled();
  });
});
