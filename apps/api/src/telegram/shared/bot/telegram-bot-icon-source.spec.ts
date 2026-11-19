import {
  storedTelegramIconHtml,
  telegramCustomEmojiHtmlFallback,
} from './telegram-bot-icon-source';

describe('stored Telegram icon HTML', () => {
  it.each(['5368324170671202286', '42'])(
    'renders the canonical custom emoji %s as a real HTML entity',
    (id) => {
      expect(storedTelegramIconHtml(`![📢](tg://emoji?id=${id})`, '🔔')).toBe(
        `<tg-emoji emoji-id="${id}">📢</tg-emoji>`,
      );
    },
  );

  it('keeps Unicode fallbacks in destinations without custom emoji', () => {
    expect(storedTelegramIconHtml('![📢](tg://emoji?id=42)', '🔔', false)).toBe(
      '📢',
    );
    expect(storedTelegramIconHtml(null, '🔔')).toBe('🔔');
    expect(
      storedTelegramIconHtml('image:https://example.org/photo.png', '🔔'),
    ).toBe('🔔');
  });

  it('escapes untrusted stored values and token ALT instead of injecting HTML', () => {
    expect(storedTelegramIconHtml('<b>bad</b>', '🔔')).toBe(
      '&lt;b&gt;bad&lt;/b&gt;',
    );
    expect(storedTelegramIconHtml('![<x>&](tg://emoji?id=42)', '🔔')).toBe(
      '<tg-emoji emoji-id="42">&lt;x&gt;&amp;</tg-emoji>',
    );
  });

  it('removes only custom emoji tags while retaining links and escaped ALT', () => {
    expect(
      telegramCustomEmojiHtmlFallback(
        '<a href="https://t.me/channel"><tg-emoji emoji-id="42">📢</tg-emoji> News &amp; updates</a>',
      ),
    ).toBe('<a href="https://t.me/channel">📢 News &amp; updates</a>');
  });
});
