import { BadRequestException } from '@nestjs/common';
import {
  normalizeTelegramCustomEmojiPackSource,
  parseTelegramCustomEmojiDocumentId,
} from './telegram-custom-emoji-pack';

describe('Telegram Custom Emoji pack input', () => {
  it.each([
    ['https://t.me/addemoji/Fire_Set', 'Fire_Set'],
    ['tg://addemoji?set=Fire_Set', 'Fire_Set'],
    ['Fire_Set', 'Fire_Set'],
  ])('normalizes %s', (source, expected) => {
    expect(normalizeTelegramCustomEmojiPackSource(source)).toBe(expected);
  });

  it('recognizes a 64-bit document ID without coercing it to a number', () => {
    expect(parseTelegramCustomEmojiDocumentId('5368324170671202286')).toBe(
      '5368324170671202286',
    );
  });

  it('rejects an invalid pack source', () => {
    expect(() =>
      normalizeTelegramCustomEmojiPackSource('https://example.com/nope'),
    ).toThrow(BadRequestException);
  });
});
