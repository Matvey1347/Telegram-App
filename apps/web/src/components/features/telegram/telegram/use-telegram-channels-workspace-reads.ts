"use client";

import { useQuery } from "@tanstack/react-query";
import {
  currenciesApi,
  telegramChannelNetworksApi,
  telegramChannelsApi,
  type TelegramChannelNetwork,
} from "@/lib/api";
import { networkKeys, telegramChannelKeys } from "@/lib/query-keys";
import {
  type TelegramChannelLifecycleFilter as ChannelLifecycleTab,
  type TelegramChannelsTab as TelegramTab,
} from "@/components/features/telegram/telegram/telegram-channels-route-state";

const CHANNEL_CARD_READ_MODEL_VERSION = "content-horizon-v2";

export function useTelegramChannelsWorkspaceReads({
  tab,
  lifecycleTab,
  networkFormOpen,
  editingNetwork,
  messageTemplatesOpen,
  exportOpen,
}: {
  tab: TelegramTab;
  lifecycleTab: ChannelLifecycleTab;
  networkFormOpen: boolean;
  editingNetwork: TelegramChannelNetwork | null;
  messageTemplatesOpen: boolean;
  exportOpen: boolean;
}) {
  const {
    data: channelsResponse,
    isLoading: channelsLoading,
    error: channelsError,
  } = useQuery({
    queryKey: [
      ...telegramChannelKeys.lifecycleList(
        lifecycleTab,
        true,
      ),
      CHANNEL_CARD_READ_MODEL_VERSION,
    ],
    queryFn: () =>
      telegramChannelsApi.listWithCounts(lifecycleTab, true, true),
    // Keep rendering persisted cards while the active list is refreshed.
    staleTime: 60_000,
    refetchOnMount: "always",
    refetchOnWindowFocus: true,
    enabled:
      tab === "channels" ||
      networkFormOpen ||
      Boolean(editingNetwork) ||
      messageTemplatesOpen,
  });
  // Older hot caches can contain the legacy array shape under this key.
  // Keep this page render-safe while React Query replaces it with the read model.
  const channels = Array.isArray(channelsResponse)
    ? channelsResponse
    : channelsResponse?.items;
  const channelCounts = Array.isArray(channelsResponse)
    ? undefined
    : channelsResponse?.counts;
  const {
    data: networks = [],
    isLoading: networksLoading,
    error: networksError,
  } = useQuery({
    queryKey: networkKeys.list(),
    queryFn: telegramChannelNetworksApi.list,
    enabled: tab === "networks" || messageTemplatesOpen || exportOpen,
    // Network cards aggregate channel finance and traffic. Refresh on the
    // daily boundary or when a relevant mutation invalidates this key.
    staleTime: 24 * 60 * 60_000,
  });
  const { data: currencySettings } = useQuery({
    queryKey: ["currency-settings"],
    queryFn: currenciesApi.getSettings,
    enabled: tab === "networks",
  });
  const { data: rates } = useQuery({
    queryKey: ["currency-rates-latest"],
    queryFn: currenciesApi.listLatestRates,
    enabled: tab === "networks",
  });
  return {
    channels,
    channelCounts,
    channelsLoading,
    channelsError,
    networks,
    networksLoading,
    networksError,
    currencySettings,
    rates,
  };
}
