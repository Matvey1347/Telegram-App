import {
  effectiveCampaignAttributedSubscribers,
  effectiveCampaignJoinedSubscribers,
  effectiveCampaignPendingSubscribers,
} from '../../../common/analytics/channel-financial-summary';
import { iconToResolvedEmoji } from '../../../common/icons/resolved-emoji';
import { withWorkspaceMemberAvatar } from '../../../common/workspace-member-presentation';

type KpiStatus = 'good' | 'acceptable' | 'bad' | 'unknown';

function decimal(value: unknown) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function nullableNumber(value: unknown) {
  if (value == null) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function inRange(value: number, from: number | null, to: number | null) {
  if (from == null && to == null) return false;
  if (from != null && value < from) return false;
  if (to != null && value > to) return false;
  return true;
}

function average(values: Array<number | null | undefined>) {
  const clean = values.filter((value): value is number => value != null);
  return clean.length
    ? clean.reduce((sum, value) => sum + value, 0) / clean.length
    : null;
}

function campaignJoined(campaign: any) {
  return decimal(
    effectiveCampaignJoinedSubscribers({
      inviteLinks: Array.isArray(campaign.inviteLinks)
        ? campaign.inviteLinks
        : [],
      joinedCount:
        nullableNumber(campaign.analytics?.joinedCount) ?? campaign.joinedCount,
      newSubscribers: campaign.newSubscribers,
    }),
  );
}

function campaignPending(campaign: any) {
  return decimal(
    effectiveCampaignPendingSubscribers({
      inviteLinks: Array.isArray(campaign.inviteLinks)
        ? campaign.inviteLinks
        : [],
      requestedCount:
        nullableNumber(campaign.analytics?.requestedCount) ??
        campaign.requestedCount,
    }),
  );
}

function campaignAttributed(campaign: any) {
  return decimal(
    effectiveCampaignAttributedSubscribers({
      inviteLinks: Array.isArray(campaign.inviteLinks)
        ? campaign.inviteLinks
        : [],
      joinedCount:
        nullableNumber(campaign.analytics?.joinedCount) ?? campaign.joinedCount,
      requestedCount:
        nullableNumber(campaign.analytics?.requestedCount) ??
        campaign.requestedCount,
      newSubscribers: campaign.newSubscribers,
    }),
  );
}

function campaignLeft(campaign: any) {
  const analyticsLeft = nullableNumber(campaign.analytics?.leftCount);
  return nullableNumber(analyticsLeft ?? campaign.leftCount);
}

function sourceLabel(campaign: any) {
  const telegramSources = (campaign.advertisingTelegramChannels || [])
    .map(
      (link: any) =>
        link.telegramChannel?.title || link.telegramChannel?.username,
    )
    .filter(Boolean);
  const peopleSources = (campaign.advertisingChannels || [])
    .map((link: any) => link.advertisingSource?.name)
    .filter(Boolean);
  return [...telegramSources, ...peopleSources].join(', ') || null;
}

function campaignKpiStatus(campaign: any, cpa: number | null): KpiStatus {
  const channel = campaign.telegramChannel;
  if (!channel || cpa == null) return 'unknown';
  const targetFrom = nullableNumber(channel.targetCpaFrom);
  const target = nullableNumber(channel.targetCpa);
  const acceptableFrom = nullableNumber(channel.acceptableCpaFrom);
  const acceptable = nullableNumber(channel.acceptableCpa);
  const stopFrom =
    nullableNumber(channel.stopCpaFrom) ?? nullableNumber(channel.stopCpa);
  if (
    targetFrom == null &&
    target == null &&
    acceptableFrom == null &&
    acceptable == null &&
    stopFrom == null
  )
    return 'unknown';
  if (inRange(cpa, targetFrom, target)) return 'good';
  if (inRange(cpa, acceptableFrom, acceptable)) return 'acceptable';
  if (inRange(cpa, stopFrom, null)) return 'bad';
  return 'unknown';
}

function aggregateKpiStatus(statuses: KpiStatus[]): KpiStatus {
  const known = statuses.filter((status) => status !== 'unknown');
  if (!known.length) return 'unknown';
  const counts = known.reduce(
    (acc, status) => ({ ...acc, [status]: acc[status] + 1 }),
    { good: 0, acceptable: 0, bad: 0 },
  );
  if (counts.bad > known.length / 2) return 'bad';
  if (counts.good > known.length / 2) return 'good';
  return 'acceptable';
}

function hypothesisKpiStatus(
  campaignSummaries: ReturnType<typeof campaignSummary>[],
  avgCpa: number | null,
  hypothesisChannel?: any,
) {
  if (hypothesisChannel?.id && avgCpa != null) {
    return campaignKpiStatus({ telegramChannel: hypothesisChannel }, avgCpa);
  }

  const channels = campaignSummaries
    .map((campaign) => campaign.targetChannel)
    .filter(
      (
        channel,
      ): channel is NonNullable<
        (typeof campaignSummaries)[number]['targetChannel']
      > => Boolean(channel?.id),
    );
  const uniqueChannelIds = [...new Set(channels.map((channel) => channel.id))];

  if (uniqueChannelIds.length === 1 && avgCpa != null) {
    return campaignKpiStatus({ telegramChannel: channels[0] }, avgCpa);
  }

  return aggregateKpiStatus(
    campaignSummaries.map((campaign) => campaign.kpiStatus),
  );
}

function resolveEffectiveKpiStatus(
  storedStatus: unknown,
  calculatedStatus: KpiStatus,
) {
  return calculatedStatus !== 'unknown'
    ? calculatedStatus
    : storedStatus && storedStatus !== 'unknown'
      ? (storedStatus as KpiStatus)
      : 'unknown';
}

function decision(status: KpiStatus) {
  if (status === 'good') {
    return 'Hypothesis performs well. Candidate for repeat and scaling.';
  }
  if (status === 'acceptable') {
    return 'Hypothesis is acceptable. Continue testing with tighter control.';
  }
  if (status === 'bad') {
    return 'Hypothesis is weak. Do not scale before changing source, offer or creative.';
  }
  return 'Not enough data yet.';
}

export function campaignSummary(campaign: any) {
  const spend = decimal(campaign.priceInPrimaryCurrency);
  const nativeSpend = decimal(campaign.price ?? campaign.costAmount);
  const joinedSubscribers = campaignJoined(campaign);
  const pendingSubscribers = campaignPending(campaign);
  const attributedSubscribers = joinedSubscribers + pendingSubscribers;
  const leftSubscribers = campaignLeft(campaign);
  const cpa = attributedSubscribers > 0 ? spend / attributedSubscribers : null;
  const nativeCpa =
    attributedSubscribers > 0 ? nativeSpend / attributedSubscribers : null;
  const views = nullableNumber(campaign.sourcePostViews);
  const reactions = null;
  const engagementRate =
    views && reactions ? (Number(reactions) / Number(views)) * 100 : null;
  const kpiStatus = campaignKpiStatus(campaign, nativeCpa);
  const effectiveKpiStatus = resolveEffectiveKpiStatus(
    campaign.overallStatus,
    kpiStatus,
  );
  return {
    id: campaign.id,
    campaignId: campaign.id,
    title: campaign.title,
    status: campaign.status,
    currency: campaign.currency,
    spend,
    nativeSpend,
    joinedSubscribers,
    pendingSubscribers,
    attributedSubscribers,
    leftSubscribers,
    cpa,
    views,
    reactions,
    engagementRate,
    activeSubscribersEstimate: nullableNumber(campaign.activeSubscribersFromAd),
    activeCpa: nullableNumber(campaign.activeCpa),
    activeRate: nullableNumber(campaign.activeRate),
    retention7d: nullableNumber(campaign.retention7d),
    overallStatus: campaign.overallStatus || 'unknown',
    analyticsLastCalculatedAt: campaign.analyticsLastCalculatedAt,
    targetChannel: campaign.telegramChannel
      ? {
          id: campaign.telegramChannel.id,
          title: campaign.telegramChannel.title,
          username: campaign.telegramChannel.username,
          photoUrl: campaign.telegramChannel.photoUrl,
        }
      : null,
    source: sourceLabel(campaign),
    sourcePostUrl: campaign.sourcePostUrl,
    kpiStatus: effectiveKpiStatus,
    excludeFromAnalytics: Boolean(campaign.excludeFromAnalytics),
  };
}

export function aggregateSummary(
  campaignSummaries: ReturnType<typeof campaignSummary>[],
  hypothesisChannel?: any,
) {
  const totalSpend = campaignSummaries.reduce(
    (sum, campaign) => sum + campaign.spend,
    0,
  );
  const spendByCurrency = new Map<
    string,
    { nativeSpend: number; primarySpend: number }
  >();
  for (const campaign of campaignSummaries) {
    const currency = String(campaign.currency || '')
      .trim()
      .toUpperCase();
    if (!currency) continue;
    const current = spendByCurrency.get(currency) ?? {
      nativeSpend: 0,
      primarySpend: 0,
    };
    current.nativeSpend += Number(campaign.nativeSpend || 0);
    current.primarySpend += Number(campaign.spend || 0);
    spendByCurrency.set(currency, current);
  }
  const dominantSpend = [...spendByCurrency.entries()].sort(
    ([leftCurrency, left], [rightCurrency, right]) =>
      Math.abs(right.primarySpend) - Math.abs(left.primarySpend) ||
      leftCurrency.localeCompare(rightCurrency),
  )[0];
  const displayCurrency = dominantSpend?.[0] ?? null;
  const totalSpendDisplay = dominantSpend?.[1].nativeSpend ?? null;
  const totalJoinedSubscribers = campaignSummaries.reduce(
    (sum, campaign) => sum + campaign.joinedSubscribers,
    0,
  );
  const totalPendingSubscribers = campaignSummaries.reduce(
    (sum, campaign) => sum + campaign.pendingSubscribers,
    0,
  );
  const totalAttributedSubscribers = campaignSummaries.reduce(
    (sum, campaign) => sum + campaign.attributedSubscribers,
    0,
  );
  const totalViews = campaignSummaries.reduce(
    (sum, campaign) => sum + Number(campaign.views || 0),
    0,
  );
  const activeSubscribersEstimate = campaignSummaries.reduce(
    (sum, campaign) => sum + Number(campaign.activeSubscribersEstimate || 0),
    0,
  );
  const reactionsWithData = campaignSummaries
    .map((campaign) => campaign.reactions)
    .filter((value) => value != null);
  const totalReactions = reactionsWithData.length
    ? reactionsWithData.reduce((sum, value) => sum + Number(value || 0), 0)
    : null;
  const bestCampaign =
    campaignSummaries
      .filter((campaign) => campaign.cpa != null)
      .sort((a, b) => Number(a.cpa) - Number(b.cpa))[0] || null;
  const worstCampaign =
    campaignSummaries
      .filter((campaign) => campaign.cpa != null)
      .sort((a, b) => Number(b.cpa) - Number(a.cpa))[0] || null;
  const avgCpa =
    totalAttributedSubscribers > 0
      ? totalSpend / totalAttributedSubscribers
      : null;
  const avgCpaDisplay =
    totalAttributedSubscribers > 0 && totalSpendDisplay != null
      ? totalSpendDisplay / totalAttributedSubscribers
      : null;
  const kpiStatus = hypothesisKpiStatus(
    campaignSummaries,
    avgCpaDisplay ?? avgCpa,
    hypothesisChannel,
  );
  return {
    campaignsCount: campaignSummaries.length,
    totalSpend,
    displayCurrency,
    totalSpendDisplay,
    totalJoinedSubscribers,
    totalPendingSubscribers,
    totalAttributedSubscribers,
    avgCpa,
    avgCpaDisplay,
    activeSubscribersEstimate,
    activeCpa:
      activeSubscribersEstimate > 0
        ? totalSpend / activeSubscribersEstimate
        : null,
    avgActiveRate: average(
      campaignSummaries.map((campaign) => campaign.activeRate),
    ),
    avgRetention7d: average(
      campaignSummaries.map((campaign) => campaign.retention7d),
    ),
    totalViews: totalViews || null,
    totalReactions,
    engagementRate:
      totalViews > 0 && totalReactions != null
        ? (totalReactions / totalViews) * 100
        : null,
    bestCampaign,
    worstCampaign,
    kpiStatus,
    decision: decision(kpiStatus),
  };
}

export function enrichHypothesis(hypothesis: any, detailed = false) {
  const campaignRows = (hypothesis.campaigns || []).map((link: any) => ({
    ...link.adCampaign,
    promos: Array.isArray(link.adCampaign?.promos)
      ? link.adCampaign.promos
          .map((promoLink: any) => promoLink?.promo)
          .filter(Boolean)
      : [],
  }));
  const campaignSummaries = campaignRows.map((campaign: any) =>
    campaignSummary(campaign),
  );
  const summary = aggregateSummary(
    campaignSummaries,
    hypothesis.telegramChannel,
  );
  const base = {
    id: hypothesis.id,
    name: hypothesis.name,
    description: hypothesis.description,
    status: hypothesis.status,
    conclusion: hypothesis.conclusion,
    iconId: hypothesis.iconId,
    icon: hypothesis.icon ?? null,
    iconPresentation: iconToResolvedEmoji(hypothesis.icon),
    telegramChannelId: hypothesis.telegramChannelId ?? null,
    telegramChannel: hypothesis.telegramChannel ?? null,
    createdAt: hypothesis.createdAt,
    updatedAt: hypothesis.updatedAt,
    assignedMemberId: hypothesis.assignedMemberId,
    assignedMember: withWorkspaceMemberAvatar(hypothesis.assignedMember),
    createdByUserId: hypothesis.createdByUserId,
    createdByUser: hypothesis.createdByUser,
    allCampaignsExcludedFromAnalytics:
      campaignRows.length > 0 &&
      campaignRows.every((campaign: any) =>
        Boolean(campaign.excludeFromAnalytics),
      ),
    excludedCampaignsCount: campaignRows.filter((campaign: any) =>
      Boolean(campaign.excludeFromAnalytics),
    ).length,
    campaignsCount: summary.campaignsCount,
    summary,
  };
  if (!detailed) return base;
  return {
    ...base,
    campaigns: campaignRows,
    campaignSummaries,
  };
}
