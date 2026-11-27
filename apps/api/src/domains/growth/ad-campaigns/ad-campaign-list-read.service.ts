import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { campaignInviteWindowMetrics } from './ad-campaign-invite-window-metrics';
import { iconToResolvedEmoji } from '../../../common/icons/resolved-emoji';
import {
  createPaginatedResponse,
  normalizePagination,
} from '../../../common/pagination/pagination.utils';
import { WorkspaceService } from '../../../common/workspace.service';
import { PrismaService } from '../../../prisma/prisma.service';
import { AdCampaignQueryDto } from './dto';
import {
  buildAdCampaignListWhere,
  buildAdCampaignPageIdQuery,
  type AdCampaignPageId,
} from './ad-campaign-list-query';
import {
  CampaignListHistorySummary,
  loadCampaignListHistorySummaries,
} from './ad-campaign-list-history-summary';

const CAMPAIGN_LIST_SELECT = {
  id: true,
  workspaceId: true,
  telegramChannelId: true,
  promoId: true,
  telegramInviteLinkId: true,
  title: true,
  status: true,
  price: true,
  currency: true,
  priceInPrimaryCurrency: true,
  exchangeRateToPrimary: true,
  placementDate: true,
  sourcePostViews: true,
  startedAt: true,
  endedAt: true,
  joinedCount: true,
  leftCount: true,
  netGrowthCount: true,
  excludeFromAnalytics: true,
  assignedMemberId: true,
  createdAt: true,
  updatedAt: true,
  telegramChannel: {
    select: {
      id: true,
      title: true,
      username: true,
      photoUrl: true,
      presentationIcon: true,
      currentSubscribersCount: true,
      kpiCurrency: true,
      adBaseCurrency: true,
      targetCpaFrom: true,
      targetCpa: true,
      acceptableCpaFrom: true,
      acceptableCpa: true,
      stopCpaFrom: true,
      stopCpa: true,
    },
  },
  assignedMember: WorkspaceService.assignedMemberInclude,
  promo: {
    select: {
      id: true,
      telegramChannelId: true,
      iconId: true,
      title: true,
      status: true,
      icon: true,
    },
  },
  promos: {
    select: {
      promo: {
        select: {
          id: true,
          telegramChannelId: true,
          iconId: true,
          title: true,
          status: true,
          icon: true,
        },
      },
    },
  },
  inviteLinks: {
    select: {
      id: true,
      telegramChannelId: true,
      adCampaignId: true,
      name: true,
      url: true,
      joinedCount: true,
      requestedCount: true,
      joinedObservedAt: true, requestedObservedAt: true, joinedObserved: true, requestedObserved: true,
      isRevoked: true,
      lastSyncedAt: true,
      creatorUsername: true,
      creatorFirstName: true,
      creatorLastName: true,
      creatorPhotoUrl: true,
    },
  },
  inviteLinkWindows: { select: { inviteLinkId: true, fromDate: true, currentRequests: true, peakPendingCount: true, timezone: true, joinedCount: true, pendingCount: true, computedAt: true, lastAttemptAt: true, lastAttemptStatus: true, lastAttemptReason: true } },
  advertisingTelegramChannels: {
    select: {
      telegramChannel: {
        select: {
          id: true,
          title: true,
          username: true,
          photoUrl: true,
          currentSubscribersCount: true,
          adminLinks: { select: { id: true }, take: 1 },
        },
      },
    },
  },
  advertisingChannels: {
    select: {
      advertisingSource: {
        select: {
          id: true,
          type: true,
          name: true,
          telegramUsername: true,
          url: true,
          contactInfo: true,
          notes: true,
          imageUrl: true,
          subscribersCount: true,
          createdAt: true,
          updatedAt: true,
        },
      },
    },
  },
} satisfies Prisma.AdCampaignSelect;

type CampaignListRow = Prisma.AdCampaignGetPayload<{
  select: typeof CAMPAIGN_LIST_SELECT;
}>;
type TelegramSource =
  CampaignListRow['advertisingTelegramChannels'][number]['telegramChannel'];
type LegacySource =
  CampaignListRow['advertisingChannels'][number]['advertisingSource'];
const normalizeUsername = (value?: string | null) =>
  value?.trim().replace(/^@/, '').toLowerCase() || null;

@Injectable()
export class AdCampaignListReadService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly workspaceService: WorkspaceService,
  ) {}

  async findAll(userId: string, query: AdCampaignQueryDto = {}) {
    const workspaceId =
      await this.workspaceService.resolveWorkspaceIdForUser(userId);
    const where = buildAdCampaignListWhere(workspaceId, query);
    const pagination = normalizePagination(query);
    const exactPageOrder = Boolean(
      query.search?.trim() || query.dateFrom || query.dateTo || query.sort,
    );
    let rows: CampaignListRow[];
    let totalItems: number;
    if (exactPageOrder) {
      const [pageIds, count] = await Promise.all([
        this.prisma.$queryRaw<AdCampaignPageId[]>(
          buildAdCampaignPageIdQuery(
            workspaceId,
            query,
            pagination.skip,
            pagination.take,
          ),
        ),
        this.prisma.adCampaign.count({ where }),
      ]);
      const unorderedRows = pageIds.length
        ? await this.prisma.adCampaign.findMany({
            where: { workspaceId, id: { in: pageIds.map(({ id }) => id) } },
            select: CAMPAIGN_LIST_SELECT,
          })
        : [];
      const rowsById = new Map(unorderedRows.map((row) => [row.id, row]));
      rows = pageIds.flatMap(({ id }) => {
        const row = rowsById.get(id);
        return row ? [row] : [];
      });
      totalItems = count;
    } else {
      [rows, totalItems] = await Promise.all([
        this.prisma.adCampaign.findMany({
          where,
          select: CAMPAIGN_LIST_SELECT,
          orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
          skip: pagination.skip,
          take: pagination.take,
        }),
        this.prisma.adCampaign.count({ where }),
      ]);
    }
    const [legacyChannels, historySummaries] = await Promise.all([
      this.resolveLegacyChannels(workspaceId, rows),
      loadCampaignListHistorySummaries(this.prisma, workspaceId, rows),
    ]);
    return createPaginatedResponse(
      rows.map((row) =>
        this.mapRow(
          row,
          legacyChannels,
          historySummaries,
        ),
      ),
      totalItems,
      pagination,
    );
  }

  private async resolveLegacyChannels(
    workspaceId: string,
    rows: CampaignListRow[],
  ) {
    const sources = rows.flatMap((row) =>
      row.advertisingChannels
        .map((link) => link.advertisingSource)
        .filter((source) => source.type === 'telegram_channel'),
    );
    if (!sources.length) return new Map<string, TelegramSource>();
    const channels = await this.prisma.telegramChannel.findMany({
      where: {
        workspaceId,
        OR: sources.flatMap((source) => [
          ...(normalizeUsername(source.telegramUsername)
            ? [
                {
                  username: {
                    equals: normalizeUsername(source.telegramUsername)!,
                    mode: 'insensitive' as const,
                  },
                },
              ]
            : []),
          { title: source.name },
        ]),
      },
      select: {
        id: true,
        title: true,
        username: true,
        photoUrl: true,
        currentSubscribersCount: true,
        adminLinks: { select: { id: true }, take: 1 },
      },
    });
    const result = new Map<string, TelegramSource>();
    for (const source of sources) {
      const username = normalizeUsername(source.telegramUsername);
      const channel = channels.find(
        (candidate) =>
          (username && normalizeUsername(candidate.username) === username) ||
          candidate.title === source.name,
      );
      if (channel) result.set(source.id, channel);
    }
    return result;
  }

  private mapRow(
    row: CampaignListRow,
    legacyChannels: Map<string, TelegramSource>,
    historySummaries: Map<string, CampaignListHistorySummary>,
  ) {
    const linkedPromos = new Map(
      [row.promo, ...row.promos.map((link) => link.promo)]
        .filter((promo): promo is NonNullable<typeof promo> => Boolean(promo))
        .map((promo) => [promo.id, promo]),
    );
    const promos = [...linkedPromos.values()].map((promo) => ({
      ...promo,
      iconPresentation: iconToResolvedEmoji(promo.icon),
    }));
    const sources = this.dedupeSources([
      ...row.advertisingTelegramChannels.map((link) =>
        this.telegramSource(link.telegramChannel),
      ),
      ...row.advertisingChannels.map((link) => {
        const source = link.advertisingSource;
        const channel = legacyChannels.get(source.id);
        return channel
          ? this.telegramSource(channel)
          : this.personSource(source);
      }),
    ]);
    const attributionCount =
      row.advertisingTelegramChannels.length + row.advertisingChannels.length;
    const counts = campaignInviteWindowMetrics(row.inviteLinks, row.inviteLinkWindows, row.startedAt ?? row.placementDate);
    const unavailable = counts.joined == null || counts.pending == null;
    const effectiveJoined = row.inviteLinks.length ? counts?.joined ?? null : row.joinedCount;
    const requestedCount = counts.pending;
    const attributedCount = effectiveJoined == null || requestedCount == null
      ? null : effectiveJoined + requestedCount;
    const costAmount = Number(row.price);
    const { presentationIcon, ...channel } = row.telegramChannel;
    return {
      ...row,
      telegramChannel: {
        ...channel,
        avatarPresentation: iconToResolvedEmoji(presentationIcon) ?? (channel.photoUrl
          ? { type: 'image' as const, id: channel.id, url: channel.photoUrl }
          : null),
      },
      assignedMember: row.assignedMember
        ? {
            ...row.assignedMember,
            avatarPresentation: iconToResolvedEmoji(
              row.assignedMember.avatarIcon,
            ),
          }
        : null,
      promo: promos[0] ?? null,
      promos,
      promoId: promos[0]?.id ?? row.promoId,
      promoIds: promos.map((promo) => promo.id),
      telegramInviteLink:
        row.inviteLinks.find((link) => link.id === row.telegramInviteLinkId) ??
        row.inviteLinks[0] ??
        null,
      inviteLinkIds: row.inviteLinks.map((link) => link.id),
      ownTelegramChannelId: row.telegramChannelId,
      costAmount,
      advertisingChannels: sources,
      attributionType: attributionCount > 1 ? 'mixed' : 'clean',
      isMixedAttribution: attributionCount > 1,
      inviteLinkHistorySummary: row.inviteLinkWindows.length ? null : historySummaries.get(row.id) ?? null,
      periodCountsUnavailable: unavailable,
      analytics: {
        joinedCount: effectiveJoined,
        requestedCount,
        attributedCount,
        leftCount: row.leftCount,
        netGrowth: row.netGrowthCount,
        costAmount,
        currency: row.currency,
        costPerJoinedSubscriber:
          attributedCount != null && attributedCount > 0
            ? costAmount / attributedCount
            : null,
        costPerNetSubscriber: null,
        attributionSource: 'mtproto_invite_link_usage',
      },
    };
  }

  private telegramSource(channel: TelegramSource) {
    const own = channel.adminLinks.length > 0;
    return {
      ...channel,
      selectionId: `channel:${channel.id}`,
      sourceKind: own ? 'own_channel' : 'external_channel',
      kind: own ? 'own_channel' : 'external_channel',
      imageUrl: channel.photoUrl,
      subscribersCount: channel.currentSubscribersCount ?? 0,
    };
  }

  private personSource(source: LegacySource) {
    return {
      id: source.id,
      selectionId: `source:${source.id}`,
      sourceKind: 'person',
      kind: 'person',
      title: source.name,
      username: source.telegramUsername,
      telegramUrl: source.url,
      contactInfo: source.contactInfo,
      notes: source.notes,
      imageUrl: source.imageUrl,
      subscribersCount: source.subscribersCount ?? 0,
      createdAt: source.createdAt,
      updatedAt: source.updatedAt,
    };
  }

  private dedupeSources<T extends { selectionId: string }>(sources: T[]) {
    return [
      ...new Map(
        sources.map((source) => [source.selectionId, source]),
      ).values(),
    ];
  }
}
