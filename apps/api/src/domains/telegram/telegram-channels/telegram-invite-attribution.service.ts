import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import {
  attributeInviteLinkCreator,
  buildInviteLinkAttributionMaps,
} from '../../../telegram/shared/telegram-invite-link-attribution';

@Injectable()
export class TelegramInviteAttributionService {
  constructor(private readonly prisma: PrismaService) {}

  public formatInviteLinkDateLabel(date: Date) {
    return new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Europe/Warsaw',
      day: '2-digit',
      month: '2-digit',
    })
      .format(date)
      .replace('/', '.');
  }

  public extractInviteLinkTitleDateLabels(value: string | null | undefined) {
    const normalized = String(value || '').trim();
    if (!normalized) return [];
    const labels = new Set<string>();
    const shortDateMatch = normalized.match(/\b(\d{1,2})[./-](\d{1,2})\b/);
    if (shortDateMatch) {
      const day = shortDateMatch[1]?.padStart(2, '0');
      const month = shortDateMatch[2]?.padStart(2, '0');
      if (day && month) labels.add(`${day}.${month}`);
    }
    const isoDateMatch = normalized.match(/\b(\d{4})-(\d{2})-(\d{2})\b/);
    if (isoDateMatch) {
      labels.add(`${isoDateMatch[3]}.${isoDateMatch[2]}`);
    }
    return [...labels];
  }

  public async inferInviteLinkCampaignId(params: {
    workspaceId: string;
    channelId: string;
    title: string | null | undefined;
    existingCampaignId?: string | null;
  }) {
    if (params.existingCampaignId) return params.existingCampaignId;
    const dateLabels = this.extractInviteLinkTitleDateLabels(params.title);
    if (!dateLabels.length) return null;

    const campaigns = await this.prisma.adCampaign.findMany({
      where: {
        workspaceId: params.workspaceId,
        telegramChannelId: params.channelId,
      },
      select: {
        id: true,
        title: true,
        placementDate: true,
        startedAt: true,
        createdAt: true,
      },
    });

    const candidates = campaigns.filter((campaign: any) => {
      const date =
        campaign.placementDate ??
        campaign.startedAt ??
        campaign.createdAt ??
        null;
      const campaignDateLabel = date
        ? this.formatInviteLinkDateLabel(new Date(date))
        : null;
      const campaignTitleLabels = this.extractInviteLinkTitleDateLabels(
        campaign.title,
      );
      return dateLabels.some(
        (label) =>
          label === campaignDateLabel || campaignTitleLabels.includes(label),
      );
    });

    return candidates.length === 1 ? candidates[0].id : null;
  }

  public async buildInviteAttributionMaps(workspaceId: string) {
    const [members, integrations] = await Promise.all([
      this.prisma.workspaceMember.findMany({
        where: { workspaceId },
        select: { id: true, telegramUsername: true },
      }),
      this.prisma.telegramUserAccountIntegration.findMany({
        where: { workspaceId },
        select: {
          telegramUserId: true,
          username: true,
          assignedMemberId: true,
        },
      }),
    ]);
    return buildInviteLinkAttributionMaps({ members, integrations });
  }

  async reattributeWorkspaceInviteLinks(workspaceId: string) {
    const maps = await this.buildInviteAttributionMaps(workspaceId);
    const links = await this.prisma.telegramInviteLink.findMany({
      where: { workspaceId },
      select: {
        id: true,
        creatorTelegramUserId: true,
        creatorUsername: true,
        creatorFirstName: true,
        creatorLastName: true,
        creatorPhotoUrl: true,
      },
    });
    await this.prisma.$transaction(
      links.map((link) => {
        const attribution = attributeInviteLinkCreator(
          {
            creatorTelegramUserId: link.creatorTelegramUserId,
            creatorUsername: link.creatorUsername,
            creatorFirstName: link.creatorFirstName,
            creatorLastName: link.creatorLastName,
            creatorPhotoUrl: link.creatorPhotoUrl,
          },
          maps,
        );
        return this.prisma.telegramInviteLink.update({
          where: { id: link.id },
          data: {
            creatorMemberId: attribution.creatorMemberId,
            creatorMatchSource: attribution.creatorMatchSource,
            creatorUsername: attribution.creatorUsername,
          },
        });
      }),
    );
  }
}
