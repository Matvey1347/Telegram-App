import { TelegramBotApiError } from '@api/telegram/shared/bot/telegram-bot-api.client';
import { TelegramSystemBotHandlerService } from './telegram-system-bot-handler.service';

describe('System Bot statistics emoji delivery', () => {
  it('retains the statistics response when Telegram explicitly rejects channel custom emoji', async () => {
    const api = {
      sendMessage: jest
        .fn<
          Promise<{ message_id: number }>,
          [string, { text: string; parse_mode?: string }]
        >()
        .mockRejectedValueOnce(
          new TelegramBotApiError('CUSTOM_EMOJI_NOT_ALLOWED', 'PERMANENT', {
            explicitRejected: true,
            errorCode: 400,
          }),
        )
        .mockResolvedValue({ message_id: 22 }),
    };
    const connections = {
      requireEnabledConnection: jest
        .fn()
        .mockResolvedValue({ id: 'connection', userId: 'user' }),
      requireCurrentWorkspace: jest.fn().mockResolvedValue({
        workspaceId: 'workspace',
        role: 'admin',
        workspace: { name: 'Business' },
      }),
    };
    const domain = {
      stats: jest.fn().mockResolvedValue({
        telegramChannelsCount: 1,
        topOwnChannels: [
          {
            title: 'News',
            subscribers: 250,
            iconPresentation: {
              type: 'unicode',
              value: '📢',
              telegramCustomEmojiId: '42',
            },
          },
        ],
      }),
    };
    const service = new TelegramSystemBotHandlerService(
      { token: 'test-token' } as never,
      api as never,
      connections as never,
      domain as never,
      {} as never,
    );
    await service.handle({
      update_id: 1,
      message: {
        chat: { id: 44, type: 'private' },
        from: { id: 44 },
        text: '/stats',
      },
    });
    expect(api.sendMessage).toHaveBeenCalledTimes(2);
    const [first, fallback] = api.sendMessage.mock.calls;
    expect(first[0]).toBe('test-token');
    expect(first[1].text).toContain(
      '<tg-emoji emoji-id="42">📢</tg-emoji> News',
    );
    expect(fallback[0]).toBe('test-token');
    expect(fallback[1].text).toContain('📢 News: 250 subscribers');
    expect(fallback[1].parse_mode).toBe('HTML');
  });
});
