"use client";

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Button, Modal } from "@/components/ui/primitives";
import { telegramChannelsApi } from "@/lib/api";
import type { TelegramChannel, TelegramChannelSyncSelection } from "@/lib/api";
import { telegramChannelKeys } from "@/lib/query-keys";
import { useAppToast } from "@/providers/toast-provider";

export const DEFAULT_CHANNEL_SYNC_SELECTION: TelegramChannelSyncSelection = {
  syncIncludePublicInfo: true,
  syncIncludeInviteLinks: true,
  syncIncludeHistoricalPosts: true,
  syncIncludePostMetrics: true,
  syncIncludeOlderPosts: true,
  syncIncludeChannelStats: true,
  syncIncludeManagedPosts: true,
  syncIncludeAudienceSnapshot: true,
};

export function syncSelectionFromChannel(
  channel?: TelegramChannel | null,
): TelegramChannelSyncSelection {
  return {
    syncIncludePublicInfo:
      channel?.syncIncludePublicInfo ??
      DEFAULT_CHANNEL_SYNC_SELECTION.syncIncludePublicInfo,
    syncIncludeInviteLinks:
      channel?.syncIncludeInviteLinks ??
      DEFAULT_CHANNEL_SYNC_SELECTION.syncIncludeInviteLinks,
    syncIncludeHistoricalPosts:
      channel?.syncIncludeHistoricalPosts ??
      DEFAULT_CHANNEL_SYNC_SELECTION.syncIncludeHistoricalPosts,
    syncIncludePostMetrics:
      channel?.syncIncludePostMetrics ??
      DEFAULT_CHANNEL_SYNC_SELECTION.syncIncludePostMetrics,
    syncIncludeOlderPosts:
      channel?.syncIncludeOlderPosts ??
      DEFAULT_CHANNEL_SYNC_SELECTION.syncIncludeOlderPosts,
    syncIncludeChannelStats:
      channel?.syncIncludeChannelStats ??
      DEFAULT_CHANNEL_SYNC_SELECTION.syncIncludeChannelStats,
    syncIncludeManagedPosts:
      channel?.syncIncludeManagedPosts ??
      DEFAULT_CHANNEL_SYNC_SELECTION.syncIncludeManagedPosts,
    syncIncludeAudienceSnapshot:
      channel?.syncIncludeAudienceSnapshot ??
      DEFAULT_CHANNEL_SYNC_SELECTION.syncIncludeAudienceSnapshot,
  };
}

const SYNC_OPTIONS: Array<{
  key: keyof TelegramChannelSyncSelection;
  title: string;
  description: string;
}> = [
  {
    key: "syncIncludePublicInfo",
    title: "Public info",
    description: "Channel identity, title and subscribers.",
  },
  {
    key: "syncIncludeInviteLinks",
    title: "Invite links",
    description: "Joined and pending requests attribution.",
  },
  {
    key: "syncIncludeHistoricalPosts",
    title: "Historical daily rows",
    description: "Daily aggregated historical post rows.",
  },
  {
    key: "syncIncludePostMetrics",
    title: "Post metrics",
    description: "Views, reactions and post-level metrics.",
  },
  {
    key: "syncIncludeOlderPosts",
    title: "Older posts backfill",
    description: "Extra metrics pass for older posts.",
  },
  {
    key: "syncIncludeChannelStats",
    title: "Channel stats",
    description: "Broadcast analytics graphs and snapshots.",
  },
  {
    key: "syncIncludeManagedPosts",
    title: "Managed posts",
    description: "Managed post sync and remote status check.",
  },
  {
    key: "syncIncludeAudienceSnapshot",
    title: "Audience snapshot",
    description: "Save the latest audience estimate.",
  },
];

export function ChannelSyncScopeModal({
  open,
  title,
  description,
  helperText,
  selection,
  isSyncing,
  submitLabel,
  onClose,
  onSelectionChange,
  onSubmit,
  onSyncAll,
}: {
  open: boolean;
  title: string;
  description: string;
  helperText: string;
  selection: TelegramChannelSyncSelection;
  isSyncing: boolean;
  submitLabel: string;
  onClose: () => void;
  onSelectionChange: (selection: TelegramChannelSyncSelection) => void;
  onSubmit: () => void;
  onSyncAll?: () => void;
}) {
  const selectedCount = SYNC_OPTIONS.filter(
    (option) => selection[option.key],
  ).length;

  return (
    <Modal open={open} onClose={onClose} title={title}>
      <div className="space-y-4">
        <div className="text-sm text-neutral-300">
          <p>{description}</p>
          <p className="mt-1 text-xs text-neutral-500">{helperText}</p>
        </div>
        <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
          {SYNC_OPTIONS.map((option) => (
            <label
              key={option.key}
              className="flex cursor-pointer items-start gap-3 rounded-lg border border-neutral-800 bg-neutral-950/55 p-3 has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-blue-500"
            >
              <input
                type="checkbox"
                className="mt-1 h-4 w-4 rounded border-neutral-600 bg-neutral-950 text-blue-500"
                checked={selection[option.key]}
                onChange={(event) =>
                  onSelectionChange({
                    ...selection,
                    [option.key]: event.target.checked,
                  })
                }
              />
              <span>
                <span className="block text-sm font-medium text-white">
                  {option.title}
                </span>
                <span className="mt-1 block text-xs text-neutral-400">
                  {option.description}
                </span>
              </span>
            </label>
          ))}
        </div>
        <div className="flex items-center justify-between gap-3 text-xs text-neutral-400">
          <span>
            Selected: {selectedCount}/{SYNC_OPTIONS.length}
          </span>
          <span>
            {isSyncing ? "Synchronization in progress…" : "Ready to sync"}
          </span>
        </div>
        <div className="flex flex-wrap justify-end gap-2">
          <Button variant="secondary" onClick={onClose} disabled={isSyncing}>
            Close
          </Button>
          {onSyncAll ? (
            <Button
              variant="secondary"
              onClick={onSyncAll}
              disabled={isSyncing}
            >
              Sync all
            </Button>
          ) : null}
          <Button
            variant="primary"
            onClick={onSubmit}
            disabled={isSyncing || selectedCount === 0}
          >
            {isSyncing ? "Syncing…" : submitLabel}
          </Button>
        </div>
      </div>
    </Modal>
  );
}

function requestErrorMessage(error: unknown, fallback: string) {
  const responseError = error as { response?: { data?: { message?: string } } };
  return responseError.response?.data?.message || fallback;
}

export function WorkspaceChannelSyncModal({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const { pushToast } = useAppToast();
  const [selection, setSelection] = useState<TelegramChannelSyncSelection>(
    DEFAULT_CHANNEL_SYNC_SELECTION,
  );
  const mutation = useMutation({
    mutationFn: () => telegramChannelsApi.syncWorkspaceChannels(selection),
    onSuccess: async (result) => {
      onClose();
      // The aggregate run can update every channel card. Refetch the list
      // family once instead of issuing a browser request per channel.
      await queryClient.invalidateQueries({
        queryKey: telegramChannelKeys.lists(),
      });
      pushToast(
        result.summary ||
          `Synced ${result.successful}/${result.total} channels.`,
        result.failed > 0 ? "info" : "success",
        8000,
      );
    },
    onError: (error: unknown) =>
      pushToast(
        requestErrorMessage(error, "Workspace channel sync failed."),
        "error",
      ),
  });

  return (
    <ChannelSyncScopeModal
      open={open}
      title="Sync all channels"
      description="Choose what to synchronize across active workspace channels."
      helperText="This runs as one workspace operation. Channel-specific saved scopes are not changed."
      selection={selection}
      isSyncing={mutation.isPending}
      submitLabel="Sync all channels"
      onClose={onClose}
      onSelectionChange={setSelection}
      onSubmit={() => mutation.mutate()}
    />
  );
}
