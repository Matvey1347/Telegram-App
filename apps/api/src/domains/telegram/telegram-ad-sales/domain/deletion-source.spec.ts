import {
  isTelegramMessageAlreadyAbsent,
  resolveAdPlacementDeletionMessageIds,
  selectAdPlacementDeletionSource,
} from './deletion-source';
import { selectTelegramDeletionSource } from '../../../../telegram/shared/telegram-deletion-policy';

const bot = {
  sourceType: 'BOT',
  sourceId: 'bot',
  permissions: { canDeleteMessages: true },
};
const mtproto = {
  sourceType: 'MTPROTO',
  sourceId: 'account',
  permissions: { canDeleteMessages: true },
};

describe('selectAdPlacementDeletionSource', () => {
  it('uses the publishing bot while Bot API deletion is still allowed', () => {
    const publishedAt = new Date('2026-01-01T00:00:00Z');
    expect(
      selectAdPlacementDeletionSource(
        [bot, mtproto],
        {
          sourceType: 'BOT',
          sourceId: 'bot',
          publishedAt,
        },
        new Date(publishedAt.getTime() + 24 * 60 * 60 * 1000),
      ),
    ).toBe(bot);
  });

  it.each([48, 72])(
    'falls back to an MTProto admin for a %s-hour Bot API placement',
    (hours) => {
      const publishedAt = new Date('2026-01-01T00:00:00Z');
      expect(
        selectAdPlacementDeletionSource(
          [bot, mtproto],
          { sourceType: 'BOT', sourceId: 'bot', publishedAt },
          new Date(publishedAt.getTime() + hours * 60 * 60 * 1000),
        ),
      ).toBe(mtproto);
    },
  );

  it('keeps neutral deletion MTProto-only after the Bot API window expires', () => {
    const publishedAt = new Date('2026-01-01T00:00:00Z');
    expect(
      selectTelegramDeletionSource(
        [bot],
        { sourceType: 'BOT', sourceId: 'bot', publishedAt },
        new Date(publishedAt.getTime() + 48 * 60 * 60 * 1000),
      ),
    ).toBeUndefined();
  });

  it('uses another capable bot when the publishing source lost delete permission', () => {
    const fallback = { ...bot, sourceId: 'fallback-bot' };
    expect(
      selectAdPlacementDeletionSource(
        [
          {
            ...bot,
            permissions: { canDeleteMessages: false },
          },
          fallback,
        ],
        { sourceType: 'BOT', sourceId: 'bot', publishedAt: new Date() },
      ),
    ).toBe(fallback);
  });

  it('does not use a different capable bot after the 48-hour window', () => {
    const publishedAt = new Date('2026-01-01T00:00:00Z');
    expect(
      selectTelegramDeletionSource(
        [{ ...bot, sourceId: 'fallback-bot' }],
        { sourceType: 'BOT', sourceId: 'missing-bot', publishedAt },
        new Date(publishedAt.getTime() + 48 * 60 * 60 * 1000),
      ),
    ).toBeUndefined();
  });
});

describe('isTelegramMessageAlreadyAbsent', () => {
  it.each([
    'Bad Request: message to delete not found',
    "Message doesn't exist",
  ])('recognizes Telegram already-missing responses: %s', (message) => {
    expect(isTelegramMessageAlreadyAbsent(new Error(message))).toBe(true);
  });

  it('recognizes MSG_ID_INVALID only when one message was requested', () => {
    const error = new Error('MSG_ID_INVALID');
    expect(isTelegramMessageAlreadyAbsent(error)).toBe(false);
    expect(isTelegramMessageAlreadyAbsent(error, { singleMessage: true })).toBe(
      true,
    );
  });

  it('does not hide real deletion failures', () => {
    expect(
      isTelegramMessageAlreadyAbsent(new Error('CHAT_ADMIN_REQUIRED')),
    ).toBe(false);
  });
});

describe('resolveAdPlacementDeletionMessageIds', () => {
  it('uses the linked Telegram post for a legacy draft managed-post shell', () => {
    expect(
      resolveAdPlacementDeletionMessageIds({
        managedPost: {
          telegramMessageIds: [],
          telegramIdVerificationStatus: 'UNVERIFIED',
        },
        telegramPost: { telegramMessageId: '8411' },
      }),
    ).toEqual(['8411']);
  });

  it('fails closed when unverified managed message ids conflict with identity', () => {
    expect(
      resolveAdPlacementDeletionMessageIds({
        managedPost: {
          telegramMessageIds: ['wrong-id'],
          telegramIdVerificationStatus: 'MISMATCH',
        },
        telegramPost: { telegramMessageId: '8411' },
      }),
    ).toEqual([]);
  });
});
