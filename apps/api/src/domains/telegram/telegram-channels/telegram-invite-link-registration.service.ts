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
import { InviteCreationAccessLost, TelegramInviteLinkCreatorService } from '@api/telegram/shared/invites/telegram-invite-link-creator.service';

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
    period?: { from: Date; until: Date; includePending?: boolean },
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

    const sources = await this.accessSources(workspaceId, channelId);
    const candidates = [...sources].sort((left, right) =>
      this.sourceAccess.scoreSource(right, TelegramChannelDataType.INVITE_LINKS) -
      this.sourceAccess.scoreSource(left, TelegramChannelDataType.INVITE_LINKS),
    ).slice(0, 3);
    let remote: Awaited<ReturnType<TelegramMtprotoClient['getChannelInviteLink']>> | undefined;
    for (const candidate of candidates) {
      try {
        const account = await this.access.connectedAccount(workspaceId, channelId, candidate.sourceId);
        const result = await this.mtproto.getChannelInviteLink({
          ...this.access.accountCredentials(account), channel, inviteLink,
          joinedFrom: period?.from, joinedUntil: period?.until,
          includePendingSince: period?.includePending,
        });
        remote = period ? {
          ...result,
          joinedWithinPeriod: result.joinedWithinPeriod ?? remote?.joinedWithinPeriod ?? null,
          pendingWithinPeriod: result.pendingWithinPeriod ?? remote?.pendingWithinPeriod ?? null,
        } : result;
        if (!period || result.revoked || (result.expireDate && result.expireDate <= new Date()) ||
            (remote.joinedWithinPeriod != null && (!period.includePending || remote.pendingWithinPeriod != null))) break;
      } catch {
        // Only a read is retried. ExportChatInvite is never repeated here.
      }
    }
    if (!remote) {
      await this.prisma.telegramInviteLink.updateMany({
        where: {
          workspaceId, telegramChannelId: channelId, url: inviteLink,
          OR: [{ joinedObserved: true }, { joinedObserved: null }, { requestedObserved: true }, { requestedObserved: null }],
        },
        data: { joinedObserved: false, requestedObserved: false },
      });
      throw new BadRequestException(
        'The connected accounts could not read this invite link. Refresh channel access or create a new link.',
      );
    }
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
      // The selector that initiated registration needs the Telegram title
      // immediately, before its invite-links query is refetched.
      name: remote.title || 'Imported MTProto link',
      url: remote.url,
      workspaceId,
      currentJoinedCount: remote.usageObserved === false ? null : persisted.upserted.joinedCount,
      currentRequestedCount: remote.requestedObserved === false ? null : persisted.upserted.requestedCount,
      joinedWithinPeriod: remote.joinedWithinPeriod ?? null,
      ...(period?.includePending ? { pendingWithinPeriod: remote.pendingWithinPeriod ?? null } : {}),
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

    const sources = (await this.accessSources(workspaceId, channelId)).sort((left, right) =>
      this.sourceAccess.scoreSource(right, TelegramChannelDataType.INVITE_LINKS) -
      this.sourceAccess.scoreSource(left, TelegramChannelDataType.INVITE_LINKS),
    );
    const requestedAccountId = input.mtprotoAccountId?.trim();
    const candidates = requestedAccountId
      ? sources.filter((item) => item.sourceId === requestedAccountId)
      : sources.slice(0, 3);
    if (!candidates.length) {
      throw new BadRequestException(
        'Select a connected MTProto account that manages invite links for this channel.',
      );
    }
    const expiresAt = input.expiresAt ? new Date(input.expiresAt) : undefined;
    if (expiresAt && expiresAt.getTime() <= Date.now()) {
      throw new BadRequestException(
        'The invite link expiry must be in the future.',
      );
    }
    let remote: Awaited<ReturnType<TelegramInviteLinkCreatorService['create']>> | undefined;
    for (const source of candidates) {
      const account = await this.access.connectedAccount(workspaceId, channelId, source.sourceId).catch((error: unknown) => {
        if (requestedAccountId) throw error;
        return null;
      });
      if (!account) continue;
      try {
        remote = await this.inviteCreator.create({
          ...this.access.accountCredentials(account), channel, title,
          requestNeeded: input.requestNeeded !== false,
          expiresAt, usageLimit: input.usageLimit, monthlyFeeStars: input.monthlyFeeStars,
        });
        break;
      } catch (error) {
        // This exception occurs before ExportChatInvite. Ambiguous RPC results stop here.
        if (!(error instanceof InviteCreationAccessLost) || requestedAccountId) throw error;
      }
    }
    if (!remote) throw new InviteCreationAccessLost();
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
    // The compact persistence result only has counters and identifiers. The
    // caller is an invite-link selector, so return the display fields already
    // available from the MTProto create response instead of forcing it to
    // reload the selector collection.
    return {
      ...persisted.upserted,
      name: remote.title || title,
      url: remote.url,
      creatorTelegramUserId: remote.telegramCreatorUserId,
      creatorUsername: remote.creatorUsername,
      creatorFirstName: remote.creatorFirstName,
      creatorLastName: remote.creatorLastName,
      creatorPhotoUrl: remote.creatorPhotoUrl,
    };
  }

  private async accessSources(workspaceId: string, channelId: string) {
    const sources = await this.sourceAccess.sourcesForChannel(
      workspaceId,
      channelId,
    );
    return sources.filter(
      (source) =>
        source.sourceType === TelegramSourceType.MTPROTO,
    );
  }
}
