import {
  normalizeTelegramPostButtonRows,
  toTelegramBotInlineKeyboard,
} from './telegram-inline-keyboard';

describe('Telegram inline keyboard', () => {
  it('sends a selected Premium emoji through Bot API instead of button text', () => {
    const keyboard = toTelegramBotInlineKeyboard([
      [
        {
          text: 'Subscribe',
          url: 'https://example.com',
          style: 'primary',
          iconCustomEmojiId: '5330237710655306682',
        },
      ],
    ]);

    expect(keyboard).toEqual({
      inline_keyboard: [
        [
          {
            text: 'Subscribe',
            url: 'https://example.com',
            style: 'primary',
            icon_custom_emoji_id: '5330237710655306682',
          },
        ],
      ],
    });
  });

  it('repairs legacy Premium emoji markup stored in a button label', () => {
    const rows = normalizeTelegramPostButtonRows([
      [
        {
          text: '![📣](tg://emoji?id=5330237710655306682) Subscribe',
          url: 'https://example.com',
          style: 'primary',
        },
      ],
    ]);

    expect(toTelegramBotInlineKeyboard(rows)).toEqual({
      inline_keyboard: [
        [
          {
            text: '📣 Subscribe',
            url: 'https://example.com',
            style: 'primary',
            icon_custom_emoji_id: '5330237710655306682',
          },
        ],
      ],
    });
  });

  it('removes invisible copied characters from a button URL for Bot API delivery', () => {
    const keyboard = toTelegramBotInlineKeyboard(
      normalizeTelegramPostButtonRows([
        [
          {
            text: 'Join',
            // U+2060 can be copied with a Telegram invite link. Bot API
            // rejects it with BUTTON_URL_INVALID.
            url: 'https://t.me/+ovHEbXGetFhiNDhi\u2060',
            style: 'default',
          },
        ],
      ]),
    );

    expect(keyboard).toEqual({
      inline_keyboard: [
        [{ text: 'Join', url: 'https://t.me/+ovHEbXGetFhiNDhi' }],
      ],
    });
  });
});
