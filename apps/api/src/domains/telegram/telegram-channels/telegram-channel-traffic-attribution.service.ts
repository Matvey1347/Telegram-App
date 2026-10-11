import { Injectable, NotFoundException } from '@nestjs/common';
import type {
  CrossPromotionTargetInput,
  TelegramChannelTrafficAttributionDetail,
  TelegramChannelTrafficAttributionItem,
  TelegramChannelTrafficAttributionPreview,
  TelegramChannelTrafficSourceKind,
} from '@telegram-system/shared';
import { CurrencyConversionService } from '../../../common/currency-conversion.service';
import { TelegramChannelsSupportService } from './telegram-channels-support.service';
import { TelegramChannelAudienceTrendReadService } from './telegram-channel-audience-trend-read.service';
import {
  TelegramChannelTrafficAttributionReadService,
  type TrafficAttributionChannelSettings,
  type TrafficAttributionInviteLinkRow,
} from './telegram-channel-traffic-attribution-read.service';
import {
  buildTrafficAttributionHistoryPoints,
  summarizeTrafficAttribution,
  trafficAttributionMetrics,
} from './telegram-channel-traffic-attribution';
import {
  aggregateTrafficAttributionPreviews,
  unattributedTrafficHistoryPoints,
} from './telegram-channel-traffic-attribution-preview';

type PreparedAttribution = {
  previews: Map<string, TelegramChannelTrafficAttributionPreview>;
  itemsByChannel: Map<string, TelegramChannelTrafficAttributionItem[]>;
  linksByChannel: Map<string, TrafficAttributionInviteLinkRow[]>;
  linkKinds: Map<string, TelegramChannelTrafficSourceKind>;
  currency: string;
};

type TrafficAttributionSummaryOptions = {
  windowDays?: number;
  now?: Date;
  /**
   * The card's audience read is the authority for total subscriber movement.
   * Passing it here lets source attribution reconcile without another snapshot
   * query for every catalog/network request.
   */
  channelDropByChannel?: Map<string, number | null | undefined>;
};

function unique(values: Array<string | null | undefined>) {
  return [
    ...new Set(values.filter((value): value is string => Boolean(value))),
  ];
}

function jsonArray<T>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : [];
}

function addToMap<T>(map: Map<string, T[]>, key: string, value: T) {
  const current = map.get(key);
  if (current) current.push(value);
  else map.set(key, [value]);
}

@Injectable()
export class TelegramChannelTrafficAttributionService {
  constructor(
    private readonly reads: TelegramChannelTrafficAttributionReadService,
    private readonly support: TelegramChannelsSupportService,
    private readonly currencyConversion: CurrencyConversionService,
    private readonly audienceTrendReads: TelegramChannelAudienceTrendReadService,
  ) {}

  async summariesForChannels(
    workspaceId: string,
    channelIds: string[],
    options?: TrafficAttributionSummaryOptions,
  ): Promise<Map<string, TelegramChannelTrafficAttributionPreview>> {
    const prepared = await this.prepare(workspaceId, channelIds);
    const windowDays = options?.windowDays;
    if (!windowDays || windowDays <= 0) return prepared.previews;
    return this.rollingWindowPreviews(
      workspaceId,
      prepared,
      windowDays,
      options?.now ?? new Date(),
      undefined,
    );
  }

  async detail(
    userId: string,
    channelId: string,
  ): Promise<TelegramChannelTrafficAttributionDetail> {
    const workspaceId = await this.support.workspace(userId);
    if (!(await this.reads.channelExists(workspaceId, channelId)))
      throw new NotFoundException('Telegram channel not found');
    const prepared = await this.prepare(workspaceId, [channelId]);
    const { rows, historyTruncated } = await this.reads.detailSnapshots(
      workspaceId,
      channelId,
    );
    const links = prepared.linksByChannel.get(channelId) ?? [];
    const items = [...(prepared.itemsByChannel.get(channelId) ?? [])];
    const now = new Date();
    let preview =
      prepared.previews.get(channelId) ??
      summarizeTrafficAttribution([], prepared.currency);
    let subscriberMetric: { previous: number; current: number } | null = null;
    {
      const trend = await this.audienceTrendReads.summariesForChannels(
        workspaceId,
        [channelId],
        30,
        now,
      );
      const rolling = await this.rollingWindowPreviews(
        workspaceId,
        prepared,
        30,
        now,
        undefined,
      );
      preview = rolling.get(channelId) ?? preview;
      const metric = trend.get(channelId)?.trend?.metrics.subscribers;
      subscriberMetric = metric
        ? { previous: metric.previous, current: metric.current }
        : null;
    }
    const points = [
      ...buildTrafficAttributionHistoryPoints(
        rows,
        links,
        prepared.linkKinds,
        now,
      ),
      ...unattributedTrafficHistoryPoints(
        channelId,
        subscriberMetric?.previous ?? 0,
        subscriberMetric?.current ?? 0,
        now,
      ),
    ];
    return {
      channelId,
      ...preview,
      items,
      points,
      historyTruncated,
      dataQualityNote:
        'Lost / drop is calculated only from tracked invite-link counters. Other audience shows the channel subscriber count at the start and end of the same 30-day period. Folder totals use saved boundaries; completed mutual promotions stop at the latest counter stored before tracking ended.',
    };
  }

  async detailForChannels(
    workspaceId: string,
    channelIds: string[],
    entityId: string,
    options?: TrafficAttributionSummaryOptions,
  ): Promise<TelegramChannelTrafficAttributionDetail> {
    const ids = unique(channelIds);
    const prepared = await this.prepare(workspaceId, ids);
    const { rows, historyTruncated } =
      await this.reads.detailSnapshotsForChannels(workspaceId, ids);
    const items = ids.flatMap(
      (channelId) => prepared.itemsByChannel.get(channelId) ?? [],
    );
    const links = ids.flatMap(
      (channelId) => prepared.linksByChannel.get(channelId) ?? [],
    );
    const now = options?.now ?? new Date();
    const windowDays = options?.windowDays ?? 30;
    const previews = await this.rollingWindowPreviews(
      workspaceId,
      prepared,
      windowDays,
      now,
      undefined,
    );
    let preview = aggregateTrafficAttributionPreviews(
      [...previews.values()],
      prepared.currency,
      new Date(now.getTime() - windowDays * 24 * 60 * 60 * 1000),
      now,
    );
    return {
      channelId: entityId,
      ...preview,
      items,
      points: [
        ...buildTrafficAttributionHistoryPoints(
          rows,
          links,
          prepared.linkKinds,
          now,
        ),
      ],
      historyTruncated,
      dataQualityNote:
        'Lost / drop is calculated only from tracked invite-link counters. Reused links can make invite-link chart history predate the current source assignment.',
    };
  }

  private async prepare(
    workspaceId: string,
    channelIds: string[],
  ): Promise<PreparedAttribution> {
    const ids = unique(channelIds);
    if (!ids.length) {
      return {
        previews: new Map(),
        itemsByChannel: new Map(),
        linksByChannel: new Map(),
        linkKinds: new Map(),
        currency: 'USD',
      };
    }
    const {
      channels,
      links,
      campaigns,
      participants,
      plans,
      planBoundaryCounters,
      currency,
    } = await this.reads.batch(workspaceId, ids);
    const storedPrimarySpend = (value: unknown) => {
      const amount = Number(value);
      return Number.isFinite(amount) && amount >= 0 ? amount : null;
    };
    let rateSource: Awaited<
      ReturnType<CurrencyConversionService['prepareRateSource']>
    > | null = null;
    const spendInWorkspaceCurrency = async (
      amount: unknown,
      sourceCurrency: unknown,
      legacyPrimaryAmount: unknown,
    ) => {
      const nativeAmount = storedPrimarySpend(amount);
      const nativeCurrency =
        typeof sourceCurrency === 'string' ? sourceCurrency.toUpperCase() : '';
      if (nativeAmount != null && nativeCurrency) {
        if (nativeCurrency === currency.toUpperCase()) return nativeAmount;
        rateSource ??=
          await this.currencyConversion.prepareRateSource(workspaceId);
        const converted = await rateSource.convertCurrency(
          nativeAmount,
          nativeCurrency,
          currency,
        );
        if (converted != null) return converted;
      }
      // Older imported rows can lack a native amount or currency. Preserve
      // their stored value as the only available fallback, but never prefer it
      // when a real placement amount can be expressed in today's workspace
      // currency.
      return storedPrimarySpend(legacyPrimaryAmount);
    };
    const campaignSpendById = new Map(
      await Promise.all(
        campaigns.map(
          async (campaign) =>
            [
              campaign.id,
              await spendInWorkspaceCurrency(
                campaign.price,
                campaign.currency,
                campaign.priceInPrimaryCurrency,
              ),
            ] as const,
        ),
      ),
    );
    const participantSpendById = new Map(
      await Promise.all(
        participants.map(
          async (participant) =>
            [
              participant.id,
              await spendInWorkspaceCurrency(
                participant.expense?.amount,
                participant.expense?.currency,
                participant.expense?.amountInPrimaryCurrency,
              ),
            ] as const,
        ),
      ),
    );
    const channelIdSet = new Set(ids);
    const currentSubscribersByChannel = new Map(
      channels.map((channel) => [
        channel.id,
        channel.currentSubscribersCount ?? null,
      ]),
    );
    const photoByChannel = new Map(
      channels.map((channel) => [channel.id, channel.photoUrl]),
    );
    const linkById = new Map(links.map((link) => [link.id, link]));
    const linksByChannel = new Map<string, TrafficAttributionInviteLinkRow[]>();
    const linksByCampaign = new Map<
      string,
      TrafficAttributionInviteLinkRow[]
    >();
    const planBoundaryByLink = new Map(
      planBoundaryCounters.map((counter) => [
        `${counter.planId}:${counter.inviteLinkId}`,
        counter,
      ]),
    );
    for (const link of links)
      addToMap(linksByChannel, link.telegramChannelId, link);
    for (const link of links) {
      if (link.adCampaignId) addToMap(linksByCampaign, link.adCampaignId, link);
    }
    const itemsByChannel = new Map<
      string,
      TelegramChannelTrafficAttributionItem[]
    >();
    const linkKinds = new Map<string, TelegramChannelTrafficSourceKind>();
    const addItem = (
      channelId: string,
      item: TelegramChannelTrafficAttributionItem,
    ) => {
      addToMap(itemsByChannel, channelId, item);
      for (const linkId of item.inviteLinkIds) {
        if (!linkKinds.has(linkId)) linkKinds.set(linkId, item.kind);
      }
    };
    const claimedByAnotherKind = (
      linkId: string,
      kind: TelegramChannelTrafficSourceKind,
    ) => {
      const claimedKind = linkKinds.get(linkId);
      return claimedKind != null && claimedKind !== kind;
    };

    for (const campaign of campaigns) {
      const campaignLinks = linksByCampaign.get(campaign.id) ?? [];
      const current = campaignLinks.length
        ? campaignLinks.reduce(
            (sum, link) => sum + link.joinedCount + link.requestedCount,
            0,
          )
        : Number(campaign.newSubscribers ?? campaign.joinedCount ?? 0);
      const peak = campaignLinks.length
        ? campaignLinks.reduce(
            (sum, link) =>
              sum +
              Math.max(
                Number(link.peakAttributedCount ?? 0),
                link.joinedCount + link.requestedCount,
              ),
            0,
          )
        : current;
      addItem(
        campaign.telegramChannelId,
        this.item({
          id: `campaign:${campaign.id}`,
          kind: 'AD_CAMPAIGNS',
          title: campaign.title,
          subtitle: campaign.status,
          linkIds: campaignLinks.map((link) => link.id),
          inviteLinks: campaignLinks,
          avatarUrl:
            campaign.advertisingSource?.imageUrl ??
            photoByChannel.get(campaign.telegramChannelId) ??
            null,
          acquired: peak,
          retained: current,
          spend: campaignSpendById.get(campaign.id) ?? null,
          currency,
          startsAt: campaign.startedAt,
          endsAt: campaign.endedAt,
        }),
      );
    }

    for (const participant of participants) {
      if (claimedByAnotherKind(participant.inviteLinkId, 'FOLDERS')) continue;
      const link = linkById.get(participant.inviteLinkId);
      const hasInviteBaseline = participant.inviteJoinedAtStart != null;
      const start =
        Number(participant.inviteJoinedAtStart ?? 0) +
        Number(participant.inviteRequestedAtStart ?? 0);
      const end =
        Number(participant.inviteJoinedAtEnd ?? link?.joinedCount ?? start) +
        Number(participant.inviteRequestedAtEnd ?? link?.requestedCount ?? 0);
      const acquired = hasInviteBaseline ? Math.max(0, end - start) : 0;
      const audienceAtEnd =
        participant.subscribersAtEnd ??
        currentSubscribersByChannel.get(participant.telegramChannelId) ??
        null;
      const audienceDelta =
        participant.role === 'PUBLISHER' &&
        participant.subscribersAtStart != null &&
        audienceAtEnd != null
          ? audienceAtEnd - participant.subscribersAtStart
          : null;
      const retained =
        audienceDelta == null
          ? acquired
          : Math.min(acquired, Math.max(0, audienceDelta));
      addItem(
        participant.telegramChannelId,
        this.item({
          id: `folder:${participant.id}`,
          kind: 'FOLDERS',
          title: participant.folder.title,
          subtitle:
            participant.role === 'PAID' ? 'Paid placement' : 'Publisher',
          linkIds: [participant.inviteLinkId],
          inviteLinks: link ? [link] : [],
          avatarUrl: photoByChannel.get(participant.telegramChannelId) ?? null,
          acquired,
          retained,
          spend: participantSpendById.get(participant.id) ?? null,
          currency,
          startsAt:
            participant.baselineCapturedAt ?? participant.folder.startsAt,
          endsAt: participant.finalCapturedAt ?? participant.folder.endsAt,
        }),
      );
    }

    for (const plan of plans) {
      const targets = jsonArray<CrossPromotionTargetInput>(plan.targets);
      const baselines = jsonArray<{
        inviteLinkId: string;
        joinedCount: number;
        requestedCount: number;
      }>(plan.baselineTargetCounters);
      const baselineByLink = new Map(
        baselines.map((baseline) => [baseline.inviteLinkId, baseline]),
      );
      for (const target of targets) {
        if (!channelIdSet.has(target.telegramChannelId)) continue;
        if (claimedByAnotherKind(target.inviteLinkId, 'MUTUAL_PROMOTION'))
          continue;
        const link = linkById.get(target.inviteLinkId);
        const baseline = baselineByLink.get(target.inviteLinkId);
        const start =
          Number(baseline?.joinedCount ?? 0) +
          Number(baseline?.requestedCount ?? 0);
        const boundary = plan.trackingEndsAt
          ? planBoundaryByLink.get(`${plan.id}:${target.inviteLinkId}`)
          : null;
        const attributedAtEnd = plan.trackingEndsAt
          ? boundary?.joinedCount == null
            ? start
            : Number(boundary.joinedCount) +
              Number(boundary.requestedCount ?? 0)
          : Number(link?.joinedCount ?? 0) + Number(link?.requestedCount ?? 0);
        const acquired = Math.max(0, attributedAtEnd - start);
        addItem(
          target.telegramChannelId,
          this.item({
            id: `mutual:${plan.id}:${target.inviteLinkId}`,
            kind: 'MUTUAL_PROMOTION',
            title: plan.title,
            subtitle: link?.name ?? null,
            linkIds: [target.inviteLinkId],
            inviteLinks: link ? [link] : [],
            avatarUrl: photoByChannel.get(target.telegramChannelId) ?? null,
            acquired,
            retained: acquired,
            spend: null,
            currency,
            startsAt: plan.scheduledAt,
            endsAt: plan.trackingEndsAt,
          }),
        );
      }
    }

    for (const channel of channels as TrafficAttributionChannelSettings[]) {
      const roleIds: Array<
        [TelegramChannelTrafficSourceKind, Array<string | null>]
      > = [
        ['AUDIENCE_TRANSFER', [channel.audienceTransferInviteLinkId]],
        ['BOT', [channel.botInviteLinkId]],
        ['BROADCAST', [channel.broadcastInviteLinkId]],
        ['MUTUAL_PROMOTION', channel.mutualPromotionInviteLinkIds],
        ['FOLDERS', channel.folderDefaultInviteLinkIds],
      ];
      for (const [kind, roleLinkIds] of roleIds) {
        for (const linkId of unique(roleLinkIds)) {
          if (linkKinds.has(linkId)) continue;
          const link = linkById.get(linkId);
          if (!link) continue;
          addItem(
            channel.id,
            this.linkItem(
              link,
              kind,
              currency,
              photoByChannel.get(channel.id) ?? null,
            ),
          );
        }
      }
      for (const link of linksByChannel.get(channel.id) ?? []) {
        if (linkKinds.has(link.id)) continue;
        addItem(
          channel.id,
          this.linkItem(
            link,
            'OTHER',
            currency,
            photoByChannel.get(channel.id) ?? null,
          ),
        );
      }
    }

    const previews = new Map(
      channels.map((channel) => [
        channel.id,
        summarizeTrafficAttribution(
          itemsByChannel.get(channel.id) ?? [],
          currency,
        ),
      ]),
    );
    return {
      previews,
      itemsByChannel,
      linksByChannel,
      linkKinds,
      currency,
    };
  }

  private async rollingWindowPreviews(
    workspaceId: string,
    prepared: PreparedAttribution,
    windowDays: number,
    now: Date,
    _channelDropByChannel?: Map<string, number | null | undefined>,
  ) {
    const from = new Date(now);
    from.setUTCDate(from.getUTCDate() - windowDays);
    const linksById = new Map(
      [...prepared.linksByChannel.values()]
        .flat()
        .map((link) => [link.id, link]),
    );
    const snapshots = await this.reads.snapshotsForRollingWindow(
      workspaceId,
      [...linksById.keys()],
      from,
      now,
    );
    const snapshotsByLink = new Map<string, typeof snapshots>();
    for (const snapshot of snapshots)
      addToMap(snapshotsByLink, snapshot.inviteLinkId, snapshot);
    const startsAt = from.toISOString();
    const endsAt = now.toISOString();
    return new Map(
      [...prepared.previews.keys()].map((channelId) => {
        const items = prepared.itemsByChannel.get(channelId) ?? [];
        const windowItems: TelegramChannelTrafficAttributionItem[] =
          items.flatMap((item) => {
            const linkMetrics = item.inviteLinkIds
              .map((inviteLinkId) => {
                const rows = snapshotsByLink.get(inviteLinkId) ?? [];
                const baseline = rows
                  .filter((row) => row.syncedAt < from)
                  .at(-1);
                const currentLink = linksById.get(inviteLinkId);
                const values = [
                  ...rows
                    .filter((row) => row.syncedAt >= from)
                    .map((row) => row.joinedCount + row.requestedCount),
                  ...(currentLink
                    ? [currentLink.joinedCount + currentLink.requestedCount]
                    : []),
                ];
                if (!values.length) return null;
                const baselineValue = baseline
                  ? baseline.joinedCount + baseline.requestedCount
                  : 0;
                const acquired = Math.max(
                  0,
                  Math.max(...values) - baselineValue,
                );
                const retained = Math.min(
                  acquired,
                  Math.max(0, values.at(-1)! - baselineValue),
                );
                return { acquired, retained };
              })
              .filter(
                (value): value is { acquired: number; retained: number } =>
                  value != null,
              );
            if (!linkMetrics.length) return [];
            const startsWithinWindow =
              item.startsAt != null && new Date(item.startsAt) >= from;
            const acquired = linkMetrics.reduce(
              (sum, metric) => sum + metric.acquired,
              0,
            );
            const retained = linkMetrics.reduce(
              (sum, metric) => sum + metric.retained,
              0,
            );
            return [
              {
                ...item,
                startsAt,
                endsAt,
                acquired,
                retained,
                unsubscribed: Math.max(0, acquired - retained),
                spend: startsWithinWindow ? item.spend : null,
              },
            ];
          });
        const windowPreview = summarizeTrafficAttribution(
          windowItems,
          prepared.currency,
        );
        // Acquisition/drop are a rolling 30-day pulse. CPA must not move just
        // because the reporting window moved, so retain its all-time paid base.
        return [
          channelId,
          {
            ...windowPreview,
            allTimePaid:
              prepared.previews.get(channelId)?.allTimePaid ??
              windowPreview.allTimePaid,
          },
        ];
      }),
    );
  }

  private linkItem(
    link: TrafficAttributionInviteLinkRow,
    kind: TelegramChannelTrafficSourceKind,
    currency: string,
    avatarUrl: string | null,
  ) {
    const retained = link.joinedCount + link.requestedCount;
    return this.item({
      id: `link:${link.id}`,
      kind,
      title: link.name,
      subtitle: link.url,
      linkIds: [link.id],
      inviteLinks: [link],
      avatarUrl,
      acquired: Math.max(retained, Number(link.peakAttributedCount ?? 0)),
      retained,
      spend: null,
      currency,
      startsAt: link.createdAt,
      endsAt: null,
    });
  }

  private unattributedChurnItem(
    channelId: string,
    unsubscribed: number,
    at: Date,
    currency: string,
  ) {
    return this.item({
      id: `unattributed:${channelId}:${at.toISOString()}`,
      kind: 'UNATTRIBUTED',
      title: 'Other',
      subtitle: 'Unsubscribed without a tracked invite link',
      linkIds: [],
      inviteLinks: [],
      avatarUrl: null,
      acquired: 0,
      retained: 0,
      unsubscribed,
      spend: null,
      currency,
      startsAt: at,
      endsAt: at,
    });
  }

  private item(input: {
    id: string;
    kind: TelegramChannelTrafficSourceKind;
    title: string;
    subtitle: string | null;
    linkIds: string[];
    inviteLinks: TrafficAttributionInviteLinkRow[];
    avatarUrl: string | null;
    acquired: number;
    retained: number;
    unsubscribed?: number;
    spend: number | null;
    currency: string;
    startsAt: Date | null;
    endsAt: Date | null;
  }): TelegramChannelTrafficAttributionItem {
    return {
      id: input.id,
      kind: input.kind,
      title: input.title,
      subtitle: input.subtitle,
      avatarUrl: input.avatarUrl,
      inviteLinkIds: input.linkIds,
      inviteLinks: input.inviteLinks.map((link) => ({
        id: link.id,
        name: link.name,
        url: link.url,
      })),
      startsAt: input.startsAt?.toISOString() ?? null,
      endsAt: input.endsAt?.toISOString() ?? null,
      ...trafficAttributionMetrics(input),
    };
  }
}
