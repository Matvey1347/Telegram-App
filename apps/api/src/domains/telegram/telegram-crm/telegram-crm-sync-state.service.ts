import { Injectable, NotFoundException } from '@nestjs/common';
import type { CrmAccountSyncState } from '@telegram-system/shared';
import { PrismaService } from '../../../prisma/prisma.service';
import { WorkspaceAuthorizationService } from '../../workspace/workspace-authorization/workspace-authorization.service';
import { TelegramCrmAccountAccessService } from './telegram-crm-account-access.service';

@Injectable()
export class TelegramCrmSyncStateService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly authorization: WorkspaceAuthorizationService,
    private readonly accountAccess: TelegramCrmAccountAccessService,
  ) {}

  async get(userId: string, accountId: string): Promise<CrmAccountSyncState> {
    const access = await this.authorization.require(userId, 'adSales.crm.view');
    if (!(await this.accountAccess.find(access.workspaceId, accountId))) {
      throw new NotFoundException('Telegram user account not found');
    }
    const row = await this.prisma.telegramCrmAccountSyncState.findFirst({
      where: { mtprotoAccountId: accountId, workspaceId: access.workspaceId },
      select: {
        mtprotoAccountId: true,
        workspaceId: true,
        initialImportStatus: true,
        initialImportCursor: true,
        incrementalCheckpoint: true,
        recoveryCheckpoint: true,
        status: true,
        lastErrorCode: true,
        lastErrorMessage: true,
        lastMeaningfulSyncAt: true,
        createdAt: true,
        updatedAt: true,
      },
    });
    if (!row) {
      return {
        mtprotoAccountId: accountId,
        workspaceId: access.workspaceId,
        initialImportStatus: 'NOT_STARTED',
        initialImportCursor: null,
        incrementalCheckpoint: null,
        recoveryCheckpoint: null,
        status: 'IDLE',
        lastErrorCode: null,
        lastErrorMessage: null,
        lastMeaningfulSyncAt: null,
        createdAt: null,
        updatedAt: null,
      };
    }
    return {
      ...row,
      lastMeaningfulSyncAt: row.lastMeaningfulSyncAt?.toISOString() ?? null,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }
}
