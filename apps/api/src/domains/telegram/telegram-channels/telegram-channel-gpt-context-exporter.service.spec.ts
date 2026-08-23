import { NotFoundException } from '@nestjs/common';
import {
  buildTelegramCalendarPlanInstructionFilename,
  buildTelegramGptContextFilename,
} from '@telegram-system/shared';
import { TelegramChannelGptContextExporter } from './telegram-channel-gpt-context-exporter.service';

const syncedPost = {
  id: 'telegram-post-1',
  telegramMessageId: '42',
  text: 'Published copy',
  formattedText: 'Published <b>copy</b>',
  hasMedia: false,
  mediaKind: null,
  imageUrls: [],
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
    workspace: {
      findUnique: jest.fn().mockResolvedValue({ timezone: 'Europe/Warsaw' }),
    },
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
    expect(
      buildTelegramCalendarPlanInstructionFilename(
        'Бізнес-патерни',
        downloadedAt,
      ),
    ).toBe('БП_09-05_calendar-plan-instruction.txt');
  });

  it('downloads a complete calendar instruction with eligibility, slots, occupancy, and history', async () => {
    const { exporter, prisma } = setup({
      id: 'channel-1',
      title: 'Channel',
      telegramChatId: '-100123',
      timePosts: [
        { id: 'morning', title: 'Morning', time: '09:00', position: 0 },
        { id: 'evening', title: 'Evening', time: '18:00', position: 1 },
      ],
    });
    const post = (overrides: Record<string, unknown>) => ({
      id: 'available',
      title: 'Available post',
      text: 'Available text',
      origin: 'SYSTEM',
      status: 'DRAFT',
      scheduledAt: null,
      createdAt: new Date('2026-08-01T09:00:00.000Z'),
      telegramRemoteStatus: 'NONE',
      telegramIdVerificationStatus: 'UNVERIFIED',
      telegramMessageIds: [],
      lastError: null,
      group: { title: 'Advice' },
      ...overrides,
    });
    prisma.telegramManagedPost.findMany.mockResolvedValueOnce([
      post({}),
      post({
        id: 'blocked',
        title: 'Blocked post',
        text: 'Read [dependency](tg-post:future-target)',
      }),
      post({ id: 'future-target', title: 'Future target' }),
      post({
        id: 'reserved',
        title: 'Reserved post',
        status: 'SCHEDULED',
        scheduledAt: new Date('2026-08-25T07:00:00.000Z'),
      }),
    ]);
    prisma.telegramPost.findMany.mockResolvedValueOnce([
      {
        id: 'history-1',
        postDate: new Date('2026-08-20T07:00:00.000Z'),
        text: 'A successful morning topic',
        formattedText: null,
        hasMedia: false,
      },
    ]);

    const result = await exporter.exportCalendarPlanInstruction(
      'user-1',
      'channel-1',
      new Date('2026-08-23T10:00:00.000Z'),
    );
    const text = result.buffer.toString('utf8');

    expect(result.filename).toMatch(
      /^CH_\d{2}-\d{2}_calendar-plan-instruction\.txt$/,
    );
    expect(text).toContain('TIMEZONE: Europe/Warsaw');
    expect(text).toContain('- 09:00 — Morning — slot_id: morning');
    expect(text).toContain('postId: available\navailability: AVAILABLE');
    expect(text).toContain('postId: blocked\navailability: BLOCKED');
    expect(text).toContain(
      'internal link target "Future target" is not published',
    );
    expect(text).toContain(
      '- 2026-08-25T07:00:00.000Z — reserved — Reserved post',
    );
    expect(text).toContain('local_time: 2026-08-20 09:00');
    expect(text).toContain('text:\nA successful morning topic');
    expect(text).toContain(
      'Schema: {"items":[{"postId":"exact available post ID","scheduledAt":"ISO 8601 timestamp with the correct explicit UTC offset"}]}',
    );
    const historyCalls = prisma.telegramPost.findMany.mock.calls as unknown as
      | Array<
          [
            {
              where: {
                workspaceId: string;
                telegramChannelId: string;
                postDate: unknown;
              };
              take: number;
            },
          ]
        >
      | undefined;
    const historyRead = historyCalls?.[0]?.[0];
    expect(historyRead?.where.workspaceId).toBe('workspace-1');
    expect(historyRead?.where.telegramChannelId).toBe('channel-1');
    expect(historyRead?.where.postDate).toBeDefined();
    expect(historyRead?.take).toBe(60);
  });

  it('rejects a calendar instruction request for a channel outside the workspace', async () => {
    const { exporter, prisma } = setup(null);

    await expect(
      exporter.exportCalendarPlanInstruction('user-1', 'other-channel'),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.telegramChannel.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'other-channel', workspaceId: 'workspace-1' },
      }),
    );
  });

  it('exports unmatched synchronized posts with engagement and bounded workspace reads', async () => {
    const { exporter, prisma } = setup();
    const result = await exporter.export('user-1', 'channel-1');
    const text = result.buffer.toString('utf8');

    expect(result.filename).toMatch(/^CH_\d{2}-\d{2}\.txt$/);
    expect(text).toContain('FORMAT VERSION: 4');
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
    expect(text).toContain('group_id: null');
    expect(text).toContain('group_title: Ungrouped');
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

  it('exports permanent image URLs and defensively excludes legacy Base64', async () => {
    const { exporter, prisma } = setup();
    prisma.telegramPost.findMany.mockResolvedValueOnce([
      {
        ...syncedPost,
        hasMedia: true,
        mediaKind: 'MessageMediaPhoto',
        imageUrls: ['https://cdn.test/synced.jpg'],
      },
    ]);
    prisma.telegramManagedPost.findMany.mockResolvedValueOnce([
      {
        id: 'managed-1',
        title: 'Managed',
        status: 'DRAFT',
        groupId: null,
        imageUrls: [
          'https://cdn.test/managed.jpg',
          'data:image/jpeg;base64,VERY_LARGE_VALUE',
        ],
        text: 'Managed text',
        createdAt: new Date('2026-08-20T09:00:00.000Z'),
        telegramMessageIds: [],
        telegramMessageUrls: [],
      },
    ]);

    const result = await exporter.export('user-1', 'channel-1');
    const text = result.buffer.toString('utf8');

    expect(text).toContain('- https://cdn.test/synced.jpg');
    expect(text).toContain('- https://cdn.test/managed.jpg');
    expect(text).not.toContain('data:image');
    expect(text).not.toContain('VERY_LARGE_VALUE');
  });

  it('merges matching Telegram metrics into a managed post without a duplicate block', async () => {
    const { exporter, prisma } = setup();
    prisma.telegramManagedPost.findMany.mockResolvedValueOnce([
      {
        id: 'managed-1',
        title: 'Managed title',
        status: 'PUBLISHED',
        groupId: null,
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

  it('exports each managed post group and summarizes group statuses', async () => {
    const { exporter, prisma } = setup();
    prisma.postGroup.findMany.mockResolvedValueOnce([
      { id: 'group-1', title: 'Evergreen' },
      { id: 'group-2', title: 'News' },
    ]);
    prisma.telegramManagedPost.findMany.mockResolvedValueOnce([
      {
        id: 'managed-1',
        title: 'Draft post',
        status: 'DRAFT',
        groupId: 'group-1',
        imageUrls: [],
        text: 'Draft copy',
        createdAt: new Date('2026-08-20T09:00:00.000Z'),
        telegramMessageIds: [],
        telegramMessageUrls: [],
      },
      {
        id: 'managed-2',
        title: 'Published post',
        status: 'PUBLISHED',
        groupId: 'group-1',
        imageUrls: [],
        text: 'Published copy',
        createdAt: new Date('2026-08-20T10:00:00.000Z'),
        telegramMessageIds: [],
        telegramMessageUrls: [],
      },
      {
        id: 'managed-3',
        title: 'Ungrouped post',
        status: 'SCHEDULED',
        groupId: null,
        imageUrls: [],
        text: 'Scheduled copy',
        createdAt: new Date('2026-08-20T11:00:00.000Z'),
        telegramMessageIds: [],
        telegramMessageUrls: [],
      },
    ]);

    const result = await exporter.export('user-1', 'channel-1');
    const text = result.buffer.toString('utf8');

    expect(text).toContain(
      '- Evergreen — group-1 — posts: 2 — statuses: DRAFT=1, PUBLISHED=1',
    );
    expect(text).toContain('- News — group-2 — posts: 0 — statuses: none');
    expect(text).toContain(
      '- Ungrouped — null — posts: 1 — statuses: SCHEDULED=1',
    );
    expect(text).toContain(
      'title: Draft post\nstatus: DRAFT\ngroup_id: group-1\ngroup_title: Evergreen',
    );
    expect(text).toContain(
      'title: Ungrouped post\nstatus: SCHEDULED\ngroup_id: null\ngroup_title: Ungrouped',
    );
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
