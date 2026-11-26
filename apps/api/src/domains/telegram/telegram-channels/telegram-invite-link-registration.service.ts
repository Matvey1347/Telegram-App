import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { TelegramChannelDataType, TelegramSourceType, TelegramUserAccountStatus } from '@prisma/client';
import type { TelegramInviteLinkAccount } from '@telegram-system/shared';
import { runBounded } from '../../../common/run-bounded';
import { normalizeTelegramChannelId } from '@api/telegram/shared/imports/telegram-post-url';
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

    const stored = await this.prisma.telegramInviteLink.findUnique({
      where: { workspaceId_telegramChannelId_url: { workspaceId, telegramChannelId: channelId, url: inviteLink } },
      select: {
        url: true, name: true, creatorTelegramUserId: true, creatorFirstName: true,
        creatorLastName: true, creatorPhotoUrl: true, creatorUsername: true,
        telegramCreatedAt: true, expireDate: true, memberLimit: true,
        createsJoinRequest: true, isRevoked: true,
      },
    });
    const knownInvite = stored?.creatorTelegramUserId ? {
      url: stored.url, title: stored.name, telegramCreatorUserId: stored.creatorTelegramUserId,
      creatorFirstName: stored.creatorFirstName, creatorLastName: stored.creatorLastName,
      creatorPhotoUrl: stored.creatorPhotoUrl, creatorUsername: stored.creatorUsername,
      createdAt: stored.telegramCreatedAt, startDate: null, expireDate: stored.expireDate,
      usageLimit: stored.memberLimit, requestNeeded: stored.createsJoinRequest !== false,
      permanent: false, revoked: stored.isRevoked,
    } : undefined;
    const sources = await this.accessSources(workspaceId, channelId);
    const candidates = [...sources].sort((left, right) =>
      this.sourceAccess.scoreSource(right, TelegramChannelDataType.INVITE_LINKS) -
      this.sourceAccess.scoreSource(left, TelegramChannelDataType.INVITE_LINKS),
    ).slice(0, 3).map((candidate) => candidate.sourceId);
    let remote: Awaited<ReturnType<TelegramMtprotoClient['getChannelInviteLink']>> | undefined;
    const tryAccount = async (accountId: string) => {
      try {
        const account = await this.access.connectedAccount(workspaceId, channelId, accountId);
        const result = await this.mtproto.getChannelInviteLink({
          ...this.access.accountCredentials(account), channel, inviteLink,
          joinedFrom: period?.from, joinedUntil: period?.until,
          includePendingSince: period?.includePending,
          ...(knownInvite ? { knownInvite } : {}),
          ...(!period || !period.includePending ? { preferLivePending: true } : {}),
        });
        remote = {
          ...result,
          ...(result.usageObserved === false && remote && remote.usageObserved !== false
            ? { usage: remote.usage, usageObserved: true } : {}),
          ...(result.requestedObserved === false && remote && remote.requestedObserved !== false
            ? { requested: remote.requested, requestedObserved: true } : {}),
          ...(period ? {
            joinedWithinPeriod: result.joinedWithinPeriod ?? remote?.joinedWithinPeriod ?? null,
            pendingWithinPeriod: result.pendingWithinPeriod ?? remote?.pendingWithinPeriod ?? null,
          } : {}),
        };
        return Boolean(result.revoked || (result.expireDate && result.expireDate <= new Date()) ||
          (period ? remote.joinedWithinPeriod != null &&
            (!period.includePending || remote.pendingWithinPeriod != null)
            : remote.usageObserved !== false && remote.requestedObserved !== false));
      } catch {
        return false;
      }
    };
    let complete = false;
    for (const candidate of candidates) {
      if (await tryAccount(candidate)) { complete = true; break; }
    }
    if (knownInvite && !complete) {
      const verified = await this.accounts(userId, channelId);
      const alternates = verified.filter((account) => !candidates.includes(account.sourceId)).slice(0, 3);
      for (const alternate of alternates) {
        if (await tryAccount(alternate.sourceId)) break;
      }
    }
    const observation = remote as Awaited<ReturnType<TelegramMtprotoClient['getChannelInviteLink']>> | undefined;
    if (!observation) {
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
      observation.revoked ||
      (observation.expireDate && observation.expireDate.getTime() <= Date.now())
    ) {
      throw new BadRequestException(
        'This Telegram invite link is revoked or expired.',
      );
    }

    const maps = await this.attribution.buildInviteAttributionMaps(workspaceId);
    const persisted = await this.inviteSync.persistInviteLinkFromRemote({
      workspaceId,
      channelId,
      link: observation,
      maps,
      processedCount: 1,
      totalLinks: 1,
      warnings: [],
      progressStep: { current: 1, total: 1 },
    });
    if (!period) await this.inviteSync.recordSingleInviteObservation(workspaceId, channelId, persisted);
    return {
      id: persisted.upserted.id,
      // The selector that initiated registration needs the Telegram title
      // immediately, before its invite-links query is refetched.
      name: observation.title || 'Imported MTProto link',
      url: observation.url,
      workspaceId,
      currentJoinedCount: observation.usageObserved === false ? null : persisted.upserted.joinedCount,
      currentRequestedCount: observation.requestedObserved === false ? null : persisted.upserted.requestedCount,
      joinedWithinPeriod: observation.joinedWithinPeriod ?? null,
      ...(period?.includePending ? { pendingWithinPeriod: observation.pendingWithinPeriod ?? null } : {}),
    };
  }

  async accounts(userId: string, channelId: string): Promise<TelegramInviteLinkAccount[]> {
    const workspaceId = await this.workspaceService.resolveWorkspaceIdForUser(userId);
    const channel = await this.prisma.telegramChannel.findFirst({
      where: { id: channelId, workspaceId, isActive: true },
      select: { username: true, telegramChatId: true, inviteLink: true },
    });
    if (!channel) throw new NotFoundException('Telegram channel not found');
    const accounts = await this.prisma.telegramUserAccountIntegration.findMany({
      where: {
        workspaceId, isActive: true, status: TelegramUserAccountStatus.connected,
        sessionEncrypted: { not: null },
      },
      select: {
        id: true, username: true, label: true, firstName: true, photoUrl: true,
        isPreferredInviteLinkAccount: true,
        apiId: true, apiHashEncrypted: true, apiHashIv: true, apiHashAuthTag: true,
        sessionEncrypted: true, sessionIv: true, sessionAuthTag: true,
      },
    });
    const expectedId = normalizeTelegramChannelId(channel.telegramChatId);
    const verified = await runBounded(accounts, 3, async (account): Promise<TelegramInviteLinkAccount | null> => {
      try {
        const observed = await this.mtproto.getPublicChannelInfo({
          ...this.access.accountCredentials(account), channel, accessOnly: true,
        });
        if (observed.kind !== 'channel' ||
            (expectedId && normalizeTelegramChannelId(observed.telegramChatId) !== expectedId)) return null;
        const role = observed.isCreator ? 'OWNER' : observed.adminRights?.inviteUsers ? 'ADMIN' : null;
        if (!role) return null;
        return {
          sourceId: account.id,
          displayName: this.access.sourceDisplayName(account),
          avatarUrl: account.photoUrl,
          role,
          isPreferredInviteLinkAccount: account.isPreferredInviteLinkAccount,
        };
      } catch {
        return null;
      }
    });
    return verified
      .filter((account): account is TelegramInviteLinkAccount => account != null)
      .sort((left, right) =>
        Number(right.isPreferredInviteLinkAccount) - Number(left.isPreferredInviteLinkAccount) ||
        Number(right.role === 'OWNER') - Number(left.role === 'OWNER') ||
        left.displayName.localeCompare(right.displayName),
      );
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
      ? [requestedAccountId]
      : sources.slice(0, 3).map((source) => source.sourceId);
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
    for (const sourceId of candidates) {
      const account = await this.access.connectedAccount(workspaceId, channelId, sourceId).catch((error: unknown) => {
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
