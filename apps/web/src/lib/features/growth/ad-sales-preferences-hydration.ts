import type { TelegramAdSalesMemberPreferences } from "@telegram-system/shared";

type PreferenceNetwork = {
  id: string;
  channels: Array<{ id: string }>;
};

export function resolveAdSalesPreferenceSelection({
  preferences,
  channelsReady,
  networksReady,
  saleableChannelIds,
  networks,
  requestedChannelId,
}: {
  preferences: TelegramAdSalesMemberPreferences | undefined;
  channelsReady: boolean;
  networksReady: boolean;
  saleableChannelIds: string[];
  networks: PreferenceNetwork[];
  requestedChannelId?: string | null;
}) {
  if (!preferences || !channelsReady || !networksReady) return null;

  const allowedIds = new Set(saleableChannelIds);
  if (requestedChannelId && allowedIds.has(requestedChannelId)) {
    return { selectedChannelIds: [requestedChannelId], selectedNetworkId: "" };
  }
  const preferredChannelIds = preferences.selectedChannelIds.filter((channelId) =>
    allowedIds.has(channelId),
  );
  const preferredNetworkId = preferences.initialized
    ? (preferences.selectedNetworkId ?? "")
    : "";
  const selectedNetwork = preferredNetworkId
    ? networks.find((network) => network.id === preferredNetworkId)
    : undefined;
  const selectedNetworkId = selectedNetwork?.id ?? "";
  const selectedChannelIds = preferences.initialized
    ? selectedNetwork
      ? selectedNetwork.channels.map((channel) => channel.id)
      : preferredChannelIds.length
        ? preferredChannelIds
        : saleableChannelIds
    : saleableChannelIds;

  return { selectedChannelIds, selectedNetworkId };
}
