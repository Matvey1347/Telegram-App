import { NotFoundException } from '@nestjs/common';
import { TelegramChannelMessageTemplatesService } from './telegram-channel-message-templates.service';

function setup() {
  const prisma = {
    telegramChannel: {
      findMany: jest.fn(),
      count: jest.fn(),
    },
    telegramAdProduct: { findMany: jest.fn(), createMany: jest.fn() },
    $queryRaw: jest.fn().mockResolvedValue(
      ['channel-1', 'channel-2'].flatMap((telegramChannelId) =>
        [2, 3, 4].map((day) => {
          const postDate = new Date(Date.now() - day * 24 * 60 * 60 * 1_000);
          return {
            id: `${telegramChannelId}-post-${day}`,
            telegramChannelId,
            postDate,
            viewsCount: 500,
            manualOwnViews: 0,
            excludeFromAnalytics: false,
            adPlacementLinked: false,
            metricSnapshotId: `${telegramChannelId}-snapshot-${day}`,
            metricSnapshotViewsCount: 500,
            metricSnapshotCollectedAt: new Date(
              postDate.getTime() + 24 * 60 * 60 * 1_000,
            ),
          };
        }),
      ),
    ),
    telegramChannelNetwork: { findFirst: jest.fn() },
    telegramInviteLink: { count: jest.fn() },
    telegramChannelMessageTemplate: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      deleteMany: jest.fn(),
    },
    icon: { findFirst: jest.fn() },
  };
  const workspace = {
    resolveWorkspaceIdForUser: jest.fn().mockResolvedValue('workspace-1'),
  };
  return {
    prisma,
    service: new TelegramChannelMessageTemplatesService(
      prisma as never,
      workspace as never,
    ),
  };
}

describe('TelegramChannelMessageTemplatesService', () => {
  it('builds ordered channel sources with main links and active prices', async () => {
    const { prisma, service } = setup();
    prisma.telegramChannel.findMany.mockResolvedValue([
      {
        id: 'channel-2',
        title: 'Second',
        username: null,
        photoUrl: null,
        tgStatUrl: null,
        currentSubscribersCount: 500,
        ownViewsPerPost: 0,
        adBaseCpm: 300,
        adBaseCurrency: 'UAH',
        updatedAt: new Date('2026-09-14T00:00:00.000Z'),
        defaultInviteLinkId: null,
        presentationIcon: null,
        inviteLinks: [],
      },
      {
        id: 'channel-1',
        title: 'First',
        username: 'first',
        photoUrl: null,
        tgStatUrl: 'https://tgstat.com/first',
        currentSubscribersCount: 1_000,
        ownViewsPerPost: 0,
        adBaseCpm: 300,
        adBaseCurrency: 'UAH',
        updatedAt: new Date('2026-09-14T00:00:00.000Z'),
        defaultInviteLinkId: 'link-main',
        presentationIcon: {
          id: 'icon-1',
          type: 'emoji',
          name: 'Briefcase',
          emoji: '💼',
          imageUrl: null,
        },
        inviteLinks: [
          { id: 'link-main', name: 'Main', url: 'https://t.me/+main' },
        ],
      },
    ]);
    const resolvedProducts = [
      {
        id: 'product-1',
        telegramChannelId: 'channel-1',
        name: '1/24',
        deleteAfterHours: 24,
        isPermanent: false,
        defaultPricingMode: 'FIXED',
        defaultCpm: null,
        defaultFixedPrice: 75,
        minimumPrice: null,
        currency: 'UAH',
        isActive: true,
        position: 0,
      },
      {
        id: 'product-2',
        telegramChannelId: 'channel-2',
        name: '1/24',
        deleteAfterHours: 24,
        isPermanent: false,
        defaultPricingMode: 'CPM',
        defaultCpm: null,
        defaultFixedPrice: null,
        minimumPrice: null,
        currency: 'USD',
        isActive: true,
        position: 0,
      },
    ];
    prisma.telegramAdProduct.findMany
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce(resolvedProducts);
    prisma.telegramAdProduct.createMany.mockResolvedValue({ count: 8 });

    const result = await service.source('user-1', {
      channelIds: ['channel-1', 'channel-2'],
    });

    expect(result.channels.map((channel) => channel.id)).toEqual([
      'channel-1',
      'channel-2',
    ]);
    expect(result.channels[0]).toEqual(
      expect.objectContaining({
        emojiSource: '💼',
        products: [
          expect.objectContaining({
            name: '1/24',
            price: '75',
            currency: 'UAH',
          }),
        ],
        inviteLinks: [expect.objectContaining({ isDefault: true })],
      }),
    );
    expect(result.channels[1].emojiSource).toBe('📣');
    expect(result.channels[1].products[0]).toEqual(
      expect.objectContaining({ name: '1/24', currency: 'UAH' }),
    );
    expect(prisma.telegramAdProduct.createMany).toHaveBeenCalledTimes(1);
  });

  it('rejects a channel outside the current workspace', async () => {
    const { prisma, service } = setup();
    prisma.telegramChannel.findMany.mockResolvedValue([]);
    prisma.telegramAdProduct.findMany.mockResolvedValue([]);

    await expect(
      service.source('user-1', { channelIds: ['foreign-channel'] }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});
