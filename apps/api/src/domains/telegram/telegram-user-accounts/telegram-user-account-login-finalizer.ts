import { ConflictException, Injectable } from '@nestjs/common';
import { Prisma, TelegramUserAccountStatus } from '@prisma/client';
import type { TelegramAccountProfile } from '../../../telegram/shared/telegram-mtproto.client';
import { TokenEncryptionService } from '../../../common/security/token-encryption.service';
import { PrismaService } from '../../../prisma/prisma.service';
import { WorkspaceService } from '../../../common/workspace.service';

type LoginAccountSnapshot = {
  id: string;
  workspaceId: string;
  label: string;
  updatedAt: Date;
};

export function telegramAccountCapabilityUpdate(
  profile: TelegramAccountProfile,
) {
  return {
    isPremium: profile.capabilities.isPremium,
    premiumCheckedAt: new Date(profile.capabilities.checkedAt),
    captionLengthMax: profile.capabilities.captionLengthMax,
    messageLengthMax: profile.capabilities.messageLengthMax,
    premiumCapabilities: {
      maxUploadFileSizeMb: profile.capabilities.maxUploadFileSizeMb,
      supportsCustomEmoji: profile.capabilities.supportsCustomEmoji,
      limitsSource: profile.capabilities.limitsSource,
    } as Prisma.InputJsonValue,
  };
}

@Injectable()
export class TelegramUserAccountLoginFinalizer {
  constructor(
    private readonly prisma: PrismaService,
    private readonly encryptionService: TokenEncryptionService,
  ) {}

  async finalize(
    account: LoginAccountSnapshot,
    authorized: { session: string; profile: TelegramAccountProfile },
  ) {
    const encryptedSession = this.encryptionService.encrypt(authorized.session);
    const changed = await this.prisma.telegramUserAccountIntegration.updateMany(
      {
        where: {
          id: account.id,
          workspaceId: account.workspaceId,
          updatedAt: account.updatedAt,
        },
        data: {
          sessionEncrypted: encryptedSession.encrypted,
          sessionIv: encryptedSession.iv,
          sessionAuthTag: encryptedSession.authTag,
          telegramUserId: authorized.profile.id,
          username: authorized.profile.username,
          firstName: authorized.profile.firstName,
          lastName: authorized.profile.lastName,
          photoUrl: authorized.profile.photoUrl ?? null,
          nameColor: authorized.profile.nameColor ?? null,
          label:
            (authorized.profile.username &&
              `@${String(authorized.profile.username).replace('@', '')}`) ||
            authorized.profile.firstName ||
            account.label,
          status: TelegramUserAccountStatus.connected,
          lastSyncedAt: new Date(),
          lastCheckedAt: new Date(),
          lastErrorMessage: null,
          loginPhoneCodeHash: null,
          loginTempSessionEncrypted: null,
          loginTempSessionIv: null,
          loginTempSessionAuthTag: null,
          loginStartedAt: null,
          ...telegramAccountCapabilityUpdate(authorized.profile),
        },
      },
    );
    if (changed.count !== 1) {
      throw new ConflictException(
        'A newer Telegram login attempt replaced this authorization.',
      );
    }
    return this.prisma.telegramUserAccountIntegration.findFirstOrThrow({
      where: { id: account.id, workspaceId: account.workspaceId },
      include: {
        assignedMember: WorkspaceService.assignedMemberInclude,
        createdByUser: WorkspaceService.createdByUserInclude,
      },
    });
  }
}
