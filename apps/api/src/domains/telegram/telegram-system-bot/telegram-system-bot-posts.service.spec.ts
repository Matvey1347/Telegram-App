/* eslint-disable @typescript-eslint/no-unsafe-assignment -- focused Prisma and Telegram test doubles */
import { TelegramManagedPostStatus } from '@prisma/client';
import { TelegramSystemBotPostsService } from './telegram-system-bot-posts.service';

const scope = {
  connectionId: 'connection-1',
  workspaceId: 'workspace-1',
  userId: 'user-1',
  telegramUserId: 'telegram-user-1',
  chatId: 'telegram-user-1',
  timezone: 'Europe/Warsaw',
};

function setup() {
  const config = { token: 'token', frontendUrl: null };
  const api = {
    sendMessage: jest.fn().mockResolvedValue({ message_id: 90 }),
    editMessageText: jest.fn().mockResolvedValue({ message_id: 77 }),
  };
  const prisma = {
    telegramManagedPost: {
      findMany: jest.fn().mockResolvedValue([]),
      findFirst: jest.fn().mockResolvedValue({
        id: 'post-1',
        telegramChannelId: 'channel-1',
      }),
    },
  };
  const moduleRef = {
    registerRequestByContextId: jest.fn(),
    resolve: jest.fn(),
  };
  const options = {
    channels: jest.fn().mockResolvedValue([{ id: 'channel-1', title: 'News' }]),
  };
  const service = new TelegramSystemBotPostsService(
    config as never,
    api as never,
    prisma as never,
    moduleRef as never,
    options as never,
  );
  return { service, api, prisma, moduleRef, options, config };
}

describe('TelegramSystemBotPostsService', () => {
  it('opens the Posts hub with only add and content-plan actions', async () => {
    const test = setup();

    await test.service.open(scope);

    expect(test.api.sendMessage).toHaveBeenCalledWith('token', {
      chat_id: scope.chatId,
      text: '📝 Posts',
      reply_markup: {
        inline_keyboard: [
          [{ text: '➕ Add new', callback_data: 'posts:add' }],
          [{ text: '🗓 Content plan', callback_data: 'posts:calendar' }],
        ],
      },
    });
  });

  it('renders managed-post navigation in the persisted Russian locale', async () => {
    const test = setup();

    await test.service.open({ ...scope, locale: 'ru' });

    expect(test.api.sendMessage).toHaveBeenCalledWith(
      'token',
      expect.objectContaining({
        text: '📝 Публикации',
        reply_markup: expect.objectContaining({
          inline_keyboard: expect.arrayContaining([
            [{ text: '➕ Добавить', callback_data: 'posts:add' }],
          ]),
        }),
      }),
    );
  });

  it('returns from a list to the Posts hub by editing the same message', async () => {
    const test = setup();

    await test.service.callback(scope, 'posts:home', 77);

    expect(test.api.editMessageText).toHaveBeenCalledWith(
      'token',
      expect.objectContaining({ message_id: 77, text: '📝 Posts' }),
    );
    expect(test.api.sendMessage).not.toHaveBeenCalled();
  });

  it('opens a selected channel calendar instead of parsing its index as empty', async () => {
    const test = setup();
    test.prisma.telegramManagedPost.findMany.mockResolvedValue([]);

    await test.service.callback(scope, 'posts:calendar:0', 77);

    expect(test.options.channels).toHaveBeenCalledWith(scope);
    expect(test.prisma.telegramManagedPost.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ telegramChannelId: 'channel-1' }),
      }),
    );
    expect(test.api.editMessageText).toHaveBeenCalledWith(
      'token',
      expect.objectContaining({ text: expect.stringContaining('News') }),
    );
  });

  it('lets the content plan select multiple channels and reads them in one workspace-scoped query', async () => {
    const test = setup();
    test.options.channels.mockResolvedValue([
      { id: 'channel-1', title: 'News' },
      { id: 'channel-2', title: 'Ideas' },
    ]);
    await test.service.callback(scope, 'posts:calendar:select:3', 77);
    expect(test.api.editMessageText).toHaveBeenCalledWith(
      'token',
      expect.objectContaining({
        reply_markup: expect.objectContaining({
          inline_keyboard: expect.arrayContaining([
            [
              {
                text: '🗓 View 2 channel(s)',
                callback_data: 'posts:calendar:channel:m3',
              },
            ],
          ]),
        }),
      }),
    );
    await test.service.callback(scope, 'posts:calendar:channel:m3', 77);
    expect(test.prisma.telegramManagedPost.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          workspaceId: 'workspace-1',
          telegramChannelId: { in: ['channel-1', 'channel-2'] },
        }),
      }),
    );
  });

  it('opens a network as one combined calendar instead of forcing a single channel', async () => {
    const test = setup();
    test.options.channels.mockResolvedValue([
      { id: 'channel-1', title: 'News' },
      { id: 'channel-2', title: 'Ideas' },
    ]);
    Object.assign(test.options, {
      networks: jest
        .fn()
        .mockResolvedValue([
          { id: 'network-1', name: 'Network', channelCount: 2 },
        ]),
    });
    test.moduleRef.resolve.mockResolvedValue({
      resolve: jest
        .fn()
        .mockResolvedValue({ channelIds: ['channel-1', 'channel-2'] }),
    });
    await test.service.callback(scope, 'posts:calendar:network:0', 77);
    expect(test.prisma.telegramManagedPost.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          telegramChannelId: { in: ['channel-1', 'channel-2'] },
        }),
      }),
    );
  });

  it('keeps the selected channel calendar open when a date is chosen', async () => {
    const test = setup();
    test.prisma.telegramManagedPost.findMany.mockResolvedValue([
      {
        id: 'post-1',
        telegramChannelId: 'channel-1',
        title: 'Calendar post',
        status: TelegramManagedPostStatus.SCHEDULED,
        scheduledAt: new Date('2026-09-21T10:00:00.000Z'),
        publishedAt: null,
      },
    ]);

    await test.service.callback(scope, 'posts:day:channel-1:2026-09-21', 77);

    expect(test.prisma.telegramManagedPost.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ telegramChannelId: 'channel-1' }),
      }),
    );
    expect(test.api.editMessageText).toHaveBeenCalledWith(
      'token',
      expect.objectContaining({
        text: expect.stringContaining('Calendar post'),
        reply_markup: expect.objectContaining({
          inline_keyboard: expect.arrayContaining([
            expect.arrayContaining([
              expect.objectContaining({
                callback_data: 'posts:day:channel-1:2026-09-21',
              }),
            ]),
          ]),
        }),
      }),
    );
  });

  it('does not reload the calendar when an informational weekday label is tapped', async () => {
    const test = setup();

    await expect(
      test.service.callback(scope, 'posts:noop', 77),
    ).resolves.toBeNull();

    expect(test.prisma.telegramManagedPost.findMany).not.toHaveBeenCalled();
    expect(test.api.editMessageText).not.toHaveBeenCalled();
  });

  it('opens a selected publication in the bot editor', async () => {
    const test = setup();
    test.config.frontendUrl = 'https://app.example';
    test.prisma.telegramManagedPost.findMany.mockResolvedValue([
      {
        id: 'post-1',
        telegramChannelId: 'channel-1',
        title: 'Calendar post',
        status: TelegramManagedPostStatus.SCHEDULED,
        scheduledAt: new Date('2026-09-21T10:00:00.000Z'),
        publishedAt: null,
        deleteAfterHours: 24,
        plannerFormat: { name: '1/24' },
      },
    ]);

    await test.service.callback(scope, 'posts:day:channel-1:2026-09-21', 77);

    expect(test.api.editMessageText).toHaveBeenCalledWith(
      'token',
      expect.objectContaining({
        reply_markup: expect.objectContaining({
          inline_keyboard: expect.arrayContaining([
            [
              expect.objectContaining({
                callback_data: 'posts:edit:0:post-1',
              }),
            ],
          ]),
        }),
      }),
    );
  });
});
