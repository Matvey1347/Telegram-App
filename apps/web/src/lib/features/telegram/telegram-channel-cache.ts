import type { QueryClient } from "@tanstack/react-query";
import type { TelegramChannel } from "@/lib/api-types/telegram/telegram-channels";
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
