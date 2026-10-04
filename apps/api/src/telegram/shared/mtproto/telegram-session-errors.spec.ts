import { isRevokedTelegramSessionError } from './telegram-session-errors';

describe('Telegram session errors', () => {
  it('treats a duplicated authorization key as an invalid session', () => {
    expect(
      isRevokedTelegramSessionError(
        new Error('406: AUTH_KEY_DUPLICATED (caused by InvokeWithLayer)'),
      ),
    ).toBe(true);
  });
});
