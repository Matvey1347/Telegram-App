import { savedTrackingScope } from './ad-campaign-link-selection';
import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { campaignInviteWindowMetrics } from './ad-campaign-invite-window-metrics';
import { DEFAULT_BOT_PLACEMENT_DURATION_MS, MAX_BOT_OBSERVATION_GAP_MS, overlapShare, type CampaignWindow } from './bot-request-allocation';
import { loadBotRequestExposures } from './bot-request-exposures';
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
  trackingScope: true,
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
  botInviteLinks: {
    select: {
      kind: true,
      createdAt: true,
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
          joinedObservedAt: true,
          requestedObservedAt: true,
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
  estimated: boolean;
  confirmed: boolean;
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
          kind: link.kind,
          campaignChannelId: campaign.telegramChannelId,
          inviteLinkId: inviteLink.id,
          channelId: inviteLink.telegramChannelId,
          channelTitle: inviteLink.telegramChannel.title,
          channelPhotoUrl: inviteLink.telegramChannel.photoUrl,
          startsAt:
            campaign.startedAt ?? campaign.placementDate ?? campaign.createdAt,
          baselineAt: link.createdAt,
          baselineJoined: Number(link.baselineJoinedCount ?? 0),
          baselineRequested: Number(link.baselineRequestedCount ?? 0),
          currentJoined: Number(inviteLink.joinedCount ?? 0),
          currentRequested: Number(inviteLink.requestedCount ?? 0),
          joinedObservedAt: inviteLink.joinedObservedAt,
          requestedObservedAt: inviteLink.requestedObservedAt,
        };
      }),
    );
    if (!tracked.length) return new Map<string, BotRequestPerformance>();
    const latest = new Date();
    const sharedEntries = tracked.filter((entry) => entry.kind === 'BOT');
    const [claims, exposures] = await Promise.all([
      this.prisma.adCampaignBotInviteLink.findMany({
        where: { inviteLinkId: { in: [...new Set(tracked.map((entry) => entry.inviteLinkId))] }, adCampaign: { workspaceId } },
        select: { inviteLinkId: true, kind: true, adCampaign: { select: { id: true, placementDate: true, startedAt: true, createdAt: true, endedAt: true, sourcePostViews: true } } },
      }),
      sharedEntries.length ? loadBotRequestExposures(
        this.prisma, workspaceId, [...new Set(sharedEntries.flatMap((entry) => [entry.channelId, entry.campaignChannelId]))],
        new Date(Math.min(...sharedEntries.map((entry) => entry.startsAt.getTime()))), latest,
      ) : new Map<string, CampaignWindow[]>(),
    ]);
    const windowsByLink = new Map<string, CampaignWindow[]>();
    for (const { inviteLinkId, adCampaign, kind } of claims) {
      const startsAt = adCampaign.startedAt ?? adCampaign.placementDate ?? adCampaign.createdAt;
      const endsAt = adCampaign.endedAt ?? (kind === 'BOT' ? new Date(startsAt.getTime() + DEFAULT_BOT_PLACEMENT_DURATION_MS) : null);
      const windows = windowsByLink.get(inviteLinkId) ?? [];
      windows.push({ campaignId: adCampaign.id, startsAt, endsAt, views: adCampaign.sourcePostViews });
      windowsByLink.set(inviteLinkId, windows);
    }
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
      let estimated = false;
      let confirmed = false;
      const channels = new Map<
        string,
        {
          telegramChannelId: string;
          title: string;
          photoUrl: string | null;
          points: Map<
            string,
            Map<string, { joinedCount: number; requestedCount: number }>
          >;
        }
      >();
      for (const entry of entries) {
        const snapshotsForEntry = snapshotsByLink.get(entry.inviteLinkId) ?? [];
        const shared = entry.kind === 'BOT';
        const candidates = [
          ...(windowsByLink.get(entry.inviteLinkId) ?? []),
          ...(shared ? exposures.get(entry.channelId) ?? [] : []),
          ...(shared && entry.campaignChannelId !== entry.channelId
            ? exposures.get(entry.campaignChannelId) ?? [] : []),
        ];
        const windows = [...new Map(candidates.map((window) => [window.campaignId, window])).values()];
        const opening = snapshotsForEntry.findLast((point) => point.syncedAt <= entry.startsAt &&
          point.joinedCount != null && point.requestedCount != null);
        const baselineJoined = opening?.joinedCount ?? entry.baselineJoined;
        const baselineRequested = opening?.requestedCount ?? entry.baselineRequested;
        const observedExposure = windows.find((window) => window.campaignId === entry.campaignId);
        const endsAt = shared
          ? campaign.endedAt ?? observedExposure?.endsAt ?? new Date(entry.startsAt.getTime() + DEFAULT_BOT_PLACEMENT_DURATION_MS)
          : savedTrackingScope(campaign.trackingScope) ? campaign.endedAt : null;
        const own = { campaignId: entry.campaignId, startsAt: entry.startsAt, endsAt,
          views: campaign.sourcePostViews, requests: observedExposure?.requests };
        estimated ||= shared && !campaign.endedAt;
        const anchor = opening?.syncedAt ?? (entry.baselineAt && entry.baselineAt <= entry.startsAt ? entry.baselineAt : null);
        let previousAt = shared && anchor ? anchor : entry.startsAt;
        let previousJoined = baselineJoined, previousRequested = baselineRequested;
        let hasAnchor = !shared || Boolean(anchor);
        let allocatedJoined = 0, allocatedRequested = 0;
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
          const pointsAt = current.points.get(key) ?? new Map();
          const validInterval = at > previousAt && hasAnchor &&
            (!shared || at.getTime() - previousAt.getTime() <= MAX_BOT_OBSERVATION_GAP_MS);
          const share = validInterval ? overlapShare(previousAt, at, own, windows) : 0;
          if (share > 0) {
            confirmed = true;
            estimated ||= share < 1;
          }
          hasAnchor = true;
          allocatedJoined = Math.max(0, allocatedJoined + (Math.max(0, joinedCount - baselineJoined) - Math.max(0, previousJoined - baselineJoined)) * share);
          allocatedRequested = Math.max(0, allocatedRequested + (Math.max(0, requestedCount - baselineRequested) - Math.max(0, previousRequested - baselineRequested)) * share);
          previousAt = at; previousJoined = joinedCount; previousRequested = requestedCount;
          pointsAt.set(entry.inviteLinkId, { joinedCount: allocatedJoined, requestedCount: allocatedRequested });
          current.points.set(key, pointsAt);
        };
        if (!shared) addPoint(entry.startsAt, baselineJoined, baselineRequested);
        for (const snapshot of snapshotsForEntry) {
          if (shared && endsAt && previousAt >= endsAt) break;
          if (snapshot.syncedAt > entry.startsAt && (shared || !endsAt || snapshot.syncedAt <= endsAt) &&
            (snapshot.joinedCount != null || snapshot.requestedCount != null)) {
            addPoint(
              snapshot.syncedAt,
              snapshot.joinedCount ?? previousJoined,
              snapshot.requestedCount ?? previousRequested,
            );
          }
        }
        // Some links are only synced intermittently. Always add their live
        // counters so every linked channel contributes to the current total.
        if (!endsAt || (shared && previousAt < endsAt)) {
          const hasJoined = Boolean(entry.joinedObservedAt && entry.joinedObservedAt >= entry.startsAt);
          const hasRequested = Boolean(entry.requestedObservedAt && entry.requestedObservedAt >= entry.startsAt);
          if (hasJoined || hasRequested) {
            const observedAt = new Date(Math.max(
              hasJoined ? entry.joinedObservedAt!.getTime() : 0,
              hasRequested ? entry.requestedObservedAt!.getTime() : 0,
            ));
            if (observedAt >= previousAt)
              addPoint(observedAt, hasJoined ? entry.currentJoined : previousJoined, hasRequested ? entry.currentRequested : previousRequested);
          }
        }
        channels.set(entry.channelId, current);
      }
      const channelRows = [...channels.values()].map((channel) => {
        const latestByLink = new Map<string, { joinedCount: number; requestedCount: number }>();
        const rawPoints = [...channel.points.entries()].sort(([left], [right]) => left.localeCompare(right))
          .map(([syncedAt, updates]) => {
            updates.forEach((point, linkId) => latestByLink.set(linkId, point));
            const totals = [...latestByLink.values()].reduce((sum, point) => ({
              joinedCount: sum.joinedCount + point.joinedCount,
              requestedCount: sum.requestedCount + point.requestedCount,
            }), { joinedCount: 0, requestedCount: 0 });
            return { syncedAt, ...totals, totalAttributed: totals.joinedCount + totals.requestedCount };
          });
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
      const startsAt = campaign.startedAt ?? campaign.placementDate ?? campaign.createdAt;
      const fallbackEnd = entries.every((entry) => entry.kind === 'BOT')
        ? exposures.get(campaign.telegramChannelId)?.find((window) => window.campaignId === campaign.id)?.endsAt
          ?? new Date(startsAt.getTime() + DEFAULT_BOT_PLACEMENT_DURATION_MS)
        : null;
      result.set(campaign.id, {
        total: points.at(-1)?.totalAttributed ?? 0,
        estimated,
        confirmed,
        points,
        channels: channelRows.sort((a, b) => b.requests - a.requests),
        startsAt: startsAt.toISOString(),
        endsAt: (campaign.endedAt ?? fallbackEnd)?.toISOString() ?? null,
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
      botInviteLinkIds: row.botInviteLinks.map((link) => link.inviteLink.id),
      trackingAllChannels: row.trackingScope == null ? undefined : savedTrackingScope(row.trackingScope)?.channelIds === null,
      trackingLinkKind: savedTrackingScope(row.trackingScope)?.kind ?? row.botInviteLinks[0]?.kind ?? 'BOT',
      trackingChannelIds: savedTrackingScope(row.trackingScope)?.channelIds ?? [
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
