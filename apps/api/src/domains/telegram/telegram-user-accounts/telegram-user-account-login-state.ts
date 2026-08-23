import type { TokenEncryptionService } from '../../../common/security/token-encryption.service';
import { ConflictException } from '@nestjs/common';
import type { Prisma, TelegramUserAccountIntegration } from '@prisma/client';
import type { PrismaService } from '../../../prisma/prisma.service';

export async function updateTelegramLoginStateIfCurrent(
  prisma: PrismaService,
  account: Pick<
    TelegramUserAccountIntegration,
    'id' | 'workspaceId' | 'updatedAt'
  >,
  data: Prisma.TelegramUserAccountIntegrationUpdateManyMutationInput,
) {
  const changed = await prisma.telegramUserAccountIntegration.updateMany({
    where: {
      id: account.id,
      workspaceId: account.workspaceId,
      updatedAt: account.updatedAt,
    },
    data,
  });
  if (changed.count !== 1) {
    throw new ConflictException(
      'A newer Telegram login attempt replaced this authorization.',
    );
  }
}

export function maskTelegramLoginPhone(phone: string) {
  const digits = phone.replace(/\D/g, '');
  if (digits.length < 4) return '***';
  return `+${digits.slice(0, 2)}***${digits.slice(-2)}`;
}

export function safeTelegramUserAccount<T extends Record<string, unknown>>(
  row: T,
) {
  return {
    ...row,
    phoneEncrypted: undefined,
    phoneIv: undefined,
    phoneAuthTag: undefined,
    apiHashEncrypted: undefined,
    apiHashIv: undefined,
    apiHashAuthTag: undefined,
    sessionEncrypted: undefined,
    sessionIv: undefined,
    sessionAuthTag: undefined,
    loginPhoneCodeHash: undefined,
    loginTempSessionEncrypted: undefined,
    loginTempSessionIv: undefined,
    loginTempSessionAuthTag: undefined,
    loginStartedAt: undefined,
  };
}

export function encryptTelegramLoginTempSession(
  encryptionService: TokenEncryptionService,
  tempSession?: string | null,
) {
  if (!tempSession) return null;
  const encrypted = encryptionService.encrypt(tempSession);
  return {
    loginTempSessionEncrypted: encrypted.encrypted,
    loginTempSessionIv: encrypted.iv,
    loginTempSessionAuthTag: encrypted.authTag,
  };
}

export function decryptTelegramLoginTempSession(
  encryptionService: TokenEncryptionService,
  account: {
    loginTempSessionEncrypted?: string | null;
    loginTempSessionIv?: string | null;
    loginTempSessionAuthTag?: string | null;
  },
) {
  if (
    !account.loginTempSessionEncrypted ||
    !account.loginTempSessionIv ||
    !account.loginTempSessionAuthTag
  ) {
    return null;
  }
  return encryptionService.decrypt({
    encrypted: account.loginTempSessionEncrypted,
    iv: account.loginTempSessionIv,
    authTag: account.loginTempSessionAuthTag,
  });
}
