import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { TelegramChannelDataType, TelegramSourceType } from '@prisma/client';
import { WorkspaceService } from '../../../common/workspace.service';
import { PrismaService } from '../../../prisma/prisma.service';
import { TelegramMtprotoClient } from '@api/telegram/shared/mtproto/telegram-mtproto.client';
import { TelegramChannelAccessService } from './telegram-channel-access.service';
import { TelegramInviteAttributionService } from './telegram-invite-attribution.service';
import { TelegramInviteSyncService } from './telegram-invite-sync.service';
import { TelegramSourceAccessService } from '@api/telegram/shared/imports/telegram-source-access.service';
import { TelegramInviteLinkCreatorService } from '@api/telegram/shared/invites/telegram-invite-link-creator.service';

@Injectable()
export class TelegramInviteLinkRegistrationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly workspaceService: WorkspaceService,
    private readonly access: TelegramChannelAccessService,
    private readonly mtproto: TelegramMtprotoClient,
    private readonly inviteCreator: TelegramInviteLinkCreatorService,
    private readonly attribution: TelegramInviteAttributionService,
    private readonly inviteSync: TelegramInviteSyncService,
    private readonly sourceAccess: TelegramSourceAccessService,
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
      currentRequestedCount: remote.requested,
      joinedWithinPeriod: remote.joinedWithinPeriod ?? null,
    };
  }

  async create(
    userId: string,
    channelId: string,
    input: {
      title: string;
      mtprotoAccountId?: string;
      requestNeeded?: boolean;
      expiresAt?: string;
      usageLimit?: number;
      monthlyFeeStars?: number;
    },
  ) {
    const title = input.title.trim();
    if (!title) throw new BadRequestException('Enter an invite link name.');
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

    const sources = await this.accessSources(workspaceId, channelId);
    const requestedAccountId = input.mtprotoAccountId?.trim();
    const source = requestedAccountId
      ? sources.find((item) => item.sourceId === requestedAccountId)
      : sources[0];
    if (!source) {
      throw new BadRequestException(
        'Select a connected MTProto account that manages invite links for this channel.',
      );
    }
    const expiresAt = input.expiresAt ? new Date(input.expiresAt) : undefined;
    if (expiresAt && expiresAt.getTime() <= Date.now()) {
      throw new BadRequestException('The invite link expiry must be in the future.');
    }
    const account = await this.access.connectedAccount(
      workspaceId,
      channelId,
      source.sourceId,
    );
    const remote = await this.inviteCreator.create({
      ...this.access.accountCredentials(account),
      channel,
      title,
      requestNeeded: input.requestNeeded !== false,
      expiresAt,
      usageLimit: input.usageLimit,
      monthlyFeeStars: input.monthlyFeeStars,
    });
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
    return persisted.upserted;
  }

  private async accessSources(workspaceId: string, channelId: string) {
    const sources = await this.sourceAccess.sourcesForChannel(
      workspaceId,
      channelId,
    );
    return sources.filter(
      (source) =>
        source.sourceType === TelegramSourceType.MTPROTO &&
        source.permissions.canManageInviteLinks,
    );
  }
}
