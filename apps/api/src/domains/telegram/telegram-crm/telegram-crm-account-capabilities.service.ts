import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { TelegramUserAccountStatus } from '@prisma/client';
import { acquirePostgresTransactionLock } from '../../../prisma/postgres-advisory-lock';
import type { CrmAccountCapabilities } from '@telegram-system/shared';
import { PrismaService } from '../../../prisma/prisma.service';
import { WorkspaceAuthorizationService } from '../../workspace/workspace-authorization/workspace-authorization.service';
import {
  crmAccountSelect,
  type CrmAccountRow,
  TelegramCrmAccountAccessService,
} from './telegram-crm-account-access.service';
import { UpdateCrmAccountCapabilitiesDto } from './telegram-crm.dto';
import { TelegramAccountRuntimeNotifier } from '../../../common/telegram-account-runtime-notifier.service';
import { notifyScheduledTaskDueWorkChanged } from '../../../common/scheduled-task-wake-notifier';

@Injectable()
export class TelegramCrmAccountCapabilitiesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly authorization: WorkspaceAuthorizationService,
    private readonly accountAccess: TelegramCrmAccountAccessService,
    private readonly runtimeNotifier: TelegramAccountRuntimeNotifier = new TelegramAccountRuntimeNotifier(),
  ) {}

  async get(userId: string, accountId: string) {
    const access = await this.authorization.require(userId, 'adSales.crm.view');
    return this.map(await this.requireAccount(access.workspaceId, accountId));
  }

  async update(
    userId: string,
    accountId: string,
    dto: UpdateCrmAccountCapabilitiesDto,
  ) {
    const access = await this.authorization.require(
      userId,
      'adSales.crm.editAny',
    );
    const account = await this.requireAccount(access.workspaceId, accountId);
    const data = {
      ...(dto.crmSyncEnabled === undefined ||
      dto.crmSyncEnabled === account.crmSyncEnabled
        ? {}
        : { crmSyncEnabled: dto.crmSyncEnabled }),
      ...(dto.crmSendEnabled === undefined ||
      dto.crmSendEnabled === account.crmSendEnabled
        ? {}
        : { crmSendEnabled: dto.crmSendEnabled }),
      ...(dto.mtprotoPublishingEnabled === undefined ||
      dto.mtprotoPublishingEnabled === account.mtprotoPublishingEnabled
        ? {}
        : { mtprotoPublishingEnabled: dto.mtprotoPublishingEnabled }),
    };
    if (
      dto.crmSyncEnabled === undefined &&
      dto.crmSendEnabled === undefined &&
      dto.mtprotoPublishingEnabled === undefined &&
      dto.isPreferredInviteLinkAccount === undefined
    ) {
      throw new BadRequestException('No account capability changes');
    }
    const preferred = dto.isPreferredInviteLinkAccount;
    if (!Object.keys(data).length && preferred === undefined) return this.map(account);
    if (data.crmSendEnabled === false) {
      const defaultSettings =
        await this.prisma.telegramAdCrmWorkspaceSettings.findFirst({
          where: {
            workspaceId: access.workspaceId,
            defaultCrmSenderAccountId: accountId,
          },
          select: { workspaceId: true },
        });
      if (defaultSettings) {
        throw new BadRequestException(
          'Choose another default CRM sender before disabling send capability',
        );
      }
    }
    const where = { id: accountId, workspaceId: access.workspaceId };
    const updated = preferred === undefined
      ? await this.prisma.telegramUserAccountIntegration.update({ where, data, select: crmAccountSelect })
      : await this.prisma.$transaction(async (tx) => {
        await acquirePostgresTransactionLock(tx, `mtproto-invite-account:${access.workspaceId}`);
        const current = await tx.telegramUserAccountIntegration.findUnique({ where, select: crmAccountSelect });
        if (!current) throw new NotFoundException('Telegram user account not found');
        if (preferred && (!current.isActive || current.status !== TelegramUserAccountStatus.connected ||
          !current.sessionEncrypted || !current.sessionIv || !current.sessionAuthTag))
          throw new BadRequestException('Connect and activate this account before selecting it for invite links.');
        if (preferred === current.isPreferredInviteLinkAccount && !Object.keys(data).length)
          return current;
        if (preferred) await tx.telegramUserAccountIntegration.updateMany({
          where: { workspaceId: access.workspaceId, isPreferredInviteLinkAccount: true, id: { not: accountId } },
          data: { isPreferredInviteLinkAccount: false },
        });
        return tx.telegramUserAccountIntegration.update({
          where,
          data: { ...data, isPreferredInviteLinkAccount: preferred },
          select: crmAccountSelect,
        });
      });
    if (Object.keys(data).length) this.runtimeNotifier.wake({
      workspaceId: access.workspaceId,
      accountId,
      reason: 'capability',
    });
    if ('crmSyncEnabled' in data) {
      notifyScheduledTaskDueWorkChanged(
        `workspace-auto-sync:${access.workspaceId}`,
      );
    }
    return this.map(updated);
  }

  private async requireAccount(workspaceId: string, accountId: string) {
    const account = await this.accountAccess.find(workspaceId, accountId);
    if (!account)
      throw new NotFoundException('Telegram user account not found');
    return account;
  }

  private map(account: CrmAccountRow): CrmAccountCapabilities {
    return {
      accountId: account.id,
      crmSyncEnabled: account.crmSyncEnabled,
      crmSendEnabled: account.crmSendEnabled,
      mtprotoPublishingEnabled: account.mtprotoPublishingEnabled,
      isPreferredInviteLinkAccount: account.isPreferredInviteLinkAccount,
    };
  }
}
