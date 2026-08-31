import { BadRequestException, Injectable } from '@nestjs/common';
import { Prisma, TelegramUserAccountStatus } from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';

export const crmAccountSelect = {
  id: true,
  workspaceId: true,
  label: true,
  status: true,
  isActive: true,
  sessionEncrypted: true,
  sessionIv: true,
  sessionAuthTag: true,
  crmSyncEnabled: true,
  crmSendEnabled: true,
  mtprotoPublishingEnabled: true,
} satisfies Prisma.TelegramUserAccountIntegrationSelect;

export type CrmAccountRow = Prisma.TelegramUserAccountIntegrationGetPayload<{
  select: typeof crmAccountSelect;
}>;

@Injectable()
export class TelegramCrmAccountAccessService {
  constructor(private readonly prisma: PrismaService) {}

  async find(workspaceId: string, accountId: string) {
    return this.prisma.telegramUserAccountIntegration.findFirst({
      where: { id: accountId, workspaceId },
      select: crmAccountSelect,
    });
  }

  async requireUsableSender(workspaceId: string, accountId: string) {
    const account = await this.find(workspaceId, accountId);
    if (!account) throw new BadRequestException('CRM sender account not found');
    if (
      account.status !== TelegramUserAccountStatus.connected ||
      !account.isActive ||
      !account.sessionEncrypted ||
      !account.sessionIv ||
      !account.sessionAuthTag ||
      !account.crmSendEnabled
    ) {
      throw new BadRequestException(
        'CRM sender account must be connected, active, session-backed, and send-enabled',
      );
    }
    return account;
  }
}
