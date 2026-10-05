import { sendTelegramSystemBotPostPreview } from './telegram-system-bot-post-preview.sender';

describe('sendTelegramSystemBotPostPreview', () => {
  it('sends a Premium emoji button through Bot API native icon markup', async () => {
    const api = {
      call: jest.fn(),
      sendMessage: jest.fn().mockResolvedValue({ message_id: 7 }),
      sendMediaGroup: jest.fn(),
      sendPhoto: jest.fn(),
    };

    await sendTelegramSystemBotPostPreview({
      api: api as never,
      token: 'bot-token',
      scope: {
        connectionId: 'connection-1', workspaceId: 'workspace-1', userId: 'user-1',
        telegramUserId: 'telegram-user-1', chatId: 'chat-1', timezone: 'Europe/Warsaw',
      },
      draft: {
        text: 'Preview', imageUrls: [], mediaItems: [],
        // Existing drafts may still contain the old markup. The shared
        // keyboard normalizer must repair that form as well.
        buttonRows: [[{
          text: '![📣](tg://emoji?id=5330237710655306682) Subscribe',
          url: 'https://example.com', style: 'primary',
        }]],
      },
    });

    expect(api.sendMessage).toHaveBeenCalledWith('bot-token', expect.objectContaining({
      reply_markup: {
        inline_keyboard: [[{
          text: '📣 Subscribe', url: 'https://example.com', style: 'primary',
          icon_custom_emoji_id: '5330237710655306682',
        }]],
      },
    }));
  });

  it('keeps a video and a custom-emoji caption together when the visible caption fits', async () => {
    const api = {
      call: jest.fn().mockResolvedValue({ message_id: 42 }),
      sendMessage: jest.fn(),
      sendMediaGroup: jest.fn(),
      sendPhoto: jest.fn(),
    };
    const customEmoji = '![✨](tg://emoji?id=5368324170671202286)';
    const text = `${customEmoji.repeat(30)} One caption`;

    expect(text.length).toBeGreaterThan(1024);

    await expect(
      sendTelegramSystemBotPostPreview({
        api: api as never,
        token: 'bot-token',
        scope: {
          connectionId: 'connection-1',
          workspaceId: 'workspace-1',
          userId: 'user-1',
          telegramUserId: 'telegram-user-1',
          chatId: 'chat-1',
          timezone: 'Europe/Warsaw',
        },
        draft: {
          text,
          mediaItems: [
            { kind: 'VIDEO', url: 'https://cdn.example.test/post.mp4' },
          ],
          imageUrls: [],
          buttonRows: [],
        },
      }),
    ).resolves.toEqual({ status: 'SENT', messageIds: [42] });

    expect(api.call).toHaveBeenCalledWith(
      'bot-token',
      'sendVideo',
      expect.objectContaining({
        chat_id: 'chat-1',
        caption: expect.stringContaining('<tg-emoji'),
      }),
    );
    expect(api.sendMessage).not.toHaveBeenCalled();
    expect(api.sendMediaGroup).not.toHaveBeenCalled();
  });
});
