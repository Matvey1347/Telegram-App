import {
  telegramCustomEmojiToWireText,
  telegramWireTextToCustomEmojiMarkup,
} from './telegram-custom-emoji-markup';

describe('Telegram custom emoji markup', () => {
  it('converts canonical tokens to wire text and UTF-16 MTProto entities', () => {
    const result = telegramCustomEmojiToWireText(
      '😀 ![🔥](tg://emoji?id=5368324170671202286) ok',
    );
    expect(result.text).toBe('😀 🔥 ok');
    expect(result.entities).toHaveLength(1);
    expect(result.entities[0]).toMatchObject({ offset: 3, length: 2 });
    expect(String(result.entities[0].documentId)).toBe('5368324170671202286');
  });

  it('round-trips imported MTProto custom emoji entities', () => {
    expect(
      telegramWireTextToCustomEmojiMarkup({
        text: 'Hi 🔥',
        entities: [
          {
            className: 'MessageEntityCustomEmoji',
            offset: 3,
            length: 2,
            documentId: '42',
          },
        ],
      }),
    ).toBe('Hi ![🔥](tg://emoji?id=42)');
  });
});
