import { gzipSync } from 'node:zlib';
import { TelegramBotReactionAssets } from './telegram-bot-reaction-assets';

describe('TelegramBotReactionAssets', () => {
  it('batches document IDs, resolves original animated and static assets, and caches them', async () => {
    const api = {
      call: jest.fn().mockResolvedValue([
        {
          custom_emoji_id: '123',
          file_id: 'animated',
          emoji: '🤝',
          is_animated: true,
          is_video: false,
        },
        {
          custom_emoji_id: '456',
          file_id: 'static',
          emoji: '😀',
          is_animated: false,
          is_video: false,
        },
        {
          custom_emoji_id: '999',
          file_id: 'unrequested',
          is_animated: false,
          is_video: false,
        },
      ]),
      getFile: jest
        .fn()
        .mockImplementation(async (_token, id) => ({ file_path: id })),
      downloadFile: jest.fn().mockImplementation(async (_token, path) => ({
        bytes:
          path === 'animated'
            ? gzipSync(
                Buffer.from(
                  JSON.stringify({ v: '5', data: 'x'.repeat(515_000) }),
                ),
              )
            : Buffer.from('webp'),
      })),
    };
    const resolver = new TelegramBotReactionAssets(api as never);
    const assets = await resolver.get('secret', ['123', '456']);
    expect(assets['123']).toMatchObject({
      value: '🤝',
      telegramCustomEmojiKind: 'ANIMATED',
      telegramCustomEmojiRenderAssetUrl: expect.stringMatching(
        /^data:application\/json;base64,/,
      ),
    });
    expect(assets['456']).toMatchObject({
      telegramCustomEmojiKind: 'STATIC',
      telegramCustomEmojiAssetUrl: expect.stringMatching(
        /^data:image\/webp;base64,/,
      ),
    });
    expect(assets).not.toHaveProperty('999');
    await resolver.get('secret', ['123']);
    expect(api.call).toHaveBeenCalledTimes(1);
  });
  it('skips invalid data and respects cancellation', async () => {
    const api = {
      call: jest.fn().mockResolvedValue([
        {
          custom_emoji_id: '123',
          file_id: 'bad',
          is_animated: true,
          is_video: false,
        },
      ]),
      getFile: jest.fn().mockResolvedValue({ file_path: 'bad' }),
      downloadFile: jest
        .fn()
        .mockResolvedValue({ bytes: Buffer.from('invalid') }),
    };
    const resolver = new TelegramBotReactionAssets(api as never);
    expect(await resolver.get('secret', ['123'])).toEqual({});
    const abort = new AbortController();
    abort.abort();
    await expect(resolver.get('secret', ['123'], abort.signal)).rejects.toThrow(
      'REQUEST_ABORTED',
    );
  });
});
