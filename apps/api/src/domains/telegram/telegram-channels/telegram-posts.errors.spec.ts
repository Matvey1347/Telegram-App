import { TELEGRAM_POSTS_ERROR_KEYS } from '@telegram-system/shared';
import {
  managedPostNotFound,
  telegramPostsBadRequest,
} from './telegram-posts.errors';

describe('Telegram Posts structured errors', () => {
  it('uses a stable machine code independently of the fallback message', () => {
    expect(managedPostNotFound().getResponse()).toEqual({
      code: 'TELEGRAM_MANAGED_POST_NOT_FOUND',
      message: 'Managed post not found',
    });
  });

  it('preserves interpolation parameters for localized clients', () => {
    expect(
      telegramPostsBadRequest(
        'TELEGRAM_POST_INVALID_TIMEZONE',
        'Invalid IANA timezone',
        { timezone: 'Moon/Base' },
      ).getResponse(),
    ).toEqual({
      code: 'TELEGRAM_POST_INVALID_TIMEZONE',
      message: 'Invalid IANA timezone',
      params: { timezone: 'Moon/Base' },
    });
  });

  it('catalogs link and media codes used by editor flows', () => {
    expect(TELEGRAM_POSTS_ERROR_KEYS).toMatchObject({
      TELEGRAM_POST_LINK_INVALID: 'telegramPosts.errors.linkInvalid',
      TELEGRAM_POST_LINK_CHANNEL_MISMATCH:
        'telegramPosts.errors.linkChannelMismatch',
      TELEGRAM_POST_MEDIA_TOO_LARGE: 'telegramPosts.errors.mediaTooLarge',
      TELEGRAM_POST_CALENDAR_RANGE_INVALID:
        'telegramPosts.errors.calendarRangeInvalid',
    });
  });
});
