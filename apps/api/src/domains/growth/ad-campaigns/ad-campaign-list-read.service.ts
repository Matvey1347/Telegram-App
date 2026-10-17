import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  sumInviteLinkAttributedSubscribers,
  sumInviteLinkJoinedSubscribers,
} from '../../../common/analytics/invite-link-metrics';
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
      isRevoked: true,
      lastSyncedAt: true,
      creatorUsername: true,
      creatorFirstName: true,
      creatorLastName: true,
      creatorPhotoUrl: true,
    },
  },
  botInviteLinks: {
    select: {
      kind: true,
      baselineJoinedCount: true,
      baselineRequestedCount: true,
      inviteLink: {
        select: {
          id: true,
          telegramChannelId: true,
          name: true,
          url: true,
          joinedCount: true,
          requestedCount: true,
          telegramChannel: {
            select: { id: true, title: true, photoUrl: true },
          },
        },
      },
    },
  },
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
type BotRequestPerformance = {
  total: number;
  points: BotRequestTrendPoint[];
  channels: Array<{
    telegramChannelId: string;
    title: string;
    photoUrl: string | null;
    requests: number;
    peak: number;
    dropFromPeak: number;
    dropPercent: number;
    points: Array<{
      syncedAt: string;
      joinedCount: number;
      requestedCount: number;
      totalAttributed: number;
      peakJoinedCount: number;
      drawdownFromPeak: number;
      drawdownPercent: number;
    }>;
  }>;
  startsAt: string;
  endsAt: string | null;
};

type BotRequestTrendPoint = {
  syncedAt: string;
  joinedCount: number;
  requestedCount: number;
  totalAttributed: number;
  peakJoinedCount: number;
  drawdownFromPeak: number;
  drawdownPercent: number;
};

function aggregateBotRequestPoints(
  channels: Array<{
    telegramChannelId: string;
    points: BotRequestTrendPoint[];
  }>,
) {
  const changes = new Map<
    string,
    Array<{ channelId: string; point: BotRequestTrendPoint }>
  >();
  for (const channel of channels) {
    for (const point of channel.points) {
      const at = changes.get(point.syncedAt) ?? [];
      at.push({ channelId: channel.telegramChannelId, point });
      changes.set(point.syncedAt, at);
    }
  }

  const currentByChannel = new Map<string, BotRequestTrendPoint>();
  let peak = 0;
  let peakJoined = 0;
  return [...changes.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([syncedAt, updates]) => {
      for (const update of updates) {
        currentByChannel.set(update.channelId, update.point);
      }
      const joinedCount = [...currentByChannel.values()].reduce(
        (sum, point) => sum + point.joinedCount,
        0,
      );
      const requestedCount = [...currentByChannel.values()].reduce(
        (sum, point) => sum + point.requestedCount,
        0,
      );
      const totalAttributed = joinedCount + requestedCount;
      peak = Math.max(peak, totalAttributed);
      peakJoined = Math.max(peakJoined, joinedCount);
      const drawdownFromPeak = Math.max(0, peak - totalAttributed);
      return {
        syncedAt,
        joinedCount,
        requestedCount,
        totalAttributed,
        peakJoinedCount: peakJoined,
        drawdownFromPeak,
        drawdownPercent: peak > 0 ? (drawdownFromPeak / peak) * 100 : 0,
      } satisfies BotRequestTrendPoint;
    });
}

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
    const botRequestMetrics = await this.loadBotRequestMetrics(
      workspaceId,
      rows,
    );
    return createPaginatedResponse(
      rows.map((row) =>
        this.mapRow(
          row,
          legacyChannels,
          historySummaries,
          botRequestMetrics.get(row.id) ?? null,
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

  private async loadBotRequestMetrics(
    workspaceId: string,
    rows: CampaignListRow[],
  ) {
    const tracked = rows.flatMap((campaign) =>
      campaign.botInviteLinks.map((link) => {
        const inviteLink = link.inviteLink;
        return {
          campaignId: campaign.id,
          inviteLinkId: inviteLink.id,
          channelId: inviteLink.telegramChannelId,
          channelTitle: inviteLink.telegramChannel.title,
          channelPhotoUrl: inviteLink.telegramChannel.photoUrl,
          startsAt:
            campaign.placementDate ?? campaign.startedAt ?? campaign.createdAt,
          baselineJoined: Number(link.baselineJoinedCount ?? 0),
          baselineRequested: Number(link.baselineRequestedCount ?? 0),
          currentJoined: Number(inviteLink.joinedCount ?? 0),
          currentRequested: Number(inviteLink.requestedCount ?? 0),
        };
      }),
    );
    if (!tracked.length) return new Map<string, BotRequestPerformance>();
    // A bot request can be approved after the placement end date. These are
    // campaign-specific invite links with a saved baseline, so their outcome
    // must continue to accumulate instead of being cut off at `endedAt`.
    const latest = new Date();
    const snapshots = await this.prisma.telegramInviteLinkSnapshot.findMany({
      where: {
        workspaceId,
        inviteLinkId: {
          in: [...new Set(tracked.map((entry) => entry.inviteLinkId))],
        },
        syncedAt: { lte: latest },
      },
      select: {
        inviteLinkId: true,
        syncedAt: true,
        joinedCount: true,
        requestedCount: true,
      },
      orderBy: [{ syncedAt: 'asc' }, { id: 'asc' }],
    });
    const snapshotsByLink = new Map<string, typeof snapshots>();
    for (const snapshot of snapshots) {
      const linkSnapshots = snapshotsByLink.get(snapshot.inviteLinkId) ?? [];
      linkSnapshots.push(snapshot);
      snapshotsByLink.set(snapshot.inviteLinkId, linkSnapshots);
    }
    const result = new Map<string, BotRequestPerformance>();
    for (const campaign of rows) {
      const entries = tracked.filter(
        (entry) => entry.campaignId === campaign.id,
      );
      if (!entries.length) continue;
      const channels = new Map<
        string,
        {
          telegramChannelId: string;
          title: string;
          photoUrl: string | null;
          points: Map<
            string,
            { syncedAt: string; joinedCount: number; requestedCount: number }
          >;
        }
      >();
      for (const entry of entries) {
        const snapshotsForEntry =
          snapshotsByLink.get(entry.inviteLinkId) ?? [];
        const current = channels.get(entry.channelId) ?? {
          telegramChannelId: entry.channelId,
          title: entry.channelTitle,
          photoUrl: entry.channelPhotoUrl,
          points: new Map(),
        };
        const addPoint = (
          at: Date,
          joinedCount: number,
          requestedCount: number,
        ) => {
          const key = at.toISOString();
          const point = current.points.get(key) ?? {
            syncedAt: key,
            joinedCount: 0,
            requestedCount: 0,
          };
          point.joinedCount += Math.max(0, joinedCount - entry.baselineJoined);
          point.requestedCount += Math.max(
            0,
            requestedCount - entry.baselineRequested,
          );
          current.points.set(key, point);
        };
        addPoint(entry.startsAt, entry.baselineJoined, entry.baselineRequested);
        for (const snapshot of snapshotsForEntry) {
          if (snapshot.syncedAt > entry.startsAt) {
            addPoint(
              snapshot.syncedAt,
              snapshot.joinedCount,
              snapshot.requestedCount,
            );
          }
        }
        // Some links are only synced intermittently. Always add their live
        // counters so every linked channel contributes to the current total.
        addPoint(latest, entry.currentJoined, entry.currentRequested);
        channels.set(entry.channelId, current);
      }
      const channelRows = [...channels.values()].map((channel) => {
        const rawPoints = [...channel.points.values()]
          .map((point) => ({
            ...point,
            totalAttributed: point.joinedCount + point.requestedCount,
          }))
          .sort((left, right) => left.syncedAt.localeCompare(right.syncedAt));
        let peak = 0;
        let peakJoined = 0;
        const points = rawPoints.map((point) => {
          peak = Math.max(peak, point.totalAttributed);
          peakJoined = Math.max(peakJoined, point.joinedCount);
          const drawdownFromPeak = Math.max(0, peak - point.totalAttributed);
          return {
            ...point,
            peakJoinedCount: peakJoined,
            drawdownFromPeak,
            drawdownPercent: peak > 0 ? (drawdownFromPeak / peak) * 100 : 0,
          };
        });
        const requests = points.at(-1)?.totalAttributed ?? 0;
        const dropFromPeak = Math.max(0, peak - requests);
        return {
          telegramChannelId: channel.telegramChannelId,
          title: channel.title,
          photoUrl: channel.photoUrl,
          requests,
          peak: Math.max(0, ...points.map((point) => point.totalAttributed)),
          dropFromPeak,
          dropPercent: peak > 0 ? (dropFromPeak / peak) * 100 : 0,
          points,
        };
      });
      const points = aggregateBotRequestPoints(channelRows);
      result.set(campaign.id, {
        total: points.at(-1)?.totalAttributed ?? 0,
        points,
        channels: channelRows.sort((a, b) => b.requests - a.requests),
        startsAt: (
          campaign.placementDate ??
          campaign.startedAt ??
          campaign.createdAt
        ).toISOString(),
        endsAt: campaign.endedAt?.toISOString() ?? null,
      });
    }
    return result;
  }

  private mapRow(
    row: CampaignListRow,
    legacyChannels: Map<string, TelegramSource>,
    historySummaries: Map<string, CampaignListHistorySummary>,
    botRequestPerformance: BotRequestPerformance | null,
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
    const joinedCount = sumInviteLinkJoinedSubscribers(row.inviteLinks);
    const attributedCount = sumInviteLinkAttributedSubscribers(row.inviteLinks);
    const effectiveJoined = joinedCount > 0 ? joinedCount : row.joinedCount;
    const requestedCount = joinedCount > 0 ? attributedCount - joinedCount : 0;
    const costAmount = Number(row.price);
    return {
      ...row,
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
      botInviteLinkIds: row.botInviteLinks.map((link) => link.inviteLink.id),
      trackingLinkKind: row.botInviteLinks[0]?.kind ?? 'BOT',
      trackingChannelIds: [
        ...new Set(
          row.botInviteLinks.map((link) => link.inviteLink.telegramChannelId),
        ),
      ],
      botInviteLinks: row.botInviteLinks.map((link) => link.inviteLink),
      botRequestPerformance,
      ownTelegramChannelId: row.telegramChannelId,
      costAmount,
      advertisingChannels: sources,
      attributionType: attributionCount > 1 ? 'mixed' : 'clean',
      isMixedAttribution: attributionCount > 1,
      inviteLinkHistorySummary: historySummaries.get(row.id) ?? null,
      analytics: {
        joinedCount: effectiveJoined,
        requestedCount,
        attributedCount: effectiveJoined + requestedCount,
        leftCount: row.leftCount,
        netGrowth: row.netGrowthCount,
        costAmount,
        currency: row.currency,
        costPerJoinedSubscriber:
          effectiveJoined + requestedCount > 0
            ? costAmount / (effectiveJoined + requestedCount)
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
