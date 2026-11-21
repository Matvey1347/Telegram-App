import { hasBothInviteCounters } from '../../telegram/telegram-channels/telegram-invite-counter-observations';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { buildCampaignInviteLinkHistoryPayload } from './invite-link-history';
import { TelegramInviteLinkRegistrationService } from '../../telegram/telegram-channels/telegram-invite-link-registration.service';
import { isCampaignStorageMissing } from './ad-campaign-promo-storage';

export type AdCampaignInviteLinkRefreshProgress = {
  telegramChannelId: string;
  url: string;
  status: 'refreshed' | 'failed';
  message: string;
};

export class AdCampaignInviteLinkRead {
  private inviteLinkSnapshotStorageState: 'unknown' | 'available' | 'missing' =
    'unknown';

  constructor(
    private readonly prisma: PrismaService,
    private readonly inviteLinkRegistration?: TelegramInviteLinkRegistrationService,
  ) {}

  async refreshInviteLinkData(
    workspaceId: string,
    userId: string,
    id: string,
    onProgress?: (
      item: AdCampaignInviteLinkRefreshProgress,
      current: number,
      total: number,
    ) => void,
    signal?: AbortSignal,
  ) {
    const campaign = await this.prisma.adCampaign.findFirst({
      where: { id, workspaceId },
      select: {
        id: true,
        inviteLinks: { select: { telegramChannelId: true, url: true } },
        botInviteLinks: {
          select: {
            inviteLink: { select: { telegramChannelId: true, url: true } },
          },
        },
      },
    });
    if (!campaign) throw new NotFoundException('Campaign not found');
    if (!this.inviteLinkRegistration) {
      throw new NotFoundException('Invite-link refresh is unavailable');
    }

    const links = [
      ...campaign.inviteLinks,
      ...campaign.botInviteLinks.map(({ inviteLink }) => inviteLink),
    ];
    const uniqueLinks = [
      ...new Map(
        links.map((link) => [`${link.telegramChannelId}:${link.url}`, link]),
      ).values(),
    ];
    if (!uniqueLinks.length) {
      throw new BadRequestException('Campaign has no invite links to refresh');
    }

    // This is an explicit user action. Refresh sequentially so a campaign with
    // many links cannot create a burst of concurrent MTProto requests. One
    // inaccessible/revoked link must not hide successful refreshes for every
    // other link behind a generic 500 response.
    const failedLinks: Array<{
      telegramChannelId: string;
      url: string;
      message: string;
    }> = [];
    let refreshedLinks = 0;
    for (const [index, link] of uniqueLinks.entries()) {
      if (signal?.aborted) {
        const abortError = new Error('Invite-link refresh was cancelled');
        abortError.name = 'AbortError';
        throw abortError;
      }
      try {
        await this.inviteLinkRegistration.register(
          userId,
          link.telegramChannelId,
          link.url,
        );
        refreshedLinks += 1;
        onProgress?.(
          {
            ...link,
            status: 'refreshed',
            message: 'Invite link refreshed',
          },
          index + 1,
          uniqueLinks.length,
        );
      } catch (error) {
        const failure = {
          telegramChannelId: link.telegramChannelId,
          url: link.url,
          message: this.inviteLinkRefreshFailureMessage(error),
        };
        failedLinks.push(failure);
        onProgress?.(
          { ...failure, status: 'failed' },
          index + 1,
          uniqueLinks.length,
        );
      }
    }
    return {
      campaignId: campaign.id,
      totalLinks: uniqueLinks.length,
      refreshedLinks,
      failedLinks,
    };
  }

  private inviteLinkRefreshFailureMessage(error: unknown) {
    const message = error instanceof Error ? error.message : '';
    if (message.includes('CHAT_ADMIN_REQUIRED')) {
      return 'The connected Telegram account must be an administrator of this channel.';
    }
    return message || 'Could not refresh this invite link';
  }

  async inviteLinkHistory(workspaceId: string, id: string, limit = 120) {
    const campaign = await this.prisma.adCampaign.findFirst({
      where: { id, workspaceId },
      select: {
        id: true,
        title: true,
        inviteLinks: {
          select: {
            id: true,
            name: true,
            url: true,
            joinedCount: true,
            requestedCount: true,
            isRevoked: true,
            lastSyncedAt: true,
            createdAt: true,
            updatedAt: true,
          },
        },
      },
    });
    if (!campaign) throw new NotFoundException('Campaign not found');

    let rows: Array<{
      inviteLinkId: string;
      syncedAt: Date;
      joinedCount: number | null;
      requestedCount: number | null;
      isRevoked: boolean | null;
    }> = [];
    if (this.inviteLinkSnapshotStorageState !== 'missing') {
      try {
        if (campaign.inviteLinks.length) {
          rows = await this.prisma.telegramInviteLinkSnapshot.findMany({
            // Removed links keep their historical snapshots. The detail view
            // must use the same current-link scope as the campaign card.
            where: {
              workspaceId,
              adCampaignId: id,
              inviteLinkId: { in: campaign.inviteLinks.map((link) => link.id) },
            },
            orderBy: [{ syncedAt: 'desc' }, { inviteLinkId: 'asc' }],
            take: Math.max(
              2,
              Math.min(2000, limit * Math.max(1, campaign.inviteLinks.length)),
            ),
            select: {
              inviteLinkId: true,
              syncedAt: true,
              joinedCount: true,
              requestedCount: true,
              isRevoked: true,
            },
          });
        }
        this.inviteLinkSnapshotStorageState = 'available';
      } catch (error) {
        if (!isCampaignStorageMissing(error)) throw error;
        this.inviteLinkSnapshotStorageState = 'missing';
      }
    }

    return buildCampaignInviteLinkHistoryPayload(
      {
        id: campaign.id,
        title: campaign.title,
        inviteLinks: campaign.inviteLinks.map((link) => ({
          ...link,
          requestedCount: Number(link.requestedCount ?? 0),
        })),
      },
      rows.filter(hasBothInviteCounters).reverse(),
      limit,
    );
  }
}
