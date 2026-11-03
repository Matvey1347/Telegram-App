import { telegramPostPublishErrorCode } from './telegram-posts.errors';

describe('publication errors', () => {
  it('identifies an image download failure and preserves the generic fallback', () => {
    expect(telegramPostPublishErrorCode('Could not download image 1 (HTTP 404)')).toBe('TELEGRAM_POST_IMAGE_UNAVAILABLE');
    expect(telegramPostPublishErrorCode('Could not download image 2 before publishing')).toBe('TELEGRAM_POST_IMAGE_UNAVAILABLE');
    expect(telegramPostPublishErrorCode('Telegram connection failed')).toBe('TELEGRAM_POST_PUBLISH_FAILED');
  });
});
