import {
  maskTelegramInviteHash,
  maskTelegramInviteUrl,
  maskTelegramReferenceForLog,
} from './telegram-invite-log';

describe('Telegram invite log redaction', () => {
  it('masks invite hashes without retaining the complete bearer value', () => {
    expect(maskTelegramInviteHash('privateBearerHash123')).toBe('priv***23');
  });

  it.each([
    'https://t.me/+privateBearerHash123',
    'https://t.me/joinchat/privateBearerHash123',
    'tg://join?invite=privateBearerHash123',
  ])(
    'redacts private invite references while preserving safe context',
    (value) => {
      const masked = maskTelegramReferenceForLog(value);
      expect(masked).toContain('[REDACTED_INVITE]');
      expect(masked).not.toContain('privateBearerHash123');
      expect(maskTelegramInviteUrl(value)).not.toContain(
        'privateBearerHash123',
      );
    },
  );

  it('keeps non-secret public channel references useful', () => {
    expect(maskTelegramReferenceForLog('@public_channel')).toBe(
      '@public_channel',
    );
    expect(maskTelegramReferenceForLog('https://t.me/public_channel')).toBe(
      'https://t.me/public_channel',
    );
  });
});
