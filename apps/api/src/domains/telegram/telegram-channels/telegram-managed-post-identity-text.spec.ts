import {
  normalizeManagedPostMarkup,
  normalizeTelegramPlainText,
} from './telegram-managed-post-identity-text';
import { TelegramManagedPostIdentityService } from './telegram-managed-post-identity.service';

describe('managed and Telegram visible identity text', () => {
  it.each([
    [
      '**Invoice** №___: [details](https://example.com/invoice)',
      'Invoice №___: details',
    ],
    ['[Open invoice](tg-post:post-reference) №___', 'Open invoice №___'],
  ])(
    'decodes managed markup once and preserves literal remote placeholders',
    (managed, visible) => {
      expect(normalizeManagedPostMarkup(managed)).toBe(
        normalizeTelegramPlainText(visible),
      );
      expect(normalizeTelegramPlainText(visible)).toContain('___');
    },
  );

  it('matches Telegram publication identity with literal underscore placeholders', () => {
    const identity = new TelegramManagedPostIdentityService();
    const scheduledAt = new Date('2026-11-20T09:00:00.000Z');
    const matched = identity.findPublishedIdentity(
      {
        text: '**Invoice** №___: [details](https://example.com/invoice)',
        imageCount: 0,
        publishMode: 'TEXT_ONLY',
        scheduledAt,
      },
      [
        {
          id: '800',
          text: 'Invoice №___: details',
          date: scheduledAt.toISOString(),
          hasMedia: false,
          groupedId: null,
        },
      ],
    );
    expect(matched?.messageIds).toEqual(['800']);
  });

  it('does not reinterpret literal remote formatting markers or links', () => {
    expect(
      normalizeTelegramPlainText('Literal **stars** [label](url) №___'),
    ).toBe('literal **stars** [label](url) №___');
  });
});
