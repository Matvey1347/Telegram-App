"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Tooltip } from "@/components/ui/primitives";
import { telegramChannelsApi } from "@/lib/api";
import {
  cancelTelegramChannelCacheUpdates,
  getTelegramChannelCacheSnapshots,
  patchTelegramChannelCaches,
  restoreTelegramChannelCacheSnapshots,
} from "@/lib/features/telegram/telegram-channel-cache";
import { useAppToast } from "@/providers/toast-provider";

export function ChannelAutoSyncToggle({
  channelId,
  enabled,
  disabled = false,
}: {
  channelId: string;
  enabled: boolean;
  disabled?: boolean;
}) {
  const queryClient = useQueryClient();
  const { pushToast } = useAppToast();
  const mutation = useMutation({
    mutationFn: (autoSyncEnabled: boolean) =>
      telegramChannelsApi.updateQuiet(channelId, { autoSyncEnabled }),
    onMutate: async (autoSyncEnabled) => {
      await cancelTelegramChannelCacheUpdates(queryClient, channelId);
      const snapshots = getTelegramChannelCacheSnapshots(queryClient, channelId);
      patchTelegramChannelCaches(queryClient, { id: channelId, autoSyncEnabled });
      return { snapshots };
    },
    onSuccess: (channel) => {
      // PATCH returns the authoritative server read model; do not GET the list.
      patchTelegramChannelCaches(queryClient, channel);
    },
    onError: (error: any, _autoSyncEnabled, context) => {
      if (context?.snapshots) {
        restoreTelegramChannelCacheSnapshots(queryClient, context.snapshots);
      }
      pushToast(
        error?.response?.data?.message || "Failed to update auto sync.",
        "error",
      );
    },
  });

  return (
    <span className="inline-flex items-center gap-2">
      <span className="text-xs font-medium text-slate-300">Auto sync</span>
      <Tooltip
        className="max-w-72 text-center"
        content="Automatic analytics and data sync. Manual sync remains available."
      >
        <button
          type="button"
          aria-label="Auto sync"
          aria-pressed={enabled}
          disabled={disabled || mutation.isPending}
          onClick={() => mutation.mutate(!enabled)}
          className={`relative inline-flex h-6 w-11 shrink-0 rounded-full border transition disabled:opacity-50 ${
            enabled
              ? "border-emerald-500/70 bg-emerald-500/20"
              : "border-neutral-700 bg-neutral-900"
          }`}
        >
          <span
            className={`absolute inset-y-0.5 aspect-square rounded-full bg-white transition ${
              enabled ? "right-0.5" : "left-0.5"
            }`}
          />
        </button>
      </Tooltip>
    </span>
  );
}
