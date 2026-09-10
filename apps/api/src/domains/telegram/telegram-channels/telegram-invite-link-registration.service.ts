import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { TelegramChannelDataType } from '@prisma/client';
import { WorkspaceService } from '../../../common/workspace.service';
import { PrismaService } from '../../../prisma/prisma.service';
import { TelegramMtprotoClient } from '../../../telegram/shared/telegram-mtproto.client';
import { TelegramChannelAccessService } from './telegram-channel-access.service';
import { TelegramInviteAttributionService } from './telegram-invite-attribution.service';
import { TelegramInviteSyncService } from './telegram-invite-sync.service';

@Injectable()
export class TelegramInviteLinkRegistrationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly workspaceService: WorkspaceService,
    private readonly access: TelegramChannelAccessService,
    private readonly mtproto: TelegramMtprotoClient,
    private readonly attribution: TelegramInviteAttributionService,
    private readonly inviteSync: TelegramInviteSyncService,
  ) {}

  async register(
    userId: string,
    channelId: string,
    inviteLink: string,
    period?: { from: Date; until: Date },
  ) {
    const workspaceId =
      await this.workspaceService.resolveWorkspaceIdForUser(userId);
    const channel = await this.prisma.telegramChannel.findFirst({
      where: { id: channelId, workspaceId, isActive: true },
      select: {
        id: true,
        username: true,
        telegramChatId: true,
        inviteLink: true,
        telegramAccessHash: true,
      },
    });
    if (!channel) throw new NotFoundException('Telegram channel not found');

    const preferredAccountId = await this.access.bestMtprotoAccountId(
      workspaceId,
      channelId,
      TelegramChannelDataType.INVITE_LINKS,
    );
    const account = await this.access.connectedAccount(
      workspaceId,
      channelId,
      preferredAccountId,
    );
    const remote = await this.mtproto.getChannelInviteLink({
      ...this.access.accountCredentials(account),
      channel,
      inviteLink,
      joinedFrom: period?.from,
      joinedUntil: period?.until,
    });
    if (
      remote.revoked ||
      (remote.expireDate && remote.expireDate.getTime() <= Date.now())
    ) {
      throw new BadRequestException(
        'This Telegram invite link is revoked or expired.',
      );
    }

    const maps = await this.attribution.buildInviteAttributionMaps(workspaceId);
    const persisted = await this.inviteSync.persistInviteLinkFromRemote({
      workspaceId,
      channelId,
      link: remote,
      maps,
      processedCount: 1,
      totalLinks: 1,
      warnings: [],
      progressStep: { current: 1, total: 1 },
    });
    return {
      id: persisted.upserted.id,
      workspaceId,
      currentJoinedCount: remote.usage,
      joinedWithinPeriod: remote.joinedWithinPeriod ?? null,
    };
  }
}
