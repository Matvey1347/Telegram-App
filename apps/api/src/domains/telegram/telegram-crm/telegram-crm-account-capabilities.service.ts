import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { CrmAccountCapabilities } from '@telegram-system/shared';
import { PrismaService } from '../../../prisma/prisma.service';
import { WorkspaceAuthorizationService } from '../../workspace/workspace-authorization/workspace-authorization.service';
import {
  crmAccountSelect,
  type CrmAccountRow,
  TelegramCrmAccountAccessService,
} from './telegram-crm-account-access.service';
import { UpdateCrmAccountCapabilitiesDto } from './telegram-crm.dto';

@Injectable()
export class TelegramCrmAccountCapabilitiesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly authorization: WorkspaceAuthorizationService,
    private readonly accountAccess: TelegramCrmAccountAccessService,
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
      dto.mtprotoPublishingEnabled === undefined
    ) {
      throw new BadRequestException('No account capability changes');
    }
    if (!Object.keys(data).length) return this.map(account);
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
    const updated = await this.prisma.telegramUserAccountIntegration.update({
      where: { id: account.id },
      data,
      select: crmAccountSelect,
    });
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
    };
  }
}
