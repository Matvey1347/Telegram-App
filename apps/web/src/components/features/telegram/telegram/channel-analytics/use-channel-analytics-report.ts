"use client";

import {
  hasRenderableTelegramGraphItem,
  mtprotoGraphConfigs,
  normalizeStoredTelegramGraph,
  normalizeTelegramGraph,
} from "@/components/features/telegram/telegram/telegram-channel-graphs";
import { useMemo } from "react";
import { type TelegramChannel } from "@/lib/api";
import {
  toNumber,
  adjustedPostViews,
  adjustedPostReactions,
  formatNumber,
  formatNullableNumber,
  formatPercent,
  hasNumericValue,
  hasPositiveValue,
  channelMetricTips,
} from "./channel-analytics-format";
import type { useChannelAnalyticsQueries } from "./use-channel-analytics-queries";

type ReportQueries = Pick<
  ReturnType<typeof useChannelAnalyticsQueries>,
  | "postsData"
  | "inviteLinksData"
  | "campaignsData"
  | "data"
  | "channel"
  | "isLoading"
  | "isChannelLoading"
  | "audience"
  | "isAudienceLoading"
  | "financialSummary"
  | "isFinancialSummaryLoading"
  | "audienceSnapshots"
  | "settings"
>;
export function useChannelAnalyticsReport(id: string, queries: ReportQueries) {
  const {
    postsData,
    inviteLinksData,
    campaignsData,
    data,
    channel,
    isLoading,
    isChannelLoading,
    audience,
    isAudienceLoading,
    financialSummary,
    isFinancialSummaryLoading,
    audienceSnapshots,
    settings,
  } = queries;
  const posts = useMemo(() => postsData?.items || [], [postsData?.items]);
  const visiblePosts = useMemo(
    () =>
      posts.filter(
        (post) =>
          String(post?.text || "").trim().length > 0 ||
          (post && "hasMedia" in post && Boolean(post.hasMedia)),
      ),
    [posts],
  );
  const inviteLinks = useMemo(
    () => inviteLinksData?.items || [],
    [inviteLinksData?.items],
  );
  const campaigns = useMemo(
    () => campaignsData?.items || [],
    [campaignsData?.items],
  );
  const latestSnapshot = data?.channelStatsSnapshot as
    | ({ syncedAt?: string; normalizedStats?: unknown } & Record<string, unknown>)
    | null
    | undefined;
  const mtprotoStats = latestSnapshot?.normalizedStats as
    | {
        graphs?: Record<string, unknown>;
        followers?: { current?: number | null };
      }
    | undefined;
  const mtprotoGraphs = useMemo(
    () =>
      mtprotoGraphConfigs
        .map((config) => {
          const chart =
            normalizeStoredTelegramGraph(
              data?.channelStatsPoints,
              config.key,
            ) || normalizeTelegramGraph(mtprotoStats?.graphs?.[config.key]);
          return {
            ...config,
            chart,
          };
        })
        .filter(hasRenderableTelegramGraphItem),
    [data?.channelStatsPoints, mtprotoStats],
  );
  const activeChannel = (channel || data?.channel) as
    | TelegramChannel
    | undefined;
  const isInitialPageLoading =
    (!data && isLoading) || (!activeChannel && isChannelLoading);
  const showAudiencePanelSkeleton = !audience && isAudienceLoading;
  const showFinancialPanelSkeleton =
    !financialSummary && isFinancialSummaryLoading;
  const ownViewsPerPost = Math.max(
    0,
    toNumber(activeChannel?.ownViewsPerPost ?? settings.ownViewsPerPost),
  );
  const ownReactionsPerPost = Math.max(
    0,
    toNumber(
      activeChannel?.ownReactionsPerPost ?? settings.ownReactionsPerPost,
    ),
  );

  const computed = useMemo(() => {
    const analyticsPosts = posts.filter(
      (post) => !post.excludeFromAnalytics,
    );
    const summaryPostsTotal = toNumber(data?.summary?.postsTotal);
    const telegramPostsStoredTotal = toNumber(
      data?.summary?.telegramPostsStoredTotal,
    );
    const summaryViewsTotal = toNumber(data?.summary?.viewsTotal);
    const summaryForwardsTotal = toNumber(data?.summary?.forwardsTotal);
    const summaryReactionsTotal = toNumber(data?.summary?.reactionsTotal);
    const summaryCommentsTotal = toNumber(data?.summary?.commentsTotal);
    const summaryInviteLinksCount = toNumber(data?.summary?.inviteLinksCount);
    const summaryCampaignsCount = toNumber(data?.summary?.campaignsCount);
    const summaryJoinedHistoricalByLinks = toNumber(
      data?.summary?.joinedHistoricalByLinks,
    );
    const summaryRequestedJoinsTotal = toNumber(
      data?.summary?.requestedJoinsTotal,
    );
    const hasLoadedPostMetrics = analyticsPosts.length > 0;
    const viewsTotal = hasLoadedPostMetrics
      ? analyticsPosts.reduce(
          (sum: number, post) => sum + toNumber(post.viewsCount),
          0,
        )
      : summaryViewsTotal;
    const forwardsTotal = hasLoadedPostMetrics
      ? analyticsPosts.reduce(
          (sum: number, post) => sum + toNumber(post.forwardsCount),
          0,
        )
      : summaryForwardsTotal;
    const reactionsTotal = hasLoadedPostMetrics
      ? analyticsPosts.reduce(
          (sum: number, post) => sum + toNumber(post.reactionsCount),
          0,
        )
      : summaryReactionsTotal;
    const adjustedViewsTotal = hasLoadedPostMetrics
      ? analyticsPosts.reduce(
          (sum: number, post) =>
            sum + adjustedPostViews(post, ownViewsPerPost),
          0,
        )
      : summaryViewsTotal;
    const adjustedReactionsTotal = hasLoadedPostMetrics
      ? analyticsPosts.reduce(
          (sum: number, post) =>
            sum + adjustedPostReactions(post, ownReactionsPerPost),
          0,
        )
      : summaryReactionsTotal;
    const commentsTotal = hasLoadedPostMetrics
      ? analyticsPosts.reduce(
          (sum: number, post) => sum + toNumber(post.commentsCount),
          0,
        )
      : summaryCommentsTotal;
    const viewedPosts = analyticsPosts.filter(
      (post) => adjustedPostViews(post, ownViewsPerPost) > 0,
    );
    const eligiblePosts = analyticsPosts.filter((post) => {
      const ageMs = Date.now() - new Date(post.postDate).getTime();
      return (
        ageMs >= 24 * 3600 * 1000 &&
        ageMs <= 30 * 24 * 3600 * 1000 &&
        adjustedPostViews(post, ownViewsPerPost) > 0
      );
    });
    const subscribers =
      toNumber(data?.channel?.currentSubscribersCount) ||
      toNumber(mtprotoStats?.followers?.current) ||
      toNumber(data?.summary?.subscribersCurrent);
    const effectivePostsCount = hasLoadedPostMetrics
      ? analyticsPosts.length
      : summaryPostsTotal;
    const averagePostViews = viewedPosts.length
      ? adjustedViewsTotal / viewedPosts.length
      : effectivePostsCount > 0
        ? adjustedViewsTotal / effectivePostsCount
        : null;
    const averageEligibleViews = eligiblePosts.length
      ? eligiblePosts.reduce(
          (sum: number, post) =>
            sum + adjustedPostViews(post, ownViewsPerPost),
          0,
        ) / eligiblePosts.length
      : null;
    const err =
      subscribers > 0 && averageEligibleViews != null
        ? (averageEligibleViews / subscribers) * 100
        : null;
    const reactionRate =
      adjustedViewsTotal > 0
        ? (adjustedReactionsTotal / adjustedViewsTotal) * 100
        : null;
    const forwardRate =
      viewsTotal > 0 ? (forwardsTotal / viewsTotal) * 100 : null;
    const joinedFromLinks = inviteLinks.length
      ? inviteLinks.reduce(
          (sum: number, link) =>
            sum + toNumber(link.joinedCount) + toNumber(link.requestedCount),
          0,
        )
      : summaryJoinedHistoricalByLinks + summaryRequestedJoinsTotal;
    const adSpend = campaigns.length
      ? campaigns.reduce(
          (sum: number, campaign) =>
            sum + toNumber(campaign.costAmount ?? campaign.price),
          0,
        )
      : toNumber(data?.summary?.totalAdSpend);
    const cpa = joinedFromLinks > 0 ? adSpend / joinedFromLinks : null;

    return {
      subscribers,
      postsCount: telegramPostsStoredTotal,
      viewsTotal,
      adjustedViewsTotal,
      forwardsTotal,
      reactionsTotal,
      adjustedReactionsTotal,
      commentsTotal,
      averagePostViews,
      averageEligibleViews,
      err,
      reactionRate,
      forwardRate,
      joinedFromLinks,
      adSpend,
      cpa,
      inviteLinksCount: inviteLinks.length || summaryInviteLinksCount,
      campaignsCount: campaigns.length || summaryCampaignsCount,
      ownReactionsPerPost,
      ownViewsPerPost,
      analyticsPostsCount: analyticsPosts.length || summaryPostsTotal,
      eligiblePostsCount: eligiblePosts.length,
    };
  }, [
    campaigns,
    data?.channel?.currentSubscribersCount,
    data?.summary?.campaignsCount,
    data?.summary?.commentsTotal,
    data?.summary?.forwardsTotal,
    data?.summary?.inviteLinksCount,
    data?.summary?.joinedHistoricalByLinks,
    data?.summary?.postsTotal,
    data?.summary?.telegramPostsStoredTotal,
    data?.summary?.reactionsTotal,
    data?.summary?.requestedJoinsTotal,
    data?.summary?.subscribersCurrent,
    data?.summary?.totalAdSpend,
    data?.summary?.viewsTotal,
    inviteLinks,
    mtprotoStats?.followers?.current,
    ownReactionsPerPost,
    ownViewsPerPost,
    posts,
  ]);
  const statCards = [
    {
      key: "subscribers",
      show: hasPositiveValue(computed.subscribers),
      title: "Subscribers",
      value: formatNumber(computed.subscribers),
      hint: "Latest channel value",
    },
    {
      key: "posts",
      show: true,
      title: "Telegram posts",
      value: formatNumber(computed.postsCount),
      hint: "Stored from Telegram",
    },
    {
      key: "views",
      show: hasPositiveValue(computed.viewsTotal),
      title: "Total Views",
      value: formatNumber(computed.viewsTotal),
      hint: "Sum from post metrics",
    },
    {
      key: "avgViews",
      show: hasNumericValue(computed.averagePostViews),
      title: "Average Views",
      value: formatNullableNumber(computed.averagePostViews),
      hint: "Posts with views > 0",
    },
    {
      key: "err",
      show: hasNumericValue(computed.err),
      title: "ERR",
      value: formatPercent(computed.err, 2),
      hint: `Eligible posts: ${computed.eligiblePostsCount}`,
      tip: channelMetricTips.err,
    },
    {
      key: "reactions",
      show: hasPositiveValue(computed.adjustedReactionsTotal),
      title: "Reactions",
      value: formatNumber(computed.adjustedReactionsTotal),
      hint: `Rate: ${formatPercent(computed.reactionRate, 2)}`,
      tip: channelMetricTips.reactions,
    },
    {
      key: "forwards",
      show: hasPositiveValue(computed.forwardsTotal),
      title: "Forwards",
      value: formatNumber(computed.forwardsTotal),
      hint: `Rate: ${formatPercent(computed.forwardRate, 2)}`,
    },
    {
      key: "joined",
      show: hasPositiveValue(computed.joinedFromLinks),
      title: "Joined From Links",
      value: formatNumber(computed.joinedFromLinks),
      hint: "Invite-link usage",
    },
    {
      key: "cpa",
      show: hasNumericValue(financialSummary?.avgCpa ?? computed.cpa),
      title: "Campaign CPA",
      value: `${formatNumber(financialSummary?.avgCpa ?? computed.cpa, 2)} ${financialSummary?.currency || activeChannel?.kpiCurrency || "USD"}`,
      hint: "Spend / joined from links",
      tip: channelMetricTips.cpa,
    },
    {
      key: "comments",
      show: hasPositiveValue(computed.commentsTotal),
      title: "Comments",
      value: formatNumber(computed.commentsTotal),
      hint: "Post comments",
    },
    {
      key: "inviteLinks",
      show: computed.inviteLinksCount > 0,
      title: "Invite Links",
      value: formatNumber(computed.inviteLinksCount),
      hint: "Imported invite links",
    },
    {
      key: "campaigns",
      show: computed.campaignsCount > 0,
      title: "Campaigns",
      value: formatNumber(computed.campaignsCount),
      hint: "Attributed campaign rows",
    },
  ].filter((card) => card.show);

  const topInviteLinks = useMemo(
    () =>
      [...inviteLinks].sort(
        (a, b) =>
          toNumber(b.joinedCount) +
          toNumber(b.requestedCount) -
          toNumber(a.joinedCount) -
          toNumber(a.requestedCount),
      ),
    [inviteLinks],
  );
  const campaignRows = useMemo(
    () =>
      campaigns.filter((campaign) => {
        const linkedChannelId =
          campaign.telegramChannelId ||
          campaign.ownTelegramChannelId ||
          campaign.telegramChannel?.id;
        return !linkedChannelId || linkedChannelId === id;
      }),
    [campaigns, id],
  );
  const hasAudienceChart = audienceSnapshots.some(
    (snapshot) =>
      snapshot.subscribersCount != null ||
      snapshot.activeSubscribersEstimate != null,
  );

  return {
    activeChannel,
    computed,
    visiblePosts,
    latestSnapshot,
    mtprotoStats,
    mtprotoGraphs,
    isInitialPageLoading,
    showAudiencePanelSkeleton,
    showFinancialPanelSkeleton,
    ownViewsPerPost,
    ownReactionsPerPost,
    statCards,
    topInviteLinks,
    campaignRows,
    hasAudienceChart,
  };
}
