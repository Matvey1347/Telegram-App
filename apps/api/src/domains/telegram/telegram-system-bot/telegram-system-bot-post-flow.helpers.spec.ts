import {
  mergeTelegramSystemBotAlbumContent,
  telegramSystemBotPostTitle,
} from './telegram-system-bot-post-flow.helpers';
import type { TelegramSystemBotCapturedPostContent } from './telegram-system-bot-post-flow.types';

const content = (
  overrides: Partial<TelegramSystemBotCapturedPostContent>,
): TelegramSystemBotCapturedPostContent => ({
  text: '',
  imageUrls: [],
  buttonRows: [],
  mediaGroupId: 'album-1',
  sourceTitle: null,
  warnings: [],
  ...overrides,
});

describe('Telegram System Bot post flow helpers', () => {
  it('keeps the plain caption when it arrives after the first album photo', () => {
    const merged = mergeTelegramSystemBotAlbumContent(
      content({ imageUrls: ['first.jpg'] }),
      content({
        text: '**Caption**',
        plainText: 'Caption',
        imageUrls: ['second.jpg'],
      }),
    );

    expect(merged).toMatchObject({
      text: '**Caption**',
      plainText: 'Caption',
      imageUrls: ['first.jpg', 'second.jpg'],
    });
    expect(telegramSystemBotPostTitle(merged)).toBe('Caption');
  });
});
