"use client";

import { useEffect, useMemo, useState } from "react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import {
  DEFAULT_CHANNEL_SYNC_SELECTION,
  syncSelectionFromChannel,
} from "@/components/features/telegram/telegram/channel-sync-scope-modal";
import {
  adCampaignsApi,
  currenciesApi,
  getTelegramChannelAnalytics,
  getTelegramChannelInviteLinks,
  getTelegramChannelPosts,
  telegramChannelsApi,
  type ResolvedEmoji,
  type TelegramChannelSyncSelection,
} from "@/lib/api";
import { usePagination } from "@/hooks/use-pagination";
import {
  currencyKeys,
  telegramChannelKeys,
  telegramPostKeys,
} from "@/lib/query-keys";
import { formatLocalDate, toNumber } from "./channel-analytics-format";

export type SettingsState = {
  knownFakeSubscribersCount: string;
  ownViewsPerPost: string;
  ownReactionsPerPost: string;
  kpiCurrency: string;
  targetCpaFrom: string;
  targetCpa: string;
  acceptableCpaFrom: string;
  acceptableCpa: string;
  stopCpaFrom: string;
  stopCpa: string;
  timePosts: Array<{
    id: string;
    title: string;
    time: string;
    iconId?: string | null;
    iconPresentation?: ResolvedEmoji | null;
  }>;
};

type ChannelSectionState = {
  charts: boolean;
  posts: boolean;
  inviteLinks: boolean;
  campaigns: boolean;
};

const closedChannelSections: ChannelSectionState = {
  charts: false,
  posts: false,
  inviteLinks: false,
  campaigns: false,
};

function channelSectionsStorageKey(channelId: string) {
  return `telegram-channel:${channelId}:open-sections`;
}

function readStoredChannelSections(channelId: string): ChannelSectionState {
  if (typeof window === "undefined") return closedChannelSections;
  try {
    const raw = window.localStorage.getItem(
      channelSectionsStorageKey(channelId),
    );
    if (!raw) return closedChannelSections;
    const parsed = JSON.parse(raw) as Partial<ChannelSectionState>;
    return {
      charts: Boolean(parsed.charts),
      posts: Boolean(parsed.posts),
      inviteLinks: Boolean(parsed.inviteLinks),
      campaigns: Boolean(parsed.campaigns),
    };
  } catch {
    return closedChannelSections;
  }
}

export function useChannelAnalyticsQueries(id: string) {
  const [todayIso] = useState(() => formatLocalDate(new Date()));
  const [thirtyDaysAgoIso] = useState(() =>
    formatLocalDate(new Date(Date.now() - 30 * 24 * 3600 * 1000)),
  );
  const [syncScopeOpen, setSyncScopeOpen] = useState(false);
  const [syncStatusOpen, setSyncStatusOpen] = useState(false);
  const [channelSettingsOpen, setChannelSettingsOpen] = useState(false);
  const [syncSelection, setSyncSelection] =
    useState<TelegramChannelSyncSelection>(DEFAULT_CHANNEL_SYNC_SELECTION);
  const [syncPostLimit, setSyncPostLimit] = useState(50);
  const [rangeMode, setRangeMode] = useState<"30d" | "all" | "custom">("30d");
  const [customFrom, setCustomFrom] = useState(thirtyDaysAgoIso);
  const [customTo, setCustomTo] = useState(todayIso);
  const [postsSearch, setPostsSearch] = useState("");
  const [inviteLinksSearch, setInviteLinksSearch] = useState("");
  const [campaignsSearch, setCampaignsSearch] = useState("");
  const [lastSyncResult, setLastSyncResult] = useState<any>(null);
  const [openSections, setOpenSections] = useState<ChannelSectionState>(() =>
    readStoredChannelSections(id),
  );
  const [settings, setSettings] = useState<SettingsState>({
    knownFakeSubscribersCount: "0",
    ownViewsPerPost: "0",
    ownReactionsPerPost: "0",
    kpiCurrency: "USD",
    targetCpaFrom: "",
    targetCpa: "",
    acceptableCpaFrom: "",
    acceptableCpa: "",
    stopCpaFrom: "",
    stopCpa: "",
    timePosts: [],
  });
  const postsPagination = usePagination({ initialPageSize: 10 });
  const inviteLinksPagination = usePagination({ initialPageSize: 10 });
  const campaignsPagination = usePagination({ initialPageSize: 10 });

  const rangeParams = useMemo(() => {
    if (rangeMode === "all") return { from: "2000-01-01", to: todayIso };
    if (rangeMode === "custom")
      return { from: customFrom || undefined, to: customTo || undefined };
    return { from: thirtyDaysAgoIso, to: todayIso };
  }, [customFrom, customTo, rangeMode, thirtyDaysAgoIso, todayIso]);

  const { data, isLoading } = useQuery({
    queryKey: [
      ...telegramChannelKeys.analytics(id),
      rangeParams.from,
      rangeParams.to,
    ],
    queryFn: () =>
      getTelegramChannelAnalytics(id, rangeParams.from, rangeParams.to),
    staleTime: 15 * 60_000,
  });
  const { data: channel, isLoading: isChannelLoading } = useQuery({
    queryKey: telegramChannelKeys.detail(id),
    queryFn: () => telegramChannelsApi.get(id),
  });
  const { data: audience, isLoading: isAudienceLoading } = useQuery({
    queryKey: telegramChannelKeys.audience(id),
    queryFn: () => telegramChannelsApi.audience(id),
    staleTime: 15 * 60_000,
  });
  const { data: financialSummary, isLoading: isFinancialSummaryLoading } =
    useQuery({
      queryKey: telegramChannelKeys.financialSummary(id),
      queryFn: () => telegramChannelsApi.financialSummary(id),
      staleTime: 15 * 60_000,
    });
  const {
    data: audienceSnapshots = [],
    isLoading: isAudienceSnapshotsLoading,
  } = useQuery({
    queryKey: telegramChannelKeys.audienceSnapshots(id),
    queryFn: () => telegramChannelsApi.audienceSnapshots(id, 80),
    enabled: openSections.charts,
  });
  const {
    data: postsData,
    isLoading: isPostsLoading,
    isPlaceholderData: isPostsPlaceholderData,
    isFetching: isPostsFetching,
    error: postsError,
  } = useQuery({
    queryKey: telegramPostKeys.channelPostsPage(
      id,
      postsPagination.page,
      postsPagination.pageSize,
      postsSearch,
    ),
    queryFn: () =>
      getTelegramChannelPosts(id, {
        page: postsPagination.page,
        pageSize: postsPagination.pageSize,
        search: postsSearch.trim() || undefined,
      }),
    enabled: openSections.posts,
    placeholderData: keepPreviousData,
  });
  const {
    data: inviteLinksData,
    isLoading: isInviteLinksLoading,
    isPlaceholderData: isInviteLinksPlaceholderData,
    isFetching: isInviteLinksFetching,
  } = useQuery({
    queryKey: telegramChannelKeys.inviteLinksPage(
      id,
      inviteLinksPagination.page,
      inviteLinksPagination.pageSize,
      inviteLinksSearch,
    ),
    queryFn: () =>
      getTelegramChannelInviteLinks(id, {
        page: inviteLinksPagination.page,
        pageSize: inviteLinksPagination.pageSize,
        search: inviteLinksSearch.trim() || undefined,
      }),
    enabled: openSections.inviteLinks,
    placeholderData: keepPreviousData,
  });
  const canLoadCampaignAttribution =
    openSections.campaigns && toNumber(data?.summary?.campaignsCount) > 0;
  const {
    data: campaignsData,
    isLoading: isCampaignsLoading,
    isPlaceholderData: isCampaignsPlaceholderData,
    isFetching: isCampaignsFetching,
  } = useQuery({
    queryKey: telegramChannelKeys.campaignsPage(
      id,
      campaignsPagination.page,
      campaignsPagination.pageSize,
      campaignsSearch,
    ),
    queryFn: () =>
      adCampaignsApi.listPage({
        telegramChannelId: id,
        page: campaignsPagination.page,
        pageSize: campaignsPagination.pageSize,
        search: campaignsSearch.trim() || undefined,
      }),
    enabled: canLoadCampaignAttribution,
    placeholderData: keepPreviousData,
  });
  const showPostsLoading = isPostsLoading || isPostsPlaceholderData;
  const showInviteLinksLoading =
    isInviteLinksLoading || isInviteLinksPlaceholderData;
  const showCampaignsLoading = isCampaignsLoading || isCampaignsPlaceholderData;
  const { data: currencySettings } = useQuery({
    queryKey: currencyKeys.settings(),
    queryFn: currenciesApi.getSettings,
    enabled: canLoadCampaignAttribution,
  });
  const { data: rates } = useQuery({
    queryKey: currencyKeys.latestRates(),
    queryFn: currenciesApi.listLatestRates,
    enabled: canLoadCampaignAttribution,
  });

  useEffect(() => {
    window.localStorage.setItem(
      channelSectionsStorageKey(id),
      JSON.stringify(openSections),
    );
  }, [id, openSections]);

  useEffect(() => {
    postsPagination.resetPage();
  }, [postsSearch]);

  useEffect(() => {
    inviteLinksPagination.resetPage();
  }, [inviteLinksSearch]);

  useEffect(() => {
    campaignsPagination.resetPage();
  }, [campaignsSearch]);

  useEffect(() => {
    const source = channel || data?.channel;
    if (!source) return;
    setSyncSelection(syncSelectionFromChannel(source));
    setSyncPostLimit(source.postSyncLimit ?? 50);
    setSettings({
      knownFakeSubscribersCount: String(source.knownFakeSubscribersCount ?? 0),
      ownViewsPerPost: String(source.ownViewsPerPost ?? 0),
      ownReactionsPerPost: String(source.ownReactionsPerPost ?? 0),
      kpiCurrency:
        source.kpiCurrency || currencySettings?.primaryCurrency || "USD",
      targetCpaFrom:
        source.targetCpaFrom == null ? "" : String(source.targetCpaFrom),
      targetCpa: source.targetCpa == null ? "" : String(source.targetCpa),
      acceptableCpaFrom:
        source.acceptableCpaFrom == null
          ? ""
          : String(source.acceptableCpaFrom),
      acceptableCpa:
        source.acceptableCpa == null ? "" : String(source.acceptableCpa),
      stopCpaFrom:
        source.stopCpaFrom == null
          ? source.stopCpa == null
            ? ""
            : String(source.stopCpa)
          : String(source.stopCpaFrom),
      stopCpa: "",
      timePosts: (source.timePosts || []).map(
        (item: {
          id: string;
          title: string;
          time: string;
          iconId?: string | null;
          iconPresentation?: ResolvedEmoji | null;
        }) => ({
          id: item.id,
          title: item.title,
          time: item.time,
          iconId: item.iconId || null,
          iconPresentation: item.iconPresentation || null,
        }),
      ),
    });
  }, [channel, data?.channel]);

  return {
    syncScopeOpen,
    setSyncScopeOpen,
    syncStatusOpen,
    setSyncStatusOpen,
    channelSettingsOpen,
    setChannelSettingsOpen,
    syncSelection,
    setSyncSelection,
    syncPostLimit,
    setSyncPostLimit,
    lastSyncResult,
    setLastSyncResult,
    rangeMode,
    setRangeMode,
    customFrom,
    customTo,
    setCustomFrom,
    setCustomTo,
    openSections,
    setOpenSections,
    isLoading,
    isChannelLoading,
    isAudienceLoading,
    isFinancialSummaryLoading,
    isAudienceSnapshotsLoading,
    data,
    channel,
    audience,
    financialSummary,
    audienceSnapshots,
    settings,
    currencySettings,
    rates,
    postsData,
    postsSearch,
    setPostsSearch,
    postsPagination,
    showPostsLoading,
    isPostsFetching,
    postsError,
    inviteLinksData,
    inviteLinksSearch,
    setInviteLinksSearch,
    inviteLinksPagination,
    showInviteLinksLoading,
    isInviteLinksFetching,
    campaignsData,
    campaignsSearch,
    setCampaignsSearch,
    campaignsPagination,
    showCampaignsLoading,
    isCampaignsFetching,
  };
}
