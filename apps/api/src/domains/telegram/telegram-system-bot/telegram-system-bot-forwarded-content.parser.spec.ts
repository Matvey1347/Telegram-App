import { Api } from 'telegram';
import { HTMLParser } from 'telegram/extensions/html';
import {
  telegramHtmlToMtprotoHtml,
  telegramMarkupToHtml,
} from '../../../telegram/shared/telegram-markup';
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
      '😀 Bold Italic Under Strike Secret Code Pre\nQuote\nHidden\nPerson Premium Tomorrow';
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
        entity('date_time', 'Tomorrow', {
          unix_time: 1_700_086_400,
          date_time_format: 'wDT',
        }),
      ],
      forward_date: 1_700_000_000,
    });

    expect(result).toMatchObject({
      ok: true,
      content: {
        managedText:
          '😀 **Bold** __Italic__ ++Under++ ~~Strike~~ ||Secret|| `Code` ```ts\nPre```\n> Quote\n>> Hidden\n[Person](tg://user?id=42) ![Premium](tg://emoji?id=5368324170671202286) [Tomorrow](tg://time?unix=1700086400&format=wDT)',
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

  it('merges duplicate and adjacent formatting entities into unambiguous markup', () => {
    const result = parseTelegramSystemBotForwardedContent({
      text: 'FirstSecond',
      entities: [
        { type: 'bold', offset: 0, length: 5 },
        { type: 'bold', offset: 0, length: 5 },
        { type: 'bold', offset: 5, length: 6 },
        {
          type: 'text_link',
          offset: 0,
          length: 11,
          url: 'https://example.com/post',
        },
      ],
      forward_date: 1_700_000_000,
    });

    expect(result).toMatchObject({
      ok: true,
      content: {
        managedText: '**[FirstSecond](https://example.com/post)**',
        formattedHtml:
          '<b><a href="https://example.com/post">FirstSecond</a></b>',
      },
    });
  });

  it('round-trips multiline links, nested formatting, spoilers, emoji offsets, and literal markup', () => {
    const text = [
      '🥑Твоє здорове',
      'життя',
      '🌷Квітучий сад',
      'прихований тест',
      'Literal ** [] || `code`',
    ].join('\n');
    const span = (value: string) => ({
      offset: text.indexOf(value),
      length: value.length,
    });
    const linkedLines = '🥑Твоє здорове\nжиття';
    const result = parseTelegramSystemBotForwardedContent({
      text,
      entities: [
        {
          type: 'text_link',
          ...span(linkedLines),
          url: 'https://t.me/+Pc5DA7eKOCRmOTQ6',
        },
        { type: 'bold', ...span(linkedLines) },
        {
          type: 'text_link',
          ...span('🌷Квітучий сад'),
          url: 'https://example.com/flower_(garden)',
        },
        { type: 'bold', ...span('🌷Квітучий сад') },
        { type: 'spoiler', ...span('прихований тест') },
      ],
      forward_date: 1_700_000_000,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('Expected forwarded content');
    const html = telegramMarkupToHtml(result.content.managedText);
    const [roundTrippedText, entities] = HTMLParser.parse(
      telegramHtmlToMtprotoHtml(html),
    );

    expect(roundTrippedText).toBe(text);
    expect(
      entities.some(
        (entity) =>
          entity instanceof Api.MessageEntityTextUrl &&
          entity.offset === span(linkedLines).offset &&
          entity.length === span(linkedLines).length &&
          entity.url === 'https://t.me/+Pc5DA7eKOCRmOTQ6',
      ),
    ).toBe(true);
    expect(
      entities.some(
        (entity) =>
          entity instanceof Api.MessageEntityBold &&
          entity.offset === span(linkedLines).offset &&
          entity.length === span(linkedLines).length,
      ),
    ).toBe(true);
    expect(
      entities.some(
        (entity) =>
          entity instanceof Api.MessageEntitySpoiler &&
          entity.offset === span('прихований тест').offset &&
          entity.length === span('прихований тест').length,
      ),
    ).toBe(true);
    expect(html).not.toContain('&#x20;');
  });

  it('does not interpret literal managed-markup characters in an unformatted forwarded post', () => {
    const text =
      'Literal **bold** [link](https://example.com) ||visible|| `code`';
    const result = parseTelegramSystemBotForwardedContent({
      text,
      forward_date: 1_700_000_000,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('Expected forwarded content');
    const html = telegramMarkupToHtml(result.content.managedText);
    const [roundTrippedText, entities] = HTMLParser.parse(
      telegramHtmlToMtprotoHtml(html),
    );

    expect(roundTrippedText).toBe(text);
    expect(entities).toEqual([]);
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

  it.each(['document', 'sticker'] as const)(
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

  it.each([
    ['VIDEO', 'video', 'video/mp4'],
    ['ANIMATION', 'animation', 'image/gif'],
  ] as const)(
    'captures %s media instead of rejecting it',
    (kind, field, mimeType) => {
      const result = parseTelegramSystemBotForwardedContent({
        caption: 'Motion caption',
        forward_date: 1_700_000_000,
        [field]: {
          file_id: `${field}-file`,
          file_unique_id: `${field}-unique`,
          file_size: 1024,
          width: 640,
          height: 360,
          duration: 4,
          mime_type: mimeType,
        },
      });
      expect(result).toMatchObject({
        ok: true,
        content: {
          text: 'Motion caption',
          media: {
            kind,
            fileId: `${field}-file`,
            mimeType,
            durationSeconds: 4,
          },
        },
      });
    },
  );
});
