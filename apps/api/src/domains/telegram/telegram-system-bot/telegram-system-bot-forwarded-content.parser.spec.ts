import { parseTelegramSystemBotForwardedContent } from './telegram-system-bot-forwarded-content.parser';

describe('parseTelegramSystemBotForwardedContent', () => {
  it('normalizes line endings without dropping forwarded whitespace or source metadata', () => {
    const result = parseTelegramSystemBotForwardedContent({
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
    });
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('Expected forwarded content');
    expect(result.warnings).toEqual([]);
    expect(result.content.telegramMessageId).toBe(44);
    expect(result.content.text).toBe('  First line\nSecond line  ');
    expect(result.content.managedText).toBe('  **First** line\nSecond line  ');
    expect(result.content.textSource).toBe('text');
    expect(result.content.entities).toEqual([
      { type: 'bold', offset: 2, length: 5 },
    ]);
    expect(result.content.forward).toMatchObject({
      type: 'channel',
      sourceChatId: '-100123',
      sourceMessageId: 101,
      sourceChatUsername: 'source_channel',
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

  it('preserves every Bot API formatting entity supported by Telegram posts', () => {
    const text =
      '😀 Bold Italic Under Strike Secret Code Pre\nQuote\nHidden\nPerson Premium';
    const entity = (
      type: string,
      value: string,
      extra: Record<string, unknown> = {},
    ) => ({
      type,
      offset: text.indexOf(value),
      length: value.length,
      ...extra,
    });
    const result = parseTelegramSystemBotForwardedContent({
      text,
      entities: [
        entity('bold', 'Bold'),
        entity('italic', 'Italic'),
        entity('underline', 'Under'),
        entity('strikethrough', 'Strike'),
        entity('spoiler', 'Secret'),
        entity('code', 'Code'),
        entity('pre', 'Pre', { language: 'ts' }),
        entity('blockquote', 'Quote'),
        entity('expandable_blockquote', 'Hidden'),
        entity('text_mention', 'Person', { user: { id: 42 } }),
        entity('custom_emoji', 'Premium', {
          custom_emoji_id: '5368324170671202286',
        }),
      ],
      forward_date: 1_700_000_000,
    });

    expect(result).toMatchObject({
      ok: true,
      content: {
        managedText:
          '😀 **Bold** __Italic__ ++Under++ ~~Strike~~ ||Secret|| `Code` ```ts\nPre```\n> Quote\n>> Hidden\n[Person](tg://user?id=42) ![Premium](tg://emoji?id=5368324170671202286)',
      },
    });
  });

  it.each([
    [
      { type: 'bold', offset: 0, length: 16 },
      {
        type: 'text_link',
        offset: 0,
        length: 16,
        url: 'https://t.me/mental_mentality',
      },
    ],
    [
      {
        type: 'text_link',
        offset: 0,
        length: 16,
        url: 'https://t.me/mental_mentality',
      },
      { type: 'bold', offset: 0, length: 16 },
    ],
  ])(
    'keeps bold and link markup nested regardless of entity order',
    (...entities) => {
      const result = parseTelegramSystemBotForwardedContent({
        text: 'Mental mentality',
        entities,
        forward_date: 1_700_000_000,
      });

      expect(result).toMatchObject({
        ok: true,
        content: {
          managedText: '**[Mental mentality](https://t.me/mental_mentality)**',
        },
      });
    },
  );

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
        text: ' Photo caption ',
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

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('Expected forwarded content');
    expect(result.warnings).toEqual([
      'UNSUPPORTED_BUTTONS_REMOVED',
      'INVALID_URL_BUTTONS_REMOVED',
    ]);
    expect(result.content.buttonRows).toEqual([
      [{ text: 'Website', url: 'https://example.com', style: 'primary' }],
      [
        {
          text: 'Telegram',
          url: 'tg://resolve?domain=example',
          style: 'default',
        },
      ],
    ]);
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
