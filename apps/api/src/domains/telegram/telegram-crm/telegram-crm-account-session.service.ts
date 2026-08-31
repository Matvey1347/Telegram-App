import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, TelegramUserAccountStatus } from '@prisma/client';
import { TokenEncryptionService } from '../../../common/security/token-encryption.service';
import { PrismaService } from '../../../prisma/prisma.service';
import { decryptTelegramMtprotoCredentials } from '../../../telegram/shared/telegram-mtproto-credentials';

export const crmRuntimeAccountSelect = {
  id: true,
  workspaceId: true,
  apiId: true,
  apiHashEncrypted: true,
  apiHashIv: true,
  apiHashAuthTag: true,
  sessionEncrypted: true,
  sessionIv: true,
  sessionAuthTag: true,
  status: true,
  isActive: true,
  crmSyncEnabled: true,
  crmSendEnabled: true,
  telegramUserId: true,
  lastErrorMessage: true,
} satisfies Prisma.TelegramUserAccountIntegrationSelect;

export type CrmRuntimeAccount =
  Prisma.TelegramUserAccountIntegrationGetPayload<{
    select: typeof crmRuntimeAccountSelect;
  }>;

@Injectable()
export class TelegramCrmAccountSessionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly encryption: TokenEncryptionService,
  ) {}

  startupAccounts(take: number) {
    return this.prisma.telegramUserAccountIntegration.findMany({
      where: {
        crmSyncEnabled: true,
        isActive: true,
        status: TelegramUserAccountStatus.connected,
        sessionEncrypted: { not: null },
        sessionIv: { not: null },
        sessionAuthTag: { not: null },
      },
      orderBy: { id: 'asc' },
      take,
      select: crmRuntimeAccountSelect,
    });
  }

  async find(accountId: string, workspaceId?: string) {
    return this.prisma.telegramUserAccountIntegration.findFirst({
      where: { id: accountId, ...(workspaceId ? { workspaceId } : {}) },
      select: crmRuntimeAccountSelect,
    });
  }

  async requireForSync(workspaceId: string, accountId: string) {
    const row = await this.require(workspaceId, accountId);
    if (!row.crmSyncEnabled) {
      throw new BadRequestException('CRM sync is disabled for this account');
    }
    return { row, credentials: this.credentials(row) };
  }

  async requireForSend(workspaceId: string, accountId: string) {
    const row = await this.require(workspaceId, accountId);
    if (!row.crmSendEnabled) {
      throw new BadRequestException('CRM send is disabled for this account');
    }
    return { row, credentials: this.credentials(row) };
  }

  isLiveEligible(row: CrmRuntimeAccount) {
    return Boolean(
      row.crmSyncEnabled &&
      row.isActive &&
      row.status === TelegramUserAccountStatus.connected &&
      row.sessionEncrypted &&
      row.sessionIv &&
      row.sessionAuthTag,
    );
  }

  credentials(row: CrmRuntimeAccount) {
    if (!row.sessionEncrypted || !row.sessionIv || !row.sessionAuthTag) {
      throw new BadRequestException(
        'Telegram account has no connected session',
      );
    }
    return decryptTelegramMtprotoCredentials(this.encryption, {
      ...row,
      sessionEncrypted: row.sessionEncrypted,
      sessionIv: row.sessionIv,
      sessionAuthTag: row.sessionAuthTag,
    });
  }

  private async require(workspaceId: string, accountId: string) {
    const row = await this.find(accountId, workspaceId);
    if (!row) throw new NotFoundException('Telegram user account not found');
    if (
      !row.isActive ||
      row.status !== TelegramUserAccountStatus.connected ||
      !row.sessionEncrypted ||
      !row.sessionIv ||
      !row.sessionAuthTag
    ) {
      throw new BadRequestException(
        'Telegram account must be active, connected, and session-backed',
      );
    }
    return row;
  }
}
