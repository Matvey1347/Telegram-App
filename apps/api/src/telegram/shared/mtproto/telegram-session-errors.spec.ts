import {
  isRevokedTelegramSessionError,
  telegramRevokedSessionErrorCode,
} from '@api/telegram/shared/mtproto/telegram-session-errors';

describe('Telegram session errors', () => {
  it('treats a duplicated authorization key as an invalid session', () => {
    expect(
      isRevokedTelegramSessionError(
        new Error('406: AUTH_KEY_DUPLICATED (caused by InvokeWithLayer)'),
      ),
    ).toBe(true);
  });

  it('retains Telegram\'s original revoked-session code for diagnostics', () => {
    expect(
      telegramRevokedSessionErrorCode({
        errorMessage: '406: AUTH_KEY_DUPLICATED',
      }),
    ).toBe('AUTH_KEY_DUPLICATED');
  });
});
