import {
  storedTelegramIconPresentation,
  TelegramBotIconCaptureService,
  telegramIconSourceFromText,
} from './telegram-bot-icon-capture.service';

describe('Telegram bot icon capture', () => {
  it('captures one unicode emoji and rejects ordinary text', () => {
    expect(telegramIconSourceFromText({ text: '🪴' })).toBe('🪴');
    expect(telegramIconSourceFromText({ text: 'plant' })).toBeNull();
    expect(telegramIconSourceFromText({ text: '🪴 plant' })).toBeNull();
  });

  it('preserves the document id of a Telegram Premium emoji', () => {
    const source = telegramIconSourceFromText({
      text: '🔥',
      entities: [
        {
          type: 'custom_emoji',
          offset: 0,
          length: 2,
          custom_emoji_id: '5368324170671202286',
        },
      ],
    });
    expect(source).toBe('![🔥](tg://emoji?id=5368324170671202286)');
    expect(storedTelegramIconPresentation(source, '🏷️')).toEqual({
      type: 'unicode',
      value: '🔥',
      telegramCustomEmojiId: '5368324170671202286',
    });
  });

  it('stores a Telegram photo in immutable object storage', async () => {
    const botApi = {
      getFile: jest.fn().mockResolvedValue({ file_path: 'photos/icon.jpg' }),
      downloadFile: jest.fn().mockResolvedValue({
        bytes: Buffer.from('image'),
        contentType: 'image/jpeg',
      }),
    };
    const storage = {
      persistImmutableImages: jest
        .fn()
        .mockResolvedValue({ urls: ['https://cdn.test/icon.jpg'] }),
    };
    const service = new TelegramBotIconCaptureService(
      botApi as never,
      storage as never,
    );

    await expect(
      service.media('token', {
        photo: [
          { file_id: 'small', file_size: 10 },
          { file_id: 'large', file_size: 20 },
        ],
      }),
    ).resolves.toBe('image:https://cdn.test/icon.jpg');
    expect(botApi.getFile).toHaveBeenCalledWith('token', 'large');
  });
});
