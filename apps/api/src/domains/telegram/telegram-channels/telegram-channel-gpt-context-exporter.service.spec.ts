import { NotFoundException } from '@nestjs/common';
import { buildTelegramGptContextFilename } from '@telegram-system/shared';
import { TelegramChannelGptContextExporter } from './telegram-channel-gpt-context-exporter.service';

const syncedPost = {
  id: 'telegram-post-1',
  telegramMessageId: '42',
  text: 'Published copy',
  formattedText: 'Published <b>copy</b>',
  hasMedia: false,
  mediaKind: null,
  postDate: new Date('2026-08-20T10:00:00.000Z'),
  viewsCount: 1_000,
  forwardsCount: 25,
  reactionsCount: 100,
  commentsCount: 10,
  manualOwnViews: 50,
  manualOwnReactions: 5,
  reactions: { '👍': 100 },
  createdAt: new Date('2026-08-20T10:00:00.000Z'),
  updatedAt: new Date('2026-08-20T11:00:00.000Z'),
};

function setup(
  channel: Record<string, unknown> | null = {
    id: 'channel-1',
    title: 'Channel',
    username: 'example_channel',
    telegramChatId: '123',
    currentSubscribersCount: 2_000,
    ownViewsPerPost: 50,
    ownReactionsPerPost: 5,
  },
) {
  const prisma = {
    telegramChannel: { findFirst: jest.fn().mockResolvedValue(channel) },
    telegramManagedPost: { findMany: jest.fn().mockResolvedValue([]) },
    telegramPost: { findMany: jest.fn().mockResolvedValue([syncedPost]) },
    telegramChannelCustomEmojiPack: {
      findMany: jest.fn().mockResolvedValue([]),
    },
    postGroup: { findMany: jest.fn().mockResolvedValue([]) },
    $queryRaw: jest
      .fn()
      .mockResolvedValue([
        { telegramPostId: 'telegram-post-1', subscriberCount: 800 },
      ]),
  };
  const exporter = new TelegramChannelGptContextExporter(
    prisma as never,
    {
      resolveWorkspaceIdForUser: jest.fn().mockResolvedValue('workspace-1'),
    } as never,
  );
  return { exporter, prisma };
}

describe('TelegramChannelGptContextExporter', () => {
  it('builds a compact channel acronym and download-time filename', () => {
    const downloadedAt = new Date(2026, 7, 22, 9, 5);

    expect(
      buildTelegramGptContextFilename('Бізнес-патерни', downloadedAt),
    ).toBe('БП_09-05.txt');
    expect(buildTelegramGptContextFilename('Telegram', downloadedAt)).toBe(
      'TE_09-05.txt',
    );
    expect(buildTelegramGptContextFilename('  ', downloadedAt)).toBe(
      'TG_09-05.txt',
    );
  });

  it('exports unmatched synchronized posts with engagement and bounded workspace reads', async () => {
    const { exporter, prisma } = setup();
    const result = await exporter.export('user-1', 'channel-1');
    const text = result.buffer.toString('utf8');

    expect(result.filename).toMatch(/^CH_\d{2}-\d{2}\.txt$/);
    expect(text).toContain('FORMAT VERSION: 3');
    expect(text).toContain('id: telegram-post:telegram-post-1');
    expect(text).toContain('reference: telegram-source-post:telegram-post-1');
    expect(text).not.toContain(
      'reference: tg-post:telegram-post:telegram-post-1',
    );
    expect(text).toContain('telegram_url: https://t.me/example_channel/42');
    expect(text).toContain('adjusted_views: 900');
    expect(text).toContain('subscribers: 800');
    expect(text).toContain('err: 112.50%');
    expect(text).toContain('reaction_rate: 10.00%');
    expect(text).toContain('reactions: [{"reaction":"👍","count":100}]');
    expect(text).toContain('text:\nPublished copy');
    const telegramPostCalls = prisma.telegramPost.findMany.mock
      .calls as unknown as Array<
      [{ where: unknown; select: Record<string, boolean> }]
    >;
    const telegramPostRead = telegramPostCalls[0]?.[0];
    expect(telegramPostRead?.where).toEqual({
      workspaceId: 'workspace-1',
      telegramChannelId: 'channel-1',
    });
    expect(telegramPostRead?.select).not.toHaveProperty('rawMessage');
    expect(prisma.$queryRaw).toHaveBeenCalledTimes(1);
  });

  it('merges matching Telegram metrics into a managed post without a duplicate block', async () => {
    const { exporter, prisma } = setup();
    prisma.telegramManagedPost.findMany.mockResolvedValueOnce([
      {
        id: 'managed-1',
        title: 'Managed title',
        status: 'PUBLISHED',
        imageUrls: [],
        text: 'Managed copy',
        createdAt: new Date('2026-08-20T09:00:00.000Z'),
        telegramMessageIds: ['42'],
        telegramMessageUrls: [],
      },
    ]);

    const result = await exporter.export('user-1', 'channel-1');
    const text = result.buffer.toString('utf8');
    expect(text).toContain('id: managed-1');
    expect(text).toContain('views: 1000');
    expect(text).not.toContain('id: telegram-post:telegram-post-1');
  });

  it('rejects a channel outside the resolved workspace', async () => {
    const { exporter, prisma } = setup(null);
    await expect(
      exporter.export('user-1', 'other-channel'),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.telegramChannel.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'other-channel', workspaceId: 'workspace-1' },
      }),
    );
  });

  it('exports unknown subscribers and ERR when no snapshot predates publication', async () => {
    const { exporter, prisma } = setup();
    prisma.$queryRaw.mockResolvedValueOnce([
      { telegramPostId: 'telegram-post-1', subscriberCount: null },
    ]);

    const result = await exporter.export('user-1', 'channel-1');
    const text = result.buffer.toString('utf8');

    expect(text).toContain('subscribers: unknown');
    expect(text).toContain('err: unknown');
    expect(text).not.toContain('subscribers: 2000');
  });
});
