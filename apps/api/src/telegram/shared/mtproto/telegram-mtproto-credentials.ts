import type { TokenEncryptionService } from '../../common/security/token-encryption.service';
import type { TelegramCrmMtprotoCredentials } from './telegram-crm-mtproto.types';

export type EncryptedTelegramMtprotoCredentials = {
  apiId: string;
  apiHashEncrypted: string;
  apiHashIv: string;
  apiHashAuthTag: string;
  sessionEncrypted: string;
  sessionIv: string;
  sessionAuthTag: string;
};

export function decryptTelegramMtprotoCredentials(
  encryption: Pick<TokenEncryptionService, 'decrypt'>,
  row: EncryptedTelegramMtprotoCredentials,
): TelegramCrmMtprotoCredentials {
  return {
    apiId: row.apiId,
    apiHash: encryption.decrypt({
      encrypted: row.apiHashEncrypted,
      iv: row.apiHashIv,
      authTag: row.apiHashAuthTag,
    }),
    session: encryption.decrypt({
      encrypted: row.sessionEncrypted,
      iv: row.sessionIv,
      authTag: row.sessionAuthTag,
    }),
  };
}
