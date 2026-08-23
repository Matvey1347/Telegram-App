import { TelegramSourceType } from '@prisma/client';
import { selectManagedPostPublishingSource } from './managed-post-publishing-source';
import { isRevokedTelegramSessionError } from '../../../telegram/shared/telegram-session-errors';

const source = (sourceId: string, sourceType: TelegramSourceType) => ({
  sourceId,
  sourceType,
  permissions: { canPostMessages: true },
});

describe('selectManagedPostPublishingSource', () => {
  const sources = [
    source('account', TelegramSourceType.MTPROTO),
    source('bot', TelegramSourceType.BOT),
  ];

  it('uses Bot API for native headings and tables even when MTProto is connected', () => {
    expect(
      selectManagedPostPublishingSource(sources, {
        requiresBotApi: true,
      }),
    ).toMatchObject({ sourceId: 'bot', sourceType: TelegramSourceType.BOT });
  });

  it('keeps MTProto as the default source for ordinary posts', () => {
    expect(
      selectManagedPostPublishingSource(sources, {
        requiresBotApi: false,
      }),
    ).toMatchObject({
      sourceId: 'account',
      sourceType: TelegramSourceType.MTPROTO,
    });
  });

  it('prefers the most recently checked MTProto account', () => {
    const stale = {
      ...source('stale', TelegramSourceType.MTPROTO),
      accountLastCheckedAt: '2026-08-21T00:40:31.000Z',
    };
    const current = {
      ...source('current', TelegramSourceType.MTPROTO),
      accountLastCheckedAt: '2026-08-23T00:07:48.000Z',
    };

    expect(
      selectManagedPostPublishingSource([stale, current], {
        requiresBotApi: false,
      }),
    ).toMatchObject({ sourceId: 'current' });
  });

  it('does not silently fall back to MTProto when rich publishing needs a bot', () => {
    expect(
      selectManagedPostPublishingSource([sources[0]], {
        requiresBotApi: true,
      }),
    ).toBeUndefined();
  });
});

describe('isRevokedTelegramSessionError', () => {
  it('matches explicit revoked Telegram authorization codes', () => {
    expect(isRevokedTelegramSessionError('AUTH_KEY_UNREGISTERED')).toBe(true);
    expect(isRevokedTelegramSessionError('SESSION_REVOKED')).toBe(true);
  });

  it('does not mislabel unrelated errors that mention a session', () => {
    expect(
      isRevokedTelegramSessionError(
        'Could not resolve channel from the current session cache',
      ),
    ).toBe(false);
  });
});
