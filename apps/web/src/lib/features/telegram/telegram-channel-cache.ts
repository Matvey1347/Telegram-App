import type { QueryClient } from "@tanstack/react-query";
import type {
  TelegramChannel,
  TelegramChannelListResponse,
} from "@/lib/api-types/telegram/telegram-channels";
import { telegramChannelKeys } from "@/lib/query-keys";

type ChannelPatch = Partial<TelegramChannel> & Pick<TelegramChannel, "id">;

function mergeChannel(existing: TelegramChannel, patch: ChannelPatch): TelegramChannel {
  return { ...existing, ...patch };
}

/** Updates every cached channel list plus the matching detail read model. */
export function patchTelegramChannelCaches(queryClient: QueryClient, patch: ChannelPatch) {
  queryClient.setQueriesData<TelegramChannel[]>(
    { queryKey: telegramChannelKeys.lists() },
    (channels) =>
      channels?.map((channel) =>
        channel.id === patch.id ? mergeChannel(channel, patch) : channel,
      ),
  );
  queryClient.setQueryData<TelegramChannel>(
    telegramChannelKeys.detail(patch.id),
    (channel) => (channel ? mergeChannel(channel, patch) : channel),
  );
}

export function prependTelegramChannelToCaches(queryClient: QueryClient, channel: TelegramChannel) {
  queryClient.setQueriesData<TelegramChannel[]>(
    { queryKey: telegramChannelKeys.lists() },
    (channels) => [channel, ...(channels ?? []).filter((item) => item.id !== channel.id)],
  );
}

export function removeTelegramChannelFromCaches(queryClient: QueryClient, channelId: string) {
  queryClient.setQueriesData<TelegramChannel[]>(
    { queryKey: telegramChannelKeys.lists() },
    (channels) => channels?.filter((channel) => channel.id !== channelId),
  );
  queryClient.removeQueries({ queryKey: telegramChannelKeys.detail(channelId), exact: true });
}

/**
 * Archive/restore returns the authoritative detail model. Keep list-card data
 * already in cache and move that card between lifecycle lists without refetching.
 */
export function moveTelegramChannelBetweenLifecycleCaches(
  queryClient: QueryClient,
  channel: TelegramChannel,
) {
  const activeKey = telegramChannelKeys.list(false, true);
  const archivedKey = telegramChannelKeys.list(true, true);
  const active = queryClient.getQueryData<TelegramChannelListResponse>(activeKey);
  const archived = queryClient.getQueryData<TelegramChannelListResponse>(archivedKey);
  const source = [...(active?.items ?? []), ...(archived?.items ?? [])].find(
    (item) => item.id === channel.id,
  );
  const moved = source ? mergeChannel(source, channel) : channel;
  const isArchived = Boolean(channel.archivedAt);

  const updateList = (
    current: TelegramChannelListResponse | undefined,
    destination: boolean,
  ) => {
    if (!current) return current;
    const items = destination
      ? [moved, ...current.items.filter((item) => item.id !== channel.id)]
      : current.items.filter((item) => item.id !== channel.id);
    const activeDelta = isArchived ? -1 : 1;
    const archivedDelta = isArchived ? 1 : -1;
    return {
      ...current,
      items,
      pagination: {
        ...current.pagination,
        totalItems: Math.max(0, current.pagination.totalItems + (destination ? 1 : -1)),
      },
      counts: {
        active: Math.max(0, current.counts.active + activeDelta),
        archived: Math.max(0, current.counts.archived + archivedDelta),
      },
    };
  };

  queryClient.setQueryData<TelegramChannelListResponse>(
    activeKey,
    (current) => updateList(current, !isArchived),
  );
  queryClient.setQueryData<TelegramChannelListResponse>(
    archivedKey,
    (current) => updateList(current, isArchived),
  );
  queryClient.setQueryData<TelegramChannel>(telegramChannelKeys.detail(channel.id), channel);
}

export function restoreTelegramChannelCacheSnapshots(
  queryClient: QueryClient,
  snapshots: ReturnType<QueryClient["getQueriesData"]>,
) {
  for (const [queryKey, data] of snapshots) queryClient.setQueryData(queryKey, data);
}

export async function cancelTelegramChannelCacheUpdates(queryClient: QueryClient, channelId: string) {
  await Promise.all([
    queryClient.cancelQueries({ queryKey: telegramChannelKeys.lists() }),
    queryClient.cancelQueries({ queryKey: telegramChannelKeys.detail(channelId), exact: true }),
  ]);
}

export function getTelegramChannelCacheSnapshots(queryClient: QueryClient, channelId: string) {
  return [
    ...queryClient.getQueriesData({ queryKey: telegramChannelKeys.lists() }),
    ...queryClient.getQueriesData({ queryKey: telegramChannelKeys.detail(channelId), exact: true }),
  ];
}
