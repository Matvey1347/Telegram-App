import { NotFoundException } from '@nestjs/common';
import { campaignDetailMetrics } from './ad-campaign-detail-metrics';
import { PrismaService } from '../../../prisma/prisma.service';
import { WorkspaceService } from '../../../common/workspace.service';
import { iconToResolvedEmoji } from '../../../common/icons/resolved-emoji';
import {
  buildCampaignInviteLinkHistoryPayload,
  type CampaignInviteLinkHistoryPayload,
} from './invite-link-history';
import {
  normalizeSelectionIds,
  normalizeTelegramChannelSource,
  normalizePersonSource,
  resolveLegacyTelegramChannelSource,
  dedupeAdvertisingSources,
} from './ad-campaign-advertising-sources';
import {
  isCampaignStorageMissing,
  AdCampaignPromoStorage,
} from './ad-campaign-promo-storage';
import {
  AdCampaignAdmissionViewRead,
  shapeAdmissionViewAnalytics,
} from './ad-campaign-admission-view-read';

export class AdCampaignDetailRead {
  constructor(
    private readonly prisma: PrismaService,
    private readonly promoStorage: AdCampaignPromoStorage,
    private readonly admission: AdCampaignAdmissionViewRead,
  ) {}

  private async shapeCampaign(
    row: any,
    preloadedInviteLinkHistory?: CampaignInviteLinkHistoryPayload | null,
    admissionViewAnalytics?: ReturnType<
      typeof shapeAdmissionViewAnalytics
    > | null,
  ) {
    const analytics = await campaignDetailMetrics(this.prisma, row);
    const linkedPromos = normalizeSelectionIds([
      row.promo?.id,
      ...(Array.isArray(row.promos)
        ? row.promos.map((item: any) => item?.promo?.id)
        : []),
    ])
      .map((promoId) => {
        if (row.promo?.id === promoId) return row.promo;
        return row.promos.find((item: any) => item.promo?.id === promoId)
          ?.promo;
      })
      .filter(Boolean);
    const presentMember = (member: any) =>
      member
        ? {
            ...member,
            avatarPresentation: iconToResolvedEmoji(member.avatarIcon),
          }
        : member;
    const presentPromo = (promo: any) => ({
      ...promo,
      iconPresentation: iconToResolvedEmoji(promo.icon),
    });
    const inviteLinks = (
      Array.isArray(row.inviteLinks) ? row.inviteLinks : []
    ).map((link: any) => ({
      ...link,
      creatorMember: presentMember(link.creatorMember),
    }));
    const normalizedLegacySources = await Promise.all(
      row.advertisingChannels.map(async (x: any) => {
        const source = x.advertisingSource;
        if (source?.type === 'telegram_channel') {
          const legacyChannel = await resolveLegacyTelegramChannelSource(
            this.prisma,
            row.workspaceId,
            source,
          );
          if (legacyChannel) return legacyChannel;
        }
        return normalizePersonSource(source);
      }),
    );
    const inviteLinkHistory = preloadedInviteLinkHistory ?? null;
    const inviteLinkHistoryById = new Map(
      (inviteLinkHistory?.inviteLinks ?? []).map((link) => [link.id, link]),
    );
    const enrichedInviteLinks = inviteLinks.map((link: any) => ({
      ...link,
      requestedCount: Number(link.requestedCount ?? 0),
      history: inviteLinkHistoryById.has(link.id)
        ? {
            inviteLink: link,
            points: inviteLinkHistoryById.get(link.id)?.points ?? [],
            summary: inviteLinkHistoryById.get(link.id)?.summary ?? null,
          }
        : null,
    }));
    const telegramInviteLink =
      enrichedInviteLinks.find(
        (link: any) => link.id === row.telegramInviteLinkId,
      ) ||
      enrichedInviteLinks[0] ||
      null;
    return {
      ...row,
      assignedMember: presentMember(row.assignedMember),
      telegramInviteLink,
      inviteLinks: enrichedInviteLinks,
      promos: linkedPromos.map(presentPromo),
      promo: linkedPromos[0] ? presentPromo(linkedPromos[0]) : null,
      promoId: linkedPromos[0]?.id || row.promoId || null,
      promoIds: linkedPromos.map((promo: any) => promo.id),
      ownTelegramChannelId: row.telegramChannelId,
      promoInviteLinkId: telegramInviteLink?.id || row.telegramInviteLinkId,
      telegramInviteLinkId: telegramInviteLink?.id || row.telegramInviteLinkId,
      inviteLinkIds: inviteLinks.map((link: any) => link.id),
      costAmount: Number(row.price),
      advertisingChannels: dedupeAdvertisingSources([
        ...row.advertisingTelegramChannels.map((x: any) =>
          normalizeTelegramChannelSource(x.telegramChannel),
        ),
        ...normalizedLegacySources,
      ]),
      attributionType:
        row.advertisingTelegramChannels.length +
          row.advertisingChannels.length >
        1
          ? 'mixed'
          : 'clean',
      isMixedAttribution:
        row.advertisingTelegramChannels.length +
          row.advertisingChannels.length >
        1,
      inviteLinkHistory,
      admissionViewAnalytics:
        admissionViewAnalytics ?? shapeAdmissionViewAnalytics([]),
      analytics,
    };
  }

  private adCampaignInclude(withCampaignPromos: boolean) {
    return {
      telegramChannel: true,
      promo: { include: { icon: true, telegramChannel: true } },
      ...(withCampaignPromos
        ? {
            promos: {
              include: {
                promo: { include: { icon: true, telegramChannel: true } },
              },
            },
          }
        : {}),
      account: true,
      assignedMember: WorkspaceService.assignedMemberInclude,
      createdByUser: WorkspaceService.createdByUserInclude,
      inviteLinks: {
        select: {
          id: true,
          telegramChannelId: true,
          adCampaignId: true,
          name: true,
          url: true,
          joinedCount: true,
          requestedCount: true,
          isRevoked: true,
          lastSyncedAt: true,
          createdAt: true,
          updatedAt: true,
          creatorTelegramUserId: true,
          creatorUsername: true,
          creatorFirstName: true,
          creatorLastName: true,
          creatorPhotoUrl: true,
          creatorMatchSource: true,
          creatorMember: WorkspaceService.assignedMemberInclude,
        },
      },
      advertisingTelegramChannels: {
        include: {
          telegramChannel: {
            include: { adminLinks: true },
          },
        },
      },
      advertisingChannels: { include: { advertisingSource: true } },
      hypothesisLinks: {
        include: {
          hypothesis: {
            select: { id: true, name: true, status: true },
          },
        },
      },
    };
  }

  async findOne(workspaceId: string, id: string) {
    let row;
    try {
      row = await (this.prisma.adCampaign as any).findFirst({
        where: { id, workspaceId },
        omit: { trackingScope: true },
        include: this.adCampaignInclude(
          await this.promoStorage.hasCampaignPromoStorage(),
        ),
      });
    } catch (error) {
      if (!isCampaignStorageMissing(error)) throw error;
      this.promoStorage.markMissing();
      row = await (this.prisma.adCampaign as any).findFirst({
        where: { id, workspaceId },
        omit: { trackingScope: true },
        include: this.adCampaignInclude(false),
      });
    }
    if (!row) throw new NotFoundException('Campaign not found');
    const campaignJoinedCount = Array.isArray(row.inviteLinks)
      ? row.inviteLinks.reduce(
          (sum: number, link: any) => sum + Number(link.joinedCount || 0),
          0,
        )
      : Number(row.joinedCount || row.analytics?.joinedCount || 0);
    const admissionViewAnalytics =
      await this.admission.preloadAdmissionViewAnalytics(
        workspaceId,
        [row.id],
        30,
        new Map([[row.id, campaignJoinedCount]]),
      );
    return this.shapeCampaign(
      row,
      buildCampaignInviteLinkHistoryPayload(
        {
          id: row.id,
          title: row.title,
          inviteLinks: Array.isArray(row.inviteLinks)
            ? row.inviteLinks.map((link: any) => ({
                ...link,
                requestedCount: Number(link.requestedCount ?? 0),
              }))
            : [],
        },
        [],
      ),
      admissionViewAnalytics.get(row.id) ?? null,
    );
  }
}
