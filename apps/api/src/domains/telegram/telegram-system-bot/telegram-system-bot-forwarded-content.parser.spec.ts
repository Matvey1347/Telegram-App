import { parseTelegramSystemBotForwardedContent } from './telegram-system-bot-forwarded-content.parser';

describe('parseTelegramSystemBotForwardedContent', () => {
  it('normalizes forwarded text and source metadata', () => {
    expect(
      parseTelegramSystemBotForwardedContent({
        message_id: 44,
        text: '  First line\r\nSecond line  ',
        entities: [{ type: 'bold', offset: 2, length: 5 }],
        forward_origin: {
          type: 'channel',
          date: 1_700_000_000,
          message_id: 101,
          chat: {
            id: -100123,
            type: 'channel',
            title: 'Source',
            username: 'source_channel',
          },
        },
      }),
    ).toEqual({
      ok: true,
      warnings: [],
      content: expect.objectContaining({
        telegramMessageId: 44,
        text: 'First line\nSecond line',
        managedText: expect.any(String),
        textSource: 'text',
        entities: [{ type: 'bold', offset: 2, length: 5 }],
        forward: expect.objectContaining({
          type: 'channel',
          sourceChatId: '-100123',
          sourceMessageId: 101,
          sourceChatUsername: 'source_channel',
        }),
      }),
    });
  });

  it('converts Bot API entities into editable managed-post markup with UTF-16 offsets', () => {
    const result = parseTelegramSystemBotForwardedContent({
      text: 'Deal today — open',
      entities: [
        { type: 'bold', offset: 0, length: 4 },
        {
          type: 'text_link',
          offset: 13,
          length: 4,
          url: 'https://example.com/deal',
        },
      ],
      forward_date: 1_700_000_000,
    });

    expect(result).toMatchObject({
      ok: true,
      content: {
        managedText: '**Deal** today — [open](https://example.com/deal)',
      },
    });
  });

  it('selects the best photo and uses its caption', () => {
    const result = parseTelegramSystemBotForwardedContent({
      caption: ' Photo caption ',
      media_group_id: 'album-1',
      photo: [
        { file_id: 'small', file_size: 100, width: 90, height: 90 },
        {
          file_id: 'large',
          file_unique_id: 'stable',
          file_size: 1_000,
          width: 1280,
          height: 720,
        },
      ],
      forward_date: 1_700_000_000,
    });

    expect(result).toMatchObject({
      ok: true,
      content: {
        text: 'Photo caption',
        textSource: 'caption',
        mediaGroupId: 'album-1',
        photo: { fileId: 'large', fileUniqueId: 'stable' },
      },
    });
  });

  it('keeps URL buttons and removes unsupported button actions', () => {
    const result = parseTelegramSystemBotForwardedContent({
      text: 'Post',
      forward_date: 1_700_000_000,
      reply_markup: {
        inline_keyboard: [
          [
            { text: 'Website', url: 'https://example.com', style: 'primary' },
            { text: 'Source bot action', callback_data: 'buy:1' },
          ],
          [{ text: 'Telegram', url: 'tg://resolve?domain=example' }],
          [{ text: 'Invalid', url: 'javascript:alert(1)' }],
        ],
      },
    });

    expect(result).toEqual({
      ok: true,
      warnings: ['UNSUPPORTED_BUTTONS_REMOVED', 'INVALID_URL_BUTTONS_REMOVED'],
      content: expect.objectContaining({
        buttonRows: [
          [{ text: 'Website', url: 'https://example.com', style: 'primary' }],
          [
            {
              text: 'Telegram',
              url: 'tg://resolve?domain=example',
              style: 'default',
            },
          ],
        ],
      }),
    });
  });

  it.each(['video', 'document', 'sticker'] as const)(
    'rejects unsupported %s media explicitly',
    (media) => {
      expect(
        parseTelegramSystemBotForwardedContent({
          text: 'Caption',
          forward_date: 1_700_000_000,
          [media]: { file_id: 'unsupported' },
        }),
      ).toEqual({
        ok: false,
        reason: 'UNSUPPORTED_MEDIA',
        unsupportedMedia: [media],
        warnings: [],
      });
    },
  );
});
