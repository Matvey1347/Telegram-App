import { telegramAccountCredentials } from './telegram-account-credentials';

describe('encrypted Telegram account credentials', () => {
  it('uses the same authenticated decryption contract for API hash and session', () => {
    const decrypt = jest.fn(
      ({ encrypted }: { encrypted: string }) => `decoded:${encrypted}`,
    );
    expect(
      telegramAccountCredentials(
        { decrypt },
        {
          apiId: '42',
          apiHashEncrypted: 'hash-ciphertext',
          apiHashIv: 'hash-iv',
          apiHashAuthTag: 'hash-tag',
          sessionEncrypted: 'session-ciphertext',
          sessionIv: 'session-iv',
          sessionAuthTag: 'session-tag',
        },
      ),
    ).toEqual({
      apiId: '42',
      apiHash: 'decoded:hash-ciphertext',
      session: 'decoded:session-ciphertext',
    });
    expect(decrypt.mock.calls).toEqual([
      [{ encrypted: 'hash-ciphertext', iv: 'hash-iv', authTag: 'hash-tag' }],
      [
        {
          encrypted: 'session-ciphertext',
          iv: 'session-iv',
          authTag: 'session-tag',
        },
      ],
    ]);
  });

  it('propagates authenticated decryption failures without returning partial credentials', () => {
    const decrypt = jest.fn(() => {
      throw new Error('Invalid authentication tag');
    });
    expect(() =>
      telegramAccountCredentials(
        { decrypt },
        {
          apiId: '42',
          apiHashEncrypted: 'ciphertext',
          apiHashIv: 'iv',
          apiHashAuthTag: 'bad-tag',
          sessionEncrypted: null,
          sessionIv: null,
          sessionAuthTag: null,
        },
      ),
    ).toThrow('Invalid authentication tag');
  });
});
