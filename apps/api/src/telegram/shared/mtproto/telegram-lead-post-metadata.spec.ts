import { Api } from 'telegram';
import { parseTelegramLeadPost } from './telegram-lead-channel-normalizer';

describe('Telegram channel post metadata', () => {
  it('retains hidden entity and button URLs, mentions, forwarding and media without reading the media', () => {
    const text = 'Посилання @example_manager';
    const message = new Api.Message({
      id: 21,
      date: 1000,
      peerId: new Api.PeerChannel({ channelId: '123' as never }),
      message: text,
      entities: [
        new Api.MessageEntityTextUrl({
          offset: 0,
          length: 9,
          url: 'https://example.org/hidden',
        }),
        new Api.MessageEntityMention({ offset: 10, length: 16 }),
      ],
      replyMarkup: new Api.ReplyInlineMarkup({
        rows: [
          new Api.KeyboardButtonRow({
            buttons: [
              new Api.KeyboardButtonUrl({
                text: 'Open',
                url: 'https://example.net/page',
              }),
            ],
          }),
        ],
      }),
      fwdFrom: new Api.MessageFwdHeader({
        date: 900,
        fromId: new Api.PeerChannel({ channelId: '456' as never }),
      }),
      media: new Api.MessageMediaPhoto({}),
    });
    expect(parseTelegramLeadPost(message, '123')?.metadata).toEqual({
      complete: false,
      textComplete: true,
      incompleteReasons: ['MEDIA_CONTENT_UNAVAILABLE'],
      entityUrls: ['https://example.org/hidden'],
      textUrls: ['https://example.org/hidden'],
      inlineButtonUrls: ['https://example.net/page'],
      mentions: ['@example_manager'],
      hasForwardMetadata: true,
      forwardChannelId: '456',
      hasMedia: true,
      mediaType: 'PHOTO',
    });
  });
  it('drops unsafe URLs and invalid entity offsets while retaining missing metadata as absent', () => {
    const message = new Api.Message({
      id: 22,
      date: 1000,
      peerId: new Api.PeerChannel({ channelId: '123' as never }),
      message: 'text',
      entities: [
        new Api.MessageEntityTextUrl({
          offset: 0,
          length: 4,
          url: 'javascript:alert(1)',
        }),
        new Api.MessageEntityMention({ offset: 99, length: 10 }),
      ],
      replyMarkup: new Api.ReplyInlineMarkup({
        rows: [
          new Api.KeyboardButtonRow({
            buttons: [
              new Api.KeyboardButtonUrl({
                text: 'Bad',
                url: 'https://user:password@example.org/',
              }),
            ],
          }),
        ],
      }),
    });
    expect(parseTelegramLeadPost(message, '123')?.metadata).toEqual({
      complete: false,
      textComplete: false,
      incompleteReasons: ['UNSUPPORTED_URL', 'INVALID_ENTITY_OFFSET'],
      entityUrls: [],
      textUrls: [],
      inlineButtonUrls: [],
      mentions: [],
      hasForwardMetadata: false,
      forwardChannelId: null,
      hasMedia: false,
      mediaType: null,
    });
    expect(parseTelegramLeadPost(message, '999')).toBeNull();
  });
  it('uses Telegram UTF-16 offsets with emoji and recognizes a scheme-less Telegram link', () => {
    const text = '🧠 t.me/example_channel';
    const message = new Api.Message({
      id: 23,
      date: 1000,
      peerId: new Api.PeerChannel({ channelId: '123' as never }),
      message: text,
      entities: [
        new Api.MessageEntityUrl({ offset: 3, length: text.length - 3 }),
      ],
    });
    expect(parseTelegramLeadPost(message, '123')?.metadata).toMatchObject({
      complete: true,
      entityUrls: ['https://t.me/example_channel'],
    });
  });
  it('marks bounded and unknown entities incomplete instead of treating missing metadata as safe', () => {
    const text = 'x';
    const message = new Api.Message({
      id: 24,
      date: 1000,
      peerId: new Api.PeerChannel({ channelId: '123' as never }),
      message: text,
      entities: Array.from(
        { length: 101 },
        () => new Api.MessageEntityBold({ offset: 0, length: 1 }),
      ),
    });
    expect(parseTelegramLeadPost(message, '123')?.metadata).toMatchObject({
      complete: false,
      incompleteReasons: ['ENTITY_LIMIT'],
    });
  });
  it('accepts validated formatting while preserving incomplete media and unknown entities', () => {
    const make = (
      entities: Api.TypeMessageEntity[],
      media?: Api.TypeMessageMedia,
    ) =>
      new Api.Message({
        id: 26,
        date: 1000,
        peerId: new Api.PeerChannel({ channelId: '123' as never }),
        message: 'abc',
        entities,
        media,
      });
    const bold = new Api.MessageEntityBold({ offset: 0, length: 3 });
    expect(parseTelegramLeadPost(make([bold]), '123')?.metadata).toMatchObject({
      complete: true,
      incompleteReasons: [],
    });
    expect(
      parseTelegramLeadPost(
        make([new Api.MessageEntityItalic({ offset: 4, length: 1 })]),
        '123',
      )?.metadata,
    ).toMatchObject({
      complete: false,
      incompleteReasons: ['INVALID_ENTITY_OFFSET'],
    });
    expect(
      parseTelegramLeadPost(make([bold], new Api.MessageMediaPhoto({})), '123')
        ?.metadata,
    ).toMatchObject({
      complete: false,
      incompleteReasons: ['MEDIA_CONTENT_UNAVAILABLE'],
    });
    expect(
      parseTelegramLeadPost(
        make([
          new Api.MessageEntityMentionName({
            offset: 0,
            length: 3,
            userId: '42' as never,
          }),
        ]),
        '123',
      )?.metadata,
    ).toMatchObject({
      complete: false,
      incompleteReasons: ['UNSUPPORTED_ENTITY'],
      unsupportedEntityTypes: ['MessageEntityMentionName'],
    });
  });
  it('accepts text-only formatting and phone entities without hiding bad offsets', () => {
    const message = new Api.Message({
      id: 27,
      date: 1000,
      peerId: new Api.PeerChannel({ channelId: '123' as never }),
      message: 'call +12345 🙂',
      entities: [
        new Api.MessageEntityPhone({ offset: 5, length: 6 }),
        new Api.MessageEntityCode({ offset: 0, length: 4 }),
        new Api.MessageEntitySpoiler({ offset: 0, length: 4 }),
        new Api.MessageEntityCustomEmoji({
          offset: 12,
          length: 2,
          documentId: '9' as never,
        }),
      ],
    });
    expect(parseTelegramLeadPost(message, '123')?.metadata).toMatchObject({
      textComplete: true,
      incompleteReasons: [],
    });
    message.entities = [new Api.MessageEntityPhone({ offset: 99, length: 1 })];
    expect(parseTelegramLeadPost(message, '123')?.metadata).toMatchObject({
      textComplete: false,
      incompleteReasons: ['INVALID_ENTITY_OFFSET'],
    });
  });
  it('bounds aggregate URL metadata and marks truncation', () => {
    const message = new Api.Message({
      id: 25,
      date: 1000,
      peerId: new Api.PeerChannel({ channelId: '123' as never }),
      message: 'x',
      entities: Array.from(
        { length: 20 },
        (_, index) =>
          new Api.MessageEntityTextUrl({
            offset: 0,
            length: 1,
            url: `https://example.org/${index}/${'a'.repeat(350)}`,
          }),
      ),
    });
    const metadata = parseTelegramLeadPost(message, '123')?.metadata;
    expect(metadata?.complete).toBe(false);
    expect(metadata?.incompleteReasons).toContain('METADATA_SIZE_LIMIT');
    expect(
      Buffer.byteLength(metadata?.entityUrls.join('') ?? '', 'utf8'),
    ).toBeLessThanOrEqual(4096);
  });
});
