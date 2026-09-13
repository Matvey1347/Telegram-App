"use client";

import { useQuery } from "@tanstack/react-query";
import type { TelegramChannel } from "@/lib/api";
import { telegramChannelsApi } from "@/lib/api";
import { telegramChannelKeys } from "@/lib/query-keys";
import {
  Button,
  EmptyState,
  LoadingState,
  ToggleRow,
} from "@/components/ui/primitives";
import { ChannelPostSyncLimitField } from "./channel-post-sync-limit-field";
import { TelegramSourceAvatar } from "./telegram-source-avatar";

export function ChannelSourcesSettings({
  channel,
  autoSyncEnabled,
  postSyncLimit,
  onAutoSyncChange,
  onPostSyncLimitChange,
}: {
  channel: TelegramChannel;
  autoSyncEnabled: boolean;
  postSyncLimit: number;
  onAutoSyncChange: (enabled: boolean) => void;
  onPostSyncLimitChange: (value: number) => void;
}) {
  const sources = useQuery({
    queryKey: telegramChannelKeys.analyticsSources(channel.id),
    queryFn: () => telegramChannelsApi.analyticsSources(channel.id),
  });

  return (
    <div className="space-y-4">
      <ToggleRow
        checked={autoSyncEnabled}
        onChange={onAutoSyncChange}
        label="Automatic sync"
        description="Keep channel analytics up to date."
      />
      <ChannelPostSyncLimitField
        className="rounded-lg border border-neutral-800 bg-neutral-950/40 p-3"
        value={postSyncLimit}
        onChange={onPostSyncLimitChange}
      />
      {sources.isLoading ? <LoadingState /> : null}
      {sources.isError ? (
        <div className="flex items-center justify-between rounded-lg border border-rose-900/60 p-3 text-sm text-rose-300">
          Could not load channel sources.
          <Button variant="secondary" onClick={() => void sources.refetch()}>
            Retry
          </Button>
        </div>
      ) : null}
      {!sources.isLoading &&
      !sources.isError &&
      !sources.data?.sources.length ? (
        <EmptyState text="No connected sources yet." />
      ) : null}
      <div className="grid gap-2 sm:grid-cols-2">
        {sources.data?.sources.map((source) => (
          <div
            key={`${source.sourceType}:${source.sourceId}`}
            className="flex items-center gap-3 rounded-lg border border-neutral-800 bg-neutral-950/40 p-3"
          >
            <TelegramSourceAvatar
              avatarUrl={source.avatarUrl}
              sourceType={source.sourceType}
              alt={source.displayName}
              size="md"
            />
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-white">
                {source.displayName}
              </p>
              <p className="truncate text-xs text-neutral-400">
                {source.sourceType}
              </p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
