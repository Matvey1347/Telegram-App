import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { TelegramUserAccountStatus } from '@prisma/client';
import type {
  TelegramQrLoginAccount,
  TelegramQrLoginProgress,
  TelegramQrLoginResult,
} from '@telegram-system/shared';
import { WorkspaceService } from '../../../common/workspace.service';
import { TokenEncryptionService } from '../../../common/security/token-encryption.service';
import { PrismaService } from '../../../prisma/prisma.service';
import { TelegramMtprotoClient } from '../../../telegram/shared/telegram-mtproto.client';
import { TelegramUserAccountLoginFinalizer } from './telegram-user-account-login-finalizer';

function throwIfAborted(signal: AbortSignal) {
  if (!signal.aborted) return;
  const error = new Error('Telegram QR login was cancelled');
  error.name = 'AbortError';
  throw error;
}

@Injectable()
export class TelegramUserAccountQrLoginService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly workspaceService: WorkspaceService,
    private readonly encryptionService: TokenEncryptionService,
    private readonly mtprotoClient: TelegramMtprotoClient,
    private readonly finalizer: TelegramUserAccountLoginFinalizer,
  ) {}

  private accountView(row: Record<string, unknown>): TelegramQrLoginAccount {
    const iso = (value: unknown) =>
      value instanceof Date ? value.toISOString() : null;
    return {
      id: String(row.id),
      label: String(row.label),
      apiId: String(row.apiId),
      phoneMasked: (row.phoneMasked as string | null) ?? null,
      telegramUserId: (row.telegramUserId as string | null) ?? null,
      username: (row.username as string | null) ?? null,
      firstName: (row.firstName as string | null) ?? null,
      lastName: (row.lastName as string | null) ?? null,
      photoUrl: (row.photoUrl as string | null) ?? null,
      nameColor: (row.nameColor as number | null) ?? null,
      isPremium: Boolean(row.isPremium),
      premiumCheckedAt: iso(row.premiumCheckedAt),
      captionLengthMax: Number(row.captionLengthMax),
      messageLengthMax: Number(row.messageLengthMax),
      premiumCapabilities:
        (row.premiumCapabilities as TelegramQrLoginAccount['premiumCapabilities']) ??
        null,
      status: 'connected',
      lastErrorMessage: (row.lastErrorMessage as string | null) ?? null,
      lastCheckedAt: iso(row.lastCheckedAt),
      lastSyncedAt: iso(row.lastSyncedAt),
      isActive: Boolean(row.isActive),
    };
  }

  async login(
    userId: string,
    id: string,
    onProgress: (progress: TelegramQrLoginProgress) => void | Promise<void>,
    signal: AbortSignal,
    syncAfterConnect: () => Promise<unknown>,
  ): Promise<TelegramQrLoginResult> {
    const workspaceId =
      await this.workspaceService.resolveWorkspaceIdForUser(userId);
    const account = await this.prisma.telegramUserAccountIntegration.findFirst({
      where: { id, workspaceId },
    });
    if (!account) {
      throw new NotFoundException('Telegram user account not found');
    }
    const apiHash = this.encryptionService.decrypt({
      encrypted: account.apiHashEncrypted,
      iv: account.apiHashIv,
      authTag: account.apiHashAuthTag,
    });
    const result = await this.mtprotoClient.loginWithQr(
      account.apiId,
      apiHash,
      signal,
      onProgress,
    );
    throwIfAborted(signal);

    if (result.status === 'needs_password') {
      if (!result.tempSession) {
        throw new BadRequestException(
          'Telegram QR login did not return a resumable session.',
        );
      }
      const encrypted = this.encryptionService.encrypt(result.tempSession);
      throwIfAborted(signal);
      const changed =
        await this.prisma.telegramUserAccountIntegration.updateMany({
          where: { id: account.id, workspaceId, updatedAt: account.updatedAt },
          data: {
            status: TelegramUserAccountStatus.needs_password,
            lastErrorMessage: null,
            lastCheckedAt: new Date(),
            loginPhoneCodeHash: null,
            loginStartedAt: new Date(),
            loginTempSessionEncrypted: encrypted.encrypted,
            loginTempSessionIv: encrypted.iv,
            loginTempSessionAuthTag: encrypted.authTag,
          },
        });
      if (changed.count !== 1) {
        throw new ConflictException(
          'A newer Telegram login attempt replaced this QR authorization.',
        );
      }
      return { success: true, status: 'needs_password' };
    }

    throwIfAborted(signal);
    const row = await this.finalizer.finalize(account, {
      session: result.session,
      profile: result.profile,
    });
    const connectedAccount = this.accountView(
      row as unknown as Record<string, unknown>,
    );
    await onProgress({ type: 'connected', account: connectedAccount });
    await syncAfterConnect();
    return {
      success: true,
      status: 'connected',
      account: connectedAccount,
    };
  }
}
