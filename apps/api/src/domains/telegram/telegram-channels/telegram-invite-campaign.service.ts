import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { sumInviteLinkJoinedSubscribers } from '../../../common/analytics/invite-link-metrics';
import { PrismaService } from '../../../prisma/prisma.service';
import { AttachCampaignDto } from './dto';
import { TelegramChannelsSupportService } from './telegram-channels-support.service';
import { TelegramInvitePersistenceService } from './telegram-invite-persistence.service';

@Injectable()
export class TelegramInviteCampaignService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly telegramChannelsSupportService: TelegramChannelsSupportService,
    private readonly telegramInvitePersistenceService: TelegramInvitePersistenceService,
  ) {}

  async attachInviteLinkCampaign(
    userId: string,
    inviteLinkId: string,
    dto: AttachCampaignDto,
  ) {
    const workspaceId =
      await this.telegramChannelsSupportService.workspace(userId);
    const [link, campaign] = await Promise.all([
      this.prisma.telegramInviteLink.findFirst({
        where: { id: inviteLinkId, workspaceId },
        select: {
          id: true,
          telegramChannelId: true,
          adCampaignId: true,
        },
      }),
      this.prisma.adCampaign.findFirst({
        where: { id: dto.adCampaignId, workspaceId },
      }),
    ]);
    if (!link) throw new NotFoundException('Invite link not found');
    if (!campaign) throw new NotFoundException('Campaign not found');
    if (campaign.telegramChannelId !== link.telegramChannelId) {
      throw new BadRequestException(
        'Campaign and invite link must belong to the same channel',
      );
    }
    const updated =
      await this.telegramInvitePersistenceService.updateInviteLinkWithRequestedCountFallback(
        {
          where: { id: link.id },
          data: { adCampaignId: campaign.id, lastSyncedAt: new Date() },
        },
      );
    await this.recalculateCampaignMetricsById(campaign.id);
    return updated;
  }

  async detachInviteLinkCampaign(userId: string, inviteLinkId: string) {
    const workspaceId =
      await this.telegramChannelsSupportService.workspace(userId);
    const link = await this.prisma.telegramInviteLink.findFirst({
      where: { id: inviteLinkId, workspaceId },
      select: {
        id: true,
        adCampaignId: true,
      },
    });
    if (!link) throw new NotFoundException('Invite link not found');
    const updated =
      await this.telegramInvitePersistenceService.updateInviteLinkWithRequestedCountFallback(
        {
          where: { id: link.id },
          data: { adCampaignId: null, lastSyncedAt: new Date() },
        },
      );
    if (link.adCampaignId)
      await this.recalculateCampaignMetricsById(link.adCampaignId);
    return updated;
  }

  async recalculateCampaignMetricsById(campaignId: string) {
    const campaign = await this.prisma.adCampaign.findUnique({
      where: { id: campaignId },
    });
    if (!campaign) return null;
    const links = await this.prisma.telegramInviteLink.findMany({
      where: { adCampaignId: campaignId },
      select: { joinedCount: true, requestedCount: true },
    });
    const joinedCount = sumInviteLinkJoinedSubscribers(links);
    return this.prisma.adCampaign.update({
      where: { id: campaignId },
      data: {
        joinedCount,
        leftCount: null,
        netGrowthCount: null,
        cpa:
          joinedCount > 0
            ? Number(campaign.priceInPrimaryCurrency) / joinedCount
            : null,
      },
    });
  }
}
