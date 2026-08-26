import {
  systemBotCommandFor,
  systemBotMenuPayload,
} from './telegram-system-bot-menu';
import { TelegramSystemBotHandlerService } from './telegram-system-bot-handler.service';

function setup() {
  const api = {
    sendMessage: jest.fn().mockResolvedValue({ message_id: 99 }),
    deleteMessage: jest.fn().mockResolvedValue(true),
    answerCallbackQuery: jest.fn().mockResolvedValue(true),
  };
  const connections = {
    requireEnabledConnection: jest.fn().mockResolvedValue({
      id: 'connection-1',
      userId: 'user-1',
      telegramUserId: '44',
    }),
    requireCurrentWorkspace: jest.fn().mockResolvedValue({
      workspaceId: 'workspace-1',
      role: 'ADMIN',
      workspace: { name: 'Workspace', timezone: 'Europe/Warsaw' },
    }),
  };
  const postFlow = {
    begin: jest.fn().mockResolvedValue({ message_id: 100 }),
    isCallback: jest.fn().mockReturnValue(false),
    input: jest.fn().mockResolvedValue(null),
  };
  const posts = {
    open: jest.fn().mockResolvedValue({ message_id: 101 }),
    isCallback: jest
      .fn()
      .mockImplementation((value: string) => value.startsWith('posts:')),
    callback: jest.fn().mockResolvedValue({ message_id: 77 }),
  };
  const service = new TelegramSystemBotHandlerService(
    { token: 'token' } as never,
    api as never,
    connections as never,
    {} as never,
    { pendingInput: jest.fn().mockResolvedValue(null) } as never,
    postFlow as never,
    undefined,
    posts as never,
  );
  return { service, postFlow, posts };
}

const message = (text: string) => ({
  message: {
    chat: { id: 44, type: 'private' },
    from: { id: 44 },
    text,
  },
});

const callback = (data: string) => ({
  callback_query: {
    id: 'callback-1',
    data,
    from: { id: 44 },
    message: {
      chat: { id: 44, type: 'private' },
      message_id: 77,
    },
  },
});

describe('TelegramSystemBot Posts routing', () => {
  it('maps the Posts keyboard label and keeps /post as the direct wizard', () => {
    expect(systemBotCommandFor('📝 Posts')).toBe('/posts');
    expect(systemBotCommandFor('/post')).toBe('/post');
    expect(
      systemBotMenuPayload({ name: 'Workspace' }).reply_markup.keyboard,
    ).toEqual(
      expect.arrayContaining([
        expect.arrayContaining([expect.objectContaining({ text: '📝 Posts' })]),
      ]),
    );
  });

  it('opens the hub for /posts and the new wizard for /post', async () => {
    const test = setup();

    await test.service.handle(message('/posts'));
    await test.service.handle(message('/post'));

    expect(test.posts.open).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceId: 'workspace-1',
        telegramUserId: '44',
      }),
    );
    expect(test.postFlow.begin).toHaveBeenCalledTimes(1);
  });

  it('starts Add new and routes list navigation with its control message id', async () => {
    const test = setup();

    await test.service.handle(callback('posts:new'));
    await test.service.handle(callback('posts:scheduled'));

    expect(test.postFlow.begin).toHaveBeenCalledWith(
      expect.objectContaining({ workspaceId: 'workspace-1' }),
    );
    expect(test.posts.callback).toHaveBeenCalledWith(
      expect.objectContaining({ workspaceId: 'workspace-1' }),
      'posts:scheduled',
      77,
    );
  });
});
