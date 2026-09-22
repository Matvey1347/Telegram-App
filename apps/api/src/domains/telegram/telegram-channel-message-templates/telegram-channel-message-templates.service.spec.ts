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
      create: jest.fn<Promise<unknown>, [{ data: Record<string, unknown> }]>(),
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
  it('persists excluded formats and price rounding with the template', async () => {
    const { prisma, service } = setup();
    let createdData: Record<string, unknown> | undefined;
    prisma.telegramChannel.count.mockResolvedValue(2);
    prisma.telegramChannelMessageTemplate.create.mockImplementation(
      ({ data }: { data: Record<string, unknown> }) => {
        createdData = data;
        return Promise.resolve({
          id: 'template-1',
          ...data,
          icon: null,
          createdAt: new Date('2026-09-14T00:00:00.000Z'),
          updatedAt: new Date('2026-09-14T00:00:00.000Z'),
        });
      },
    );

    const result = await service.create('user-1', {
      title: 'Prices',
      iconId: null,
      scopeMode: 'CHANNELS',
      networkId: null,
      channelIds: ['channel-2', 'channel-1'],
      groupChannels: true,
      groupMode: 'NETWORK',
      channelGroupLabels: {
        'channel-2': 'Business',
        'channel-1': 'Business',
        outsider: 'Ignored',
      },
      channelGroupHeaderTemplate: '{{group}}: {{count}} каналов',
      bodyTemplate: '{{#products}}{{product_price}}{{/products}}',
      overrideInviteLinks: false,
      inviteLinkOverrides: {},
      excludedProductNames: ['3/72'],
      priceRounding: 'NEAREST_10',
      productNameOverrides: { 'No auto-delete': 'Без видалення' },
      bundleOfferEnabled: true,
      bundleDiscountPercent: 10,
      bundleBasePriceOverrides: { '1/24': '495' },
      bundleOfferTemplate: '💰 {{price}} {{currency}} у всі — {{format}}',
    });

    expect(createdData).toEqual(
      expect.objectContaining({
        excludedProductNames: ['3/72'],
        channelIds: ['channel-2', 'channel-1'],
        groupChannels: true,
        groupMode: 'NETWORK',
        channelGroupLabels: {
          'channel-2': 'Business',
          'channel-1': 'Business',
        },
        channelGroupHeaderTemplate: '{{group}}: {{count}} каналов',
        priceRounding: 'NEAREST_10',
        productNameOverrides: { 'No auto-delete': 'Без видалення' },
        bundleOfferEnabled: true,
        bundleDiscountPercent: 10,
        bundleBasePriceOverrides: { '1/24': '495' },
        bundleOfferTemplate: '💰 {{price}} {{currency}} у всі — {{format}}',
        workspaceId: 'workspace-1',
      }),
    );
    expect(result).toEqual(
      expect.objectContaining({
        excludedProductNames: ['3/72'],
        channelIds: ['channel-2', 'channel-1'],
        groupChannels: true,
        groupMode: 'NETWORK',
        channelGroupLabels: {
          'channel-2': 'Business',
          'channel-1': 'Business',
        },
        channelGroupHeaderTemplate: '{{group}}: {{count}} каналов',
        priceRounding: 'NEAREST_10',
        productNameOverrides: { 'No auto-delete': 'Без видалення' },
        bundleOfferEnabled: true,
        bundleDiscountPercent: 10,
        bundleBasePriceOverrides: { '1/24': '495' },
        bundleOfferTemplate: '💰 {{price}} {{currency}} у всі — {{format}}',
      }),
    );
  });

  it('builds ordered channel sources with main links and active prices', async () => {
    const { prisma, service } = setup();
    prisma.telegramChannel.findMany.mockResolvedValue([
      {
        id: 'channel-2',
        title: 'Second',
        shortDescription: null,
        username: null,
        photoUrl: null,
        tgStatUrl: null,
        currentSubscribersCount: 500,
        ownViewsPerPost: 0,
        adBaseCpm: 300,
        internalCpm: null,
        adBaseCurrency: 'UAH',
        updatedAt: new Date('2026-09-14T00:00:00.000Z'),
        defaultInviteLinkId: null,
        presentationIcon: null,
        networkMembers: [],
        inviteLinks: [],
      },
      {
        id: 'channel-1',
        title: 'First',
        shortDescription: 'Short business description',
        username: 'first',
        photoUrl: null,
        tgStatUrl: 'https://tgstat.com/first',
        currentSubscribersCount: 1_000,
        ownViewsPerPost: 1_200,
        adBaseCpm: 300,
        internalCpm: 175.5,
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
        networkMembers: [{ network: { name: 'Business' } }],
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
        networkGroups: [{ name: 'Business', emojiSource: null }],
        viewsPerPost: 1_200,
        description: 'Short business description',
        products: [
          expect.objectContaining({
            name: '1/24',
            price: '75',
            internalPrice: '87.75',
            expectedViews: 500,
            publicCpm: '0',
            internalCpm: '175.5',
            currency: 'UAH',
          }),
        ],
        inviteLinks: [expect.objectContaining({ isDefault: true })],
      }),
    );
    expect(result.channels[1].emojiSource).toBe('📣');
    expect(result.channels[1].products[0]).toEqual(
      expect.objectContaining({
        name: '1/24',
        internalPrice: null,
        internalCpm: null,
        currency: 'UAH',
      }),
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

  it('resolves the current network membership when a saved template is sent', async () => {
    const { prisma, service } = setup();
    prisma.telegramChannelMessageTemplate.findFirst.mockResolvedValue({
      scopeMode: 'NETWORK',
      networkId: 'network-1',
      channelIds: ['old-channel'],
    });
    prisma.telegramChannel.findMany
      .mockResolvedValueOnce([{ id: 'new-channel' }])
      .mockResolvedValueOnce([]);

    await expect(
      service.source('user-1', { templateId: 'template-1' }),
    ).rejects.toBeInstanceOf(NotFoundException);

    expect(prisma.telegramChannel.findMany).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        where: expect.objectContaining({
          workspaceId: 'workspace-1',
          networkMembers: { some: { networkId: 'network-1' } },
        }),
      }),
    );
    expect(prisma.telegramChannel.findMany).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        where: expect.objectContaining({ id: { in: ['new-channel'] } }),
      }),
    );
  });
});
