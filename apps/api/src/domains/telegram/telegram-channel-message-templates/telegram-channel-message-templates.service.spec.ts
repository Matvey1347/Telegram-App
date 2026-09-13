import { NotFoundException } from '@nestjs/common';
import { TelegramChannelMessageTemplatesService } from './telegram-channel-message-templates.service';

function setup() {
  const prisma = {
    telegramChannel: {
      findMany: jest.fn(),
      count: jest.fn(),
    },
    telegramAdProduct: { findMany: jest.fn() },
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
    prisma.telegramAdProduct.findMany.mockResolvedValue([
      {
        id: 'product-1',
        telegramChannelId: 'channel-1',
        name: '1/24',
        defaultFixedPrice: { toString: () => '75' },
        minimumPrice: null,
        currency: 'UAH',
      },
    ]);

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
