const REVOKED_TELEGRAM_SESSION_PATTERN =
  /(?:AUTH_KEY_UNREGISTERED|AUTH_KEY_INVALID|SESSION_REVOKED|SESSION_EXPIRED|USER_DEACTIVATED)/i;
const SEND_CODE_UNAVAILABLE_PATTERN = /SEND_CODE_UNAVAILABLE/i;
const FLOOD_WAIT_PATTERN = /(?:FLOOD_WAIT_|wait of\s+)(\d+)/i;

export const REVOKED_TELEGRAM_SESSION_MESSAGE =
  'The connected Telegram account session is no longer valid. Reconnect the account and retry.';

export function withTelegramTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  label: string,
) {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error(`${label} timed out after ${timeoutMs}ms`)),
      timeoutMs,
    );
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(
          error instanceof Error ? error : new Error('Telegram request failed'),
        );
      },
    );
  });
}

export function isRevokedTelegramSessionError(error: unknown) {
  if (error instanceof Error) {
    return REVOKED_TELEGRAM_SESSION_PATTERN.test(error.message);
  }
  if (typeof error === 'string') {
    return REVOKED_TELEGRAM_SESSION_PATTERN.test(error);
  }
  if (!error || typeof error !== 'object') return false;
  const record = error as Record<string, unknown>;
  return ['errorMessage', 'code', 'message'].some(
    (field) =>
      typeof record[field] === 'string' &&
      REVOKED_TELEGRAM_SESSION_PATTERN.test(record[field]),
  );
}

export function isTelegramSendCodeUnavailableError(error: unknown) {
  if (error instanceof Error) {
    return SEND_CODE_UNAVAILABLE_PATTERN.test(error.message);
  }
  if (typeof error === 'string') {
    return SEND_CODE_UNAVAILABLE_PATTERN.test(error);
  }
  if (!error || typeof error !== 'object') return false;
  const record = error as Record<string, unknown>;
  return ['errorMessage', 'code', 'message'].some(
    (field) =>
      typeof record[field] === 'string' &&
      SEND_CODE_UNAVAILABLE_PATTERN.test(record[field]),
  );
}

export function getTelegramFloodWaitSeconds(error: unknown) {
  if (!error) return null;

  if (typeof error === 'object') {
    const seconds = Number((error as Record<string, unknown>).seconds);
    if (Number.isFinite(seconds) && seconds > 0) return Math.ceil(seconds);
  }

  const messages =
    typeof error === 'string'
      ? [error]
      : error instanceof Error
        ? [error.message]
        : error && typeof error === 'object'
          ? ['errorMessage', 'code', 'message']
              .map((field) => (error as Record<string, unknown>)[field])
              .filter((value): value is string => typeof value === 'string')
          : [];
  for (const message of messages) {
    const match = message.match(FLOOD_WAIT_PATTERN);
    if (!match?.[1]) continue;
    const seconds = Number(match[1]);
    if (Number.isFinite(seconds) && seconds > 0) return Math.ceil(seconds);
  }

  return null;
}
