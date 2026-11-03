import { TelegramChannelNetworkOptionsService } from './telegram-channel-network-options.service';
import { SYSTEM_ALL_NETWORK_ID } from './telegram-channel-network.constants';

describe('TelegramChannelNetworkOptionsService', () => {
  it('returns compact, workspace-scoped channel scopes including All', async () => {
    const prisma = {
      workspace: {
        findUnique: jest.fn().mockResolvedValue({
          systemNetworkExcludedChannelIds: ['excluded-channel'],
        }),
      },
      telegramChannelNetwork: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'network-1',
            name: 'Editorial',
            icon: {
              id: 'icon-1',
              type: 'emoji',
              name: 'Satellite',
              emoji: '🛰️',
              imageUrl: null,
            },
            channels: [{ telegramChannelId: 'channel-1' }],
          },
        ]),
      },
      telegramChannel: {
        findMany: jest.fn().mockResolvedValue([{ id: 'channel-2' }]),
      },
    };
    const service = new TelegramChannelNetworkOptionsService(
      prisma as never,
      { resolveWorkspaceIdForUser: jest.fn().mockResolvedValue('workspace-1') } as never,
    );

    await expect(service.list('user-1')).resolves.toEqual([
      expect.objectContaining({
        id: SYSTEM_ALL_NETWORK_ID,
        name: 'All',
        channels: [{ id: 'channel-2' }],
      }),
      {
        id: 'network-1',
        name: 'Editorial',
        iconPresentation: {
          type: 'unicode',
          value: '🛰️',
          name: 'Satellite',
        },
        channels: [{ id: 'channel-1' }],
      },
    ]);
    expect(prisma.telegramChannelNetwork.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { workspaceId: 'workspace-1', channels: { some: {} } },
        select: expect.objectContaining({
          channels: { select: { telegramChannelId: true } },
        }),
      }),
    );
    expect(prisma.telegramChannel.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          workspaceId: 'workspace-1',
          id: { notIn: ['excluded-channel'] },
          adminLinks: { some: {} },
        }),
        select: { id: true },
      }),
    );
  });

  it('omits All when the workspace has no eligible owned channels', async () => {
    const prisma = {
      workspace: { findUnique: jest.fn().mockResolvedValue(null) },
      telegramChannelNetwork: { findMany: jest.fn().mockResolvedValue([]) },
      telegramChannel: { findMany: jest.fn().mockResolvedValue([]) },
    };
    const service = new TelegramChannelNetworkOptionsService(
      prisma as never,
      { resolveWorkspaceIdForUser: jest.fn().mockResolvedValue('workspace-1') } as never,
    );

    await expect(service.list('user-1')).resolves.toEqual([]);
  });

  it('reads 100 channel options in bounded batches without per-channel calls', async () => {
    const ids = Array.from({ length: 100 }, (_, index) => `channel-${index}`);
    const prisma = {
      workspace: { findUnique: jest.fn().mockResolvedValue(null) },
      telegramChannelNetwork: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'network-1',
            name: 'All channels',
            icon: null,
            channels: ids.map((telegramChannelId) => ({ telegramChannelId })),
          },
        ]),
      },
      telegramChannel: {
        findMany: jest.fn().mockResolvedValue(ids.map((id) => ({ id }))),
      },
    };
    const service = new TelegramChannelNetworkOptionsService(
      prisma as never,
      { resolveWorkspaceIdForUser: jest.fn().mockResolvedValue('workspace-1') } as never,
    );

    const options = await service.list('user-1');

    expect(options[0].channels).toHaveLength(100);
    expect(options[1].channels).toHaveLength(100);
    expect(prisma.telegramChannelNetwork.findMany).toHaveBeenCalledTimes(1);
    expect(prisma.telegramChannel.findMany).toHaveBeenCalledTimes(1);
  });
});
