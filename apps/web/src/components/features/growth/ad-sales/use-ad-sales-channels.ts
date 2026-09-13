"use client";

import { useQuery } from "@tanstack/react-query";
import { telegramChannelsApi, type TelegramChannel } from "@/lib/api";
import { telegramChannelKeys } from "@/lib/query-keys";

export function useAdSalesChannels(enabled: boolean) {
  const query = useQuery({
    queryKey: telegramChannelKeys.select({ owned: true }),
    queryFn: () => telegramChannelsApi.select({ owned: true }),
    enabled,
    staleTime: 60_000,
  });
  const channels = (query.data ?? []) as unknown as TelegramChannel[];
  const saleableChannels = (query.data?.filter(
    (channel) => channel.canPostMessages,
  ) ?? []) as unknown as TelegramChannel[];
  return { query, channels, saleableChannels };
}
