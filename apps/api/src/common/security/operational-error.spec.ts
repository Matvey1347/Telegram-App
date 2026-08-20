import { sanitizeOperationalError } from './operational-error';

describe('sanitizeOperationalError', () => {
  it('redacts provider credentials and removes control characters', () => {
    const value = sanitizeOperationalError(
      new Error(
        'Telegram https://api.telegram.org/bot123456:abcdefghijklmnopqrstuvwxyz/sendMessage token=super-secret\nfailed',
      ),
    );

    expect(value).not.toContain('abcdefghijklmnopqrstuvwxyz');
    expect(value).not.toContain('super-secret');
    expect(value).not.toContain('\n');
    expect(value).toContain('[REDACTED]');
  });

  it('redacts credentials embedded in quoted provider JSON', () => {
    const value = sanitizeOperationalError(
      'provider={"token":"telegram secret", "apiKey":"open-ai-key", "password":"p a s s"}',
    );
    expect(value).not.toContain('telegram secret');
    expect(value).not.toContain('open-ai-key');
    expect(value).not.toContain('p a s s');
  });

  it('uses a bounded fallback for non-errors', () => {
    expect(sanitizeOperationalError({ private: true }, 'Safe failure')).toBe(
      'Safe failure',
    );
    expect(sanitizeOperationalError('x'.repeat(1000))).toHaveLength(500);
  });
});
