import { BadRequestException, NotFoundException } from '@nestjs/common';
import { TelegramManagedPostStatus } from '@prisma/client';
import {
  TELEGRAM_AD_SALES_BOT_EXISTING_POST_LIMIT,
  TELEGRAM_AD_SALES_BOT_TARGET_LIMIT,
  TelegramAdSalesBotTargetsService,
} from './telegram-ad-sales-bot-targets.service';

function setup() {
  const prisma = {
    telegramChannel: { findMany: jest.fn().mockResolvedValue([]) },
    telegramChannelNetwork: {
      findMany: jest.fn().mockResolvedValue([]),
      findFirst: jest.fn(),
    },
    telegramAdProduct: { findMany: jest.fn().mockResolvedValue([]) },
    telegramManagedPost: { findMany: jest.fn().mockResolvedValue([]) },
  };
  const workspaceService = {
    resolveWorkspaceMembershipForUser: jest.fn().mockResolvedValue({
      workspaceId: 'workspace-1',
    }),
  };
  const service = new TelegramAdSalesBotTargetsService(
    prisma as never,
    workspaceService as never,
  );
  return { service, prisma, workspaceService };
}

describe('TelegramAdSalesBotTargetsService', () => {
  it('lists bounded own workspace channels and compact own-channel networks', async () => {
    const test = setup();
    test.prisma.telegramChannel.findMany.mockResolvedValue([
      { id: 'channel-1', title: 'News', username: 'news', photoUrl: null },
    ]);
    test.prisma.telegramChannelNetwork.findMany.mockResolvedValue([
      {
        id: 'network-1',
        name: 'Regional',
        channels: [
          { telegramChannelId: 'channel-1' },
          { telegramChannelId: 'channel-2' },
        ],
      },
    ]);

    await expect(test.service.options('user-1')).resolves.toEqual({
      workspaceId: 'workspace-1',
      channels: [
        { id: 'channel-1', title: 'News', username: 'news', photoUrl: null },
      ],
      networks: [
        {
          id: 'network-1',
          name: 'Regional',
          channelIds: ['channel-1', 'channel-2'],
          channelCount: 2,
          selectable: true,
        },
      ],
    });
    expect(test.prisma.telegramChannel.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          workspaceId: 'workspace-1',
          isActive: true,
          archivedAt: null,
          adminLinks: { some: {} },
        },
        take: TELEGRAM_AD_SALES_BOT_TARGET_LIMIT,
      }),
    );
    expect(test.prisma.telegramChannelNetwork.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { workspaceId: 'workspace-1' },
        take: TELEGRAM_AD_SALES_BOT_TARGET_LIMIT,
        select: {
          id: true,
          name: true,
          channels: {
            where: {
              telegramChannel: {
                isActive: true,
                archivedAt: null,
                adminLinks: { some: {} },
              },
            },
            orderBy: { telegramChannelId: 'asc' },
            take: TELEGRAM_AD_SALES_BOT_TARGET_LIMIT + 1,
            select: { telegramChannelId: true },
          },
        },
      }),
    );
  });

  it('expands a custom network and resolves common format names per channel', async () => {
    const test = setup();
    test.prisma.telegramChannelNetwork.findFirst.mockResolvedValue({
      id: 'network-1',
      name: 'Regional',
      channels: [
        { telegramChannelId: 'channel-1' },
        { telegramChannelId: 'channel-2' },
      ],
    });
    test.prisma.telegramAdProduct.findMany.mockResolvedValue([
      {
        id: 'product-1a',
        telegramChannelId: 'channel-1',
        name: '1/24',
        deleteAfterHours: 24,
        isPermanent: false,
      },
      {
        id: 'product-1b',
        telegramChannelId: 'channel-2',
        name: '1/24',
        deleteAfterHours: 24,
        isPermanent: false,
      },
      {
        id: 'product-2a',
        telegramChannelId: 'channel-1',
        name: '2/48',
        deleteAfterHours: 48,
        isPermanent: false,
      },
    ]);

    await expect(
      test.service.resolve('user-1', {
        kind: 'NETWORK',
        networkId: 'network-1',
      }),
    ).resolves.toEqual({
      workspaceId: 'workspace-1',
      networkId: 'network-1',
      networkName: 'Regional',
      channelIds: ['channel-1', 'channel-2'],
      audienceWeightsByChannel: { 'channel-1': 0, 'channel-2': 0 },
      formats: [
        {
          name: '1/24',
          deleteAfterHours: 24,
          isPermanent: false,
          productIdsByChannel: {
            'channel-1': 'product-1a',
            'channel-2': 'product-1b',
          },
        },
      ],
    });
    expect(test.prisma.telegramChannelNetwork.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'network-1', workspaceId: 'workspace-1' },
        select: {
          id: true,
          name: true,
          channels: {
            where: {
              telegramChannel: {
                isActive: true,
                archivedAt: null,
                adminLinks: { some: {} },
              },
            },
            orderBy: { telegramChannelId: 'asc' },
            take: TELEGRAM_AD_SALES_BOT_TARGET_LIMIT + 1,
            select: {
              telegramChannelId: true,
              telegramChannel: { select: { currentSubscribersCount: true } },
            },
          },
        },
      }),
    );
    expect(test.prisma.telegramAdProduct.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          workspaceId: 'workspace-1',
          telegramChannelId: { in: ['channel-1', 'channel-2'] },
          isActive: true,
          name: { in: ['1/24', '2/48', '3/72', 'No auto-delete'] },
        },
        orderBy: [{ position: 'asc' }, { id: 'asc' }],
        take: 400,
        select: {
          id: true,
          telegramChannelId: true,
          name: true,
          deleteAfterHours: true,
          isPermanent: true,
        },
      }),
    );
  });

  it('rejects unavailable channels without leaking another workspace', async () => {
    const test = setup();
    test.prisma.telegramChannel.findMany.mockResolvedValue([
      { id: 'channel-1' },
    ]);

    await expect(
      test.service.resolve('user-1', {
        kind: 'CHANNELS',
        channelIds: ['channel-1', 'foreign-channel'],
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(test.prisma.telegramChannel.findMany).toHaveBeenCalledWith({
      where: {
        id: { in: ['channel-1', 'foreign-channel'] },
        workspaceId: 'workspace-1',
        isActive: true,
        archivedAt: null,
        adminLinks: { some: {} },
      },
      select: { id: true, currentSubscribersCount: true },
    });
    expect(test.prisma.telegramAdProduct.findMany).not.toHaveBeenCalled();
  });

  it('rejects an oversized network after a bounded limit-plus-one read', async () => {
    const test = setup();
    test.prisma.telegramChannelNetwork.findFirst.mockResolvedValue({
      id: 'network-large',
      name: 'Large',
      channels: Array.from(
        { length: TELEGRAM_AD_SALES_BOT_TARGET_LIMIT + 1 },
        (_, index) => ({ telegramChannelId: `channel-${index}` }),
      ),
    });

    await expect(
      test.service.resolve('user-1', {
        kind: 'NETWORK',
        networkId: 'network-large',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(test.prisma.telegramChannelNetwork.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        select: {
          id: true,
          name: true,
          channels: {
            where: {
              telegramChannel: {
                isActive: true,
                archivedAt: null,
                adminLinks: { some: {} },
              },
            },
            orderBy: { telegramChannelId: 'asc' },
            take: TELEGRAM_AD_SALES_BOT_TARGET_LIMIT + 1,
            select: {
              telegramChannelId: true,
              telegramChannel: { select: { currentSubscribersCount: true } },
            },
          },
        },
      }),
    );
  });

  it('returns bounded existing managed-post options for one channel only', async () => {
    const test = setup();
    test.prisma.telegramChannel.findMany.mockResolvedValue([
      { id: 'channel-1' },
    ]);
    test.prisma.telegramManagedPost.findMany.mockResolvedValue([
      { id: 'post-1', title: 'Prepared ad', status: 'DRAFT' },
    ]);

    await expect(
      test.service.existingManagedPosts('user-1', {
        kind: 'CHANNELS',
        channelIds: ['channel-1'],
      }),
    ).resolves.toEqual([
      { id: 'post-1', title: 'Prepared ad', status: 'DRAFT' },
    ]);
    expect(test.prisma.telegramManagedPost.findMany).toHaveBeenCalledWith({
      where: {
        workspaceId: 'workspace-1',
        telegramChannelId: 'channel-1',
        status: {
          in: [
            TelegramManagedPostStatus.DRAFT,
            TelegramManagedPostStatus.SCHEDULED,
            TelegramManagedPostStatus.PUBLISHED,
          ],
        },
      },
      orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
      take: TELEGRAM_AD_SALES_BOT_EXISTING_POST_LIMIT,
      select: {
        id: true,
        title: true,
        status: true,
        scheduledAt: true,
        publishedAt: true,
        updatedAt: true,
      },
    });
  });

  it('does not offer one existing post for a multi-channel target', async () => {
    const test = setup();
    test.prisma.telegramChannel.findMany.mockResolvedValue([
      { id: 'channel-1' },
      { id: 'channel-2' },
    ]);

    await expect(
      test.service.existingManagedPosts('user-1', {
        kind: 'CHANNELS',
        channelIds: ['channel-1', 'channel-2'],
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(test.prisma.telegramManagedPost.findMany).not.toHaveBeenCalled();
  });
});
