/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access -- focused Prisma and Telegram test doubles */
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

function post(overrides: Record<string, unknown> = {}) {
  return {
    id: 'post-1',
    title: 'Summer campaign',
    scheduledAt: new Date('2099-08-25T16:30:00.000Z'),
    publishedAt: null,
    scheduleMode: 'TELEGRAM_NATIVE',
    telegramChannel: { title: 'News' },
    ...overrides,
  };
}

function setup() {
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
  const publication = {
    publishManagedPostNow: jest.fn().mockResolvedValue({ id: 'post-1' }),
  };
  const moduleRef = {
    registerRequestByContextId: jest.fn(),
    resolve: jest.fn().mockResolvedValue(publication),
  };
  const service = new TelegramSystemBotPostsService(
    { token: 'token' } as never,
    api as never,
    prisma as never,
    moduleRef as never,
  );
  return { service, api, prisma, publication, moduleRef };
}

describe('TelegramSystemBotPostsService', () => {
  it('opens the Posts hub with the three primary actions', async () => {
    const test = setup();

    await test.service.open(scope);

    expect(test.api.sendMessage).toHaveBeenCalledWith('token', {
      chat_id: scope.chatId,
      text: '📝 Posts',
      reply_markup: {
        inline_keyboard: [
          [{ text: '➕ Add new', callback_data: 'posts:new' }],
          [
            { text: '✅ Published', callback_data: 'posts:published' },
            { text: '🕒 Scheduled', callback_data: 'posts:scheduled' },
          ],
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
            [{ text: '➕ Добавить', callback_data: 'posts:new' }],
          ]),
        }),
      }),
    );
  });

  it('renders a purpose-built published read model into the callback message', async () => {
    const test = setup();
    test.prisma.telegramManagedPost.findMany.mockResolvedValue([
      post({
        publishedAt: new Date('2026-08-24T10:00:00.000Z'),
        scheduledAt: null,
        scheduleMode: null,
      }),
    ]);

    await test.service.callback(scope, 'posts:published', 77);

    expect(test.prisma.telegramManagedPost.findMany).toHaveBeenCalledWith({
      where: expect.objectContaining({
        workspaceId: 'workspace-1',
        status: TelegramManagedPostStatus.PUBLISHED,
      }),
      orderBy: [{ publishedAt: 'desc' }, { createdAt: 'desc' }],
      take: 8,
      select: {
        id: true,
        title: true,
        scheduledAt: true,
        publishedAt: true,
        scheduleMode: true,
        telegramChannel: { select: { title: true } },
      },
    });
    expect(test.api.editMessageText).toHaveBeenCalledWith(
      'token',
      expect.objectContaining({
        chat_id: scope.chatId,
        message_id: 77,
        text: expect.stringContaining('Summer campaign\nNews'),
      }),
    );
    expect(test.api.sendMessage).not.toHaveBeenCalled();
  });

  it('labels Telegram-native and System Bot schedules and exposes Publish now', async () => {
    const test = setup();
    test.prisma.telegramManagedPost.findMany.mockResolvedValue([
      post(),
      post({
        id: 'post-2',
        title: 'Local campaign',
        scheduleMode: 'LOCAL',
      }),
    ]);

    await test.service.callback(scope, 'posts:scheduled', 77);

    const card = test.api.editMessageText.mock.calls[0][1];
    expect(card.text).toContain('Telegram/MTProto');
    expect(card.text).toContain('System Bot');
    expect(card.reply_markup.inline_keyboard).toEqual(
      expect.arrayContaining([
        [
          expect.objectContaining({
            callback_data: 'posts:publish:post-1',
          }),
        ],
      ]),
    );
  });

  it('publishes an accessible scheduled post through the existing publication service', async () => {
    const test = setup();

    await test.service.callback(scope, 'posts:publish:post-1', 77);

    expect(test.prisma.telegramManagedPost.findFirst).toHaveBeenCalledWith({
      where: expect.objectContaining({
        id: 'post-1',
        workspaceId: 'workspace-1',
        status: TelegramManagedPostStatus.SCHEDULED,
      }),
      select: { id: true, telegramChannelId: true },
    });
    expect(test.moduleRef.registerRequestByContextId).toHaveBeenCalledWith(
      { headers: { 'x-workspace-id': 'workspace-1' } },
      expect.anything(),
    );
    expect(test.publication.publishManagedPostNow).toHaveBeenCalledWith(
      'user-1',
      'channel-1',
      'post-1',
      {},
    );
    expect(test.api.editMessageText).toHaveBeenCalledWith(
      'token',
      expect.objectContaining({
        message_id: 77,
        text: expect.stringContaining('✅ Post published.'),
      }),
    );
  });

  it('does not publish a post outside the workspace/access scope', async () => {
    const test = setup();
    test.prisma.telegramManagedPost.findFirst.mockResolvedValue(null);

    await test.service.callback(scope, 'posts:publish:foreign-post', 77);

    expect(test.publication.publishManagedPostNow).not.toHaveBeenCalled();
    expect(test.api.editMessageText).toHaveBeenCalledWith(
      'token',
      expect.objectContaining({
        message_id: 77,
        text: expect.stringContaining('Scheduled post is unavailable'),
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
});
