"use client";

import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { type AdCampaignSort } from "@/components/features/growth/ad-campaigns/ad-campaign-sort-menu";
import {
  adCampaignsApi,
  adHypothesesApi,
  promosApi,
  telegramChannelNetworksApi,
  telegramChannelsApi,
  workspacesApi,
  type AdCampaign,
} from "@/lib/api";
import { currenciesApi } from "@/lib/api";
import { networkKeys, telegramChannelKeys } from "@/lib/query-keys";
import { type AdCampaignsViewMode } from "@/components/features/growth/ad-campaigns/ad-campaign-route-state";
import { usePagination } from "@/hooks/use-pagination";

const CAMPAIGN_BOT_REQUESTS_READ_MODEL_VERSION = "campaign-metrics-v4";

export function useAdsWorkspaceReads({
  viewMode,
  createOpen,
  editing,
  hypothesisFormOpen,
  campaignsPagination,
  hypothesesPagination,
  promosPagination,
  deferredSearch,
  channelScopeFilter,
  showArchivedPromos,
  dateFrom,
  dateTo,
  sort,
}: {
  viewMode: AdCampaignsViewMode;
  createOpen: boolean;
  editing: AdCampaign | null;
  hypothesisFormOpen: boolean;
  campaignsPagination: Pick<
    ReturnType<typeof usePagination>,
    "page" | "pageSize"
  >;
  hypothesesPagination: Pick<
    ReturnType<typeof usePagination>,
    "page" | "pageSize"
  >;
  promosPagination: Pick<ReturnType<typeof usePagination>, "page" | "pageSize">;
  deferredSearch: string;
  channelScopeFilter: string;
  showArchivedPromos: boolean;
  dateFrom: string;
  dateTo: string;
  sort: AdCampaignSort;
}) {
  const financialViewVisible =
    viewMode !== "promos" ||
    createOpen ||
    Boolean(editing) ||
    hypothesisFormOpen;
  const { data: workspace } = useQuery({
    queryKey: ["workspace-selected"],
    queryFn: workspacesApi.selected,
    enabled: financialViewVisible,
  });
  const { data: currencySettings } = useQuery({
    queryKey: ["currency-settings"],
    queryFn: currenciesApi.getSettings,
    enabled: financialViewVisible,
  });
  const { data: rates } = useQuery({
    queryKey: ["currency-rates-latest"],
    queryFn: currenciesApi.listLatestRates,
    enabled: financialViewVisible,
  });
  const moneySettings = currencySettings ?? {
    primaryCurrency: workspace?.primaryCurrency || "",
    secondaryCurrency: workspace?.secondaryCurrency || "",
    currencyDisplayMode: workspace?.currencyDisplayMode || "code",
  };
  const { data: channels } = useQuery({
    queryKey: telegramChannelKeys.select(),
    queryFn: () => telegramChannelsApi.select(),
  });
  const { data: channelNetworks } = useQuery({
    queryKey: networkKeys.list(),
    queryFn: telegramChannelNetworksApi.list,
  });
  const { data, isLoading, isFetching, error } = useQuery({
    queryKey: [
      "ad-campaigns",
      "list",
      {
        viewMode,
        page: campaignsPagination.page,
        pageSize: campaignsPagination.pageSize,
        search: deferredSearch,
        channelScopeFilter,
        dateFrom,
        dateTo,
        sort,
        readModelVersion: CAMPAIGN_BOT_REQUESTS_READ_MODEL_VERSION,
      },
    ],
    queryFn: () =>
      adCampaignsApi.listPage({
        page: campaignsPagination.page,
        pageSize: campaignsPagination.pageSize,
        search: deferredSearch || undefined,
        telegramChannelIds: channelScopeFilter || undefined,
        dateFrom: dateFrom || undefined,
        dateTo: dateTo || undefined,
        sort,
      }),
    enabled: viewMode === "campaigns",
  });
  const {
    data: hypothesesPage,
    isLoading: hypothesesLoading,
    error: hypothesesError,
  } = useQuery({
    queryKey: [
      "ad-hypotheses",
      "list",
      {
        viewMode,
        page: hypothesesPagination.page,
        pageSize: hypothesesPagination.pageSize,
        search: deferredSearch,
        channelScopeFilter,
      },
    ],
    queryFn: () =>
      adHypothesesApi.listPage({
        page: hypothesesPagination.page,
        pageSize: hypothesesPagination.pageSize,
        search: deferredSearch || undefined,
        telegramChannelIds: channelScopeFilter || undefined,
      }),
    enabled: viewMode === "hypotheses",
    placeholderData: keepPreviousData,
  });
  const {
    data: promosPage,
    isLoading: promosLoading,
    isFetching: promosFetching,
    error: promosError,
  } = useQuery({
    queryKey: [
      "promos",
      "list",
      {
        viewMode,
        page: promosPagination.page,
        pageSize: promosPagination.pageSize,
        search: deferredSearch,
        channelScopeFilter,
        showArchivedPromos,
      },
    ],
    queryFn: () =>
      promosApi.listPage({
        page: promosPagination.page,
        pageSize: promosPagination.pageSize,
        search: deferredSearch || undefined,
        telegramChannelIds: channelScopeFilter || undefined,
        archived: showArchivedPromos,
      }),
    enabled: viewMode === "promos",
  });

  const hypotheses = hypothesesPage?.items ?? [];
  const promos = promosPage?.items ?? [];

  return {
    workspace,
    moneySettings,
    rates,
    channels,
    channelNetworks,
    data,
    isLoading,
    isFetching,
    error,
    hypothesesPage,
    hypothesesLoading,
    hypothesesError,
    promosPage,
    promosLoading,
    promosFetching,
    promosError,
    hypotheses,
    promos,
  };
}
