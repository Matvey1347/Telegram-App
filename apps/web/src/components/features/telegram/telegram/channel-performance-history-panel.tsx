"use client";

import { telegramChannelsApi } from "@/lib/api";
import { telegramChannelKeys } from "@/lib/query-keys";
import { TelegramPerformanceHistoryPanel } from "./telegram-performance-history-panel";

export function ChannelPerformanceHistoryPanel({
  channelId,
  fallbackPaybackPercent,
  fallbackAdsLeft,
}: {
  channelId: string;
  fallbackPaybackPercent?: number | null;
  fallbackAdsLeft?: number | null;
}) {
  return (
    <TelegramPerformanceHistoryPanel
      queryKey={(range) => telegramChannelKeys.performanceHistory(channelId, range)}
      queryFn={(range) => telegramChannelsApi.performanceHistory(channelId, range)}
      scopeLabel="channel"
      fallbackPaybackPercent={fallbackPaybackPercent}
      fallbackAdsLeft={fallbackAdsLeft}
    />
  );
}
