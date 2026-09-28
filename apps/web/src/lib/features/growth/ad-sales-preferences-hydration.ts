import type { TelegramAdSalesMemberPreferences } from "@telegram-system/shared";

type PreferenceNetwork = {
  id: string;
  channels: Array<{ id: string }>;
};

/**
 * A sale can be created for a channel outside the current calendar scope.
 * Keep the newly booked channels visible rather than making a successful sale
 * appear to disappear after the checkout dialog closes.
 */
export function revealCreatedPlacementChannels({
  selectedChannelIds,
  selectedNetworkId,
  activeChannelIds,
  saleableChannelIds,
  createdChannelIds,
}: {
  selectedChannelIds: string[];
  selectedNetworkId: string;
  activeChannelIds: string[];
  saleableChannelIds: string[];
  createdChannelIds: string[];
}) {
  const allowedIds = new Set(saleableChannelIds);
  const nextCreatedIds = createdChannelIds.filter((channelId) =>
    allowedIds.has(channelId),
  );
  const activeIds = new Set(activeChannelIds);
  const hasHiddenCreatedChannel = nextCreatedIds.some(
    (channelId) => !activeIds.has(channelId),
  );
  if (!hasHiddenCreatedChannel) {
    return { selectedChannelIds, selectedNetworkId };
  }

  const nextSelectedChannelIds = Array.from(
    new Set([
      ...(selectedChannelIds.length ? selectedChannelIds : activeChannelIds),
      ...nextCreatedIds,
    ]),
  );
  return {
    selectedChannelIds: nextSelectedChannelIds,
    // A network scope cannot represent a newly booked channel outside it.
    selectedNetworkId: "",
  };
}

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
