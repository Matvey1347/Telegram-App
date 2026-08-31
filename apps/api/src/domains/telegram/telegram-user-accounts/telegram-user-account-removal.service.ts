import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { TelegramSourceType } from '@prisma/client';
import { WorkspaceService } from '../../../common/workspace.service';
import { PrismaService } from '../../../prisma/prisma.service';
import { safeTelegramUserAccount } from './telegram-user-account-login-state';

@Injectable()
export class TelegramUserAccountRemovalService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly workspaceService: WorkspaceService,
  ) {}

  async remove(userId: string, accountId: string) {
    const workspaceId =
      await this.workspaceService.resolveWorkspaceIdForUser(userId);
    const existing = await this.prisma.telegramUserAccountIntegration.findFirst(
      { where: { id: accountId, workspaceId }, select: { id: true } },
    );
    if (!existing)
      throw new NotFoundException('Telegram user account not found');
    const [conversation, defaultSettings] = await Promise.all([
      this.prisma.telegramCrmConversation.findFirst({
        where: { workspaceId, mtprotoAccountId: accountId },
        select: { id: true },
      }),
      this.prisma.telegramAdCrmWorkspaceSettings.findFirst({
        where: { workspaceId, defaultCrmSenderAccountId: accountId },
        select: { workspaceId: true },
      }),
    ]);
    if (conversation || defaultSettings) {
      throw new ConflictException(
        'Telegram account is used by CRM Conversations or as the default CRM sender',
      );
    }
    const row = await this.prisma.$transaction(async (tx) => {
      await tx.telegramChannelAdminLink.deleteMany({
        where: { workspaceId, telegramUserAccountIntegrationId: accountId },
      });
      await tx.telegramChannelSourceAccess.deleteMany({
        where: {
          workspaceId,
          sourceId: accountId,
          sourceType: TelegramSourceType.MTPROTO,
        },
      });
      await tx.telegramChannelDataSource.deleteMany({
        where: {
          workspaceId,
          sourceId: accountId,
          sourceType: TelegramSourceType.MTPROTO,
        },
      });
      return tx.telegramUserAccountIntegration.delete({
        where: { id: accountId },
      });
    });
    return safeTelegramUserAccount(row);
  }
}
