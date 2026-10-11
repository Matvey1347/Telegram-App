import type { QueryClient } from "@tanstack/react-query";
import type {
  TelegramChannel,
  TelegramChannelListResponse,
} from "@/lib/api-types/telegram/telegram-channels";
import { telegramChannelKeys } from "@/lib/query-keys";

type ChannelPatch = Partial<TelegramChannel> & Pick<TelegramChannel, "id">;
type ChannelListCache = TelegramChannel[] | TelegramChannelListResponse;

function mergeChannel(
  existing: TelegramChannel,
  patch: ChannelPatch,
): TelegramChannel {
  return { ...existing, ...patch };
}

function updateCachedList(
  current: ChannelListCache | undefined,
  update: (channels: TelegramChannel[]) => TelegramChannel[],
): ChannelListCache | undefined {
  if (!current) return current;
  if (Array.isArray(current)) return update(current);
  return { ...current, items: update(current.items) };
}

/** Updates every cached channel list plus the matching detail read model. */
export function patchTelegramChannelCaches(
  queryClient: QueryClient,
  patch: ChannelPatch,
) {
  queryClient.setQueriesData<ChannelListCache>(
    { queryKey: telegramChannelKeys.lists() },
    (current) =>
      updateCachedList(current, (channels) =>
        channels.map((channel) =>
          channel.id === patch.id ? mergeChannel(channel, patch) : channel,
        ),
      ),
  );
  queryClient.setQueryData<TelegramChannel>(
    telegramChannelKeys.detail(patch.id),
    (channel) => (channel ? mergeChannel(channel, patch) : channel),
  );
}

export function prependTelegramChannelToCaches(
  queryClient: QueryClient,
  channel: TelegramChannel,
) {
  queryClient.setQueriesData<ChannelListCache>(
    { queryKey: telegramChannelKeys.lists() },
    (current) =>
      updateCachedList(current, (channels) => [
        channel,
        ...channels.filter((item) => item.id !== channel.id),
      ]),
  );
}

export function removeTelegramChannelFromCaches(
  queryClient: QueryClient,
  channelId: string,
) {
  queryClient.setQueriesData<ChannelListCache>(
    { queryKey: telegramChannelKeys.lists() },
    (current) =>
      updateCachedList(current, (channels) =>
        channels.filter((channel) => channel.id !== channelId),
      ),
  );
  queryClient.removeQueries({
    queryKey: telegramChannelKeys.detail(channelId),
    exact: true,
  });
}

/**
 * Archive/restore returns the authoritative detail model. Keep list-card data
 * already in cache and move that card between lifecycle lists without refetching.
 */
export function moveTelegramChannelBetweenLifecycleCaches(
  queryClient: QueryClient,
  channel: TelegramChannel,
) {
  const activeKey = telegramChannelKeys.lifecycleList("active", true);
  const testKey = telegramChannelKeys.lifecycleList("test", true);
  const archivedKey = telegramChannelKeys.lifecycleList("archive", true);
  const active =
    queryClient.getQueryData<TelegramChannelListResponse>(activeKey);
  const test = queryClient.getQueryData<TelegramChannelListResponse>(testKey);
  const archived =
    queryClient.getQueryData<TelegramChannelListResponse>(archivedKey);
  const source = [
    ...(active?.items ?? []),
    ...(test?.items ?? []),
    ...(archived?.items ?? []),
  ].find((item) => item.id === channel.id);
  const moved = source ? mergeChannel(source, channel) : channel;
  const origin = active?.items.some((item) => item.id === channel.id)
    ? "active"
    : test?.items.some((item) => item.id === channel.id)
      ? "test"
      : archived?.items.some((item) => item.id === channel.id)
        ? "archive"
        : null;
  const destination = channel.archivedAt
    ? "archive"
    : channel.isTest
      ? "test"
      : "active";

  const updateList = (
    current: TelegramChannelListResponse | undefined,
    lifecycle: "active" | "test" | "archive",
  ) => {
    if (!current) return current;
    const isDestination = lifecycle === destination;
    const items = isDestination
      ? [moved, ...current.items.filter((item) => item.id !== channel.id)]
      : current.items.filter((item) => item.id !== channel.id);
    const hadChannel = current.items.some((item) => item.id === channel.id);
    const delta = isDestination ? (hadChannel ? 0 : 1) : hadChannel ? -1 : 0;
    const countDelta = (target: "active" | "test" | "archive") =>
      (origin === target ? -1 : 0) + (destination === target ? 1 : 0);
    return {
      ...current,
      items,
      pagination: {
        ...current.pagination,
        totalItems: Math.max(0, current.pagination.totalItems + delta),
      },
      counts: {
        active:
          Math.max(0, current.counts.active + countDelta("active")),
        test:
          Math.max(0, current.counts.test + countDelta("test")),
        archived:
          Math.max(0, current.counts.archived + countDelta("archive")),
      },
    };
  };

  queryClient.setQueryData<TelegramChannelListResponse>(activeKey, (current) =>
    updateList(current, "active"),
  );
  queryClient.setQueryData<TelegramChannelListResponse>(testKey, (current) =>
    updateList(current, "test"),
  );
  queryClient.setQueryData<TelegramChannelListResponse>(
    archivedKey,
    (current) => updateList(current, "archive"),
  );
  queryClient.setQueryData<TelegramChannel>(
    telegramChannelKeys.detail(channel.id),
    channel,
  );
}

export function restoreTelegramChannelCacheSnapshots(
  queryClient: QueryClient,
  snapshots: ReturnType<QueryClient["getQueriesData"]>,
) {
  for (const [queryKey, data] of snapshots)
    queryClient.setQueryData(queryKey, data);
}

export async function cancelTelegramChannelCacheUpdates(
  queryClient: QueryClient,
  channelId: string,
) {
  await Promise.all([
    queryClient.cancelQueries({ queryKey: telegramChannelKeys.lists() }),
    queryClient.cancelQueries({
      queryKey: telegramChannelKeys.detail(channelId),
      exact: true,
    }),
  ]);
}

export function getTelegramChannelCacheSnapshots(
  queryClient: QueryClient,
  channelId: string,
) {
  return [
    ...queryClient.getQueriesData({ queryKey: telegramChannelKeys.lists() }),
    ...queryClient.getQueriesData({
      queryKey: telegramChannelKeys.detail(channelId),
      exact: true,
    }),
  ];
}
