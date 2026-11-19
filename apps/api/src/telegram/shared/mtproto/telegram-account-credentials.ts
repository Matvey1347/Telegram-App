import type { TokenEncryptionService } from '../../../common/security/token-encryption.service';

export type EncryptedTelegramAccountCredentials = {
  apiId: string;
  apiHashEncrypted: string;
  apiHashIv: string;
  apiHashAuthTag: string;
  sessionEncrypted: string | null;
  sessionIv: string | null;
  sessionAuthTag: string | null;
};

/** One decryption boundary for existing encrypted MTProto accounts. Never log its result. */
export function telegramAccountCredentials(
  encryption: Pick<TokenEncryptionService, 'decrypt'>,
  account: EncryptedTelegramAccountCredentials,
) {
  return {
    apiId: account.apiId,
    apiHash: encryption.decrypt({
      encrypted: account.apiHashEncrypted,
      iv: account.apiHashIv,
      authTag: account.apiHashAuthTag,
    }),
    session: encryption.decrypt({
      encrypted: account.sessionEncrypted || '',
      iv: account.sessionIv || '',
      authTag: account.sessionAuthTag || '',
    }),
  };
}
