import { TelegramSourceType } from '@prisma/client';
import {
  managedPostRequiresBotApi,
  selectManagedPostPublishingSource,
} from './managed-post-publishing-source';
import { isRevokedTelegramSessionError } from '@api/telegram/shared/mtproto/telegram-session-errors';

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

  it('selects the production bot for advertising when local and production bots are available', () => {
    expect(
      selectManagedPostPublishingSource(
        [
          source('system-bot', TelegramSourceType.BOT),
          source('system-bot-production', TelegramSourceType.BOT),
        ],
        {
          requiresBotApi: true,
          preferredBotSourceId: 'system-bot-production',
        },
      ),
    ).toMatchObject({ sourceId: 'system-bot-production' });
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

  it('excludes publication-disabled MTProto accounts without disabling Bot API', () => {
    const disabledMtproto = {
      ...sources[0],
      mtprotoPublishingEnabled: false,
    };

    expect(
      selectManagedPostPublishingSource([disabledMtproto, sources[1]], {
        requiresBotApi: false,
      }),
    ).toBe(sources[1]);
    expect(
      selectManagedPostPublishingSource([disabledMtproto, sources[1]], {
        requiresBotApi: true,
      }),
    ).toBe(sources[1]);
  });
});

describe('managedPostRequiresBotApi', () => {
  it('allows an advertising media post without bot-only features to use MTProto', () => {
    expect(
      managedPostRequiresBotApi({
        hasInlineButtons: false,
        requiresRichMessage: false,
      }),
    ).toBe(false);
  });

  it('requires Bot API for inline buttons', () => {
    expect(
      managedPostRequiresBotApi({
        hasInlineButtons: true,
        requiresRichMessage: false,
      }),
    ).toBe(true);
  });

  it('requires Bot API for rich Telegram messages', () => {
    expect(
      managedPostRequiresBotApi({
        hasInlineButtons: false,
        requiresRichMessage: true,
      }),
    ).toBe(true);
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
