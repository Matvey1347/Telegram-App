"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useTelegramChannelLifecycleMutations } from "@/components/features/telegram/telegram/use-telegram-channel-lifecycle-mutations";
import {
  advertisingChannelsApi,
  syncTelegramChannelNowWithProgress,
  telegramChannelNetworksApi,
  telegramChannelsApi,
  type ImportedTelegramSource,
  type TelegramChannel,
  type TelegramChannelAdAnalysisPayload,
  type TelegramChannelSyncNowPayload,
} from "@/lib/api";
import { scheduleProgressDismiss, syncProgressToToast } from "@/lib/progress";
import { useAppToast } from "@/providers/toast-provider";
import { networkKeys, telegramChannelKeys } from "@/lib/query-keys";
import {
  prependTelegramChannelToCaches,
  removeTelegramChannelFromCaches,
} from "@/lib/features/telegram/telegram-channel-cache";
import { invalidateTelegramChannelQueries } from "@/lib/features/telegram/telegram-query-invalidation";
import {
  type TelegramAccountFilter as AccountFilter,
  type TelegramChannelOwnershipFilter as ChannelFilter,
  type TelegramChannelsTab as TelegramTab,
} from "@/components/features/telegram/telegram/telegram-channels-route-state";
import {
  requestErrorMessage,
  isOwnChannel,
  isPersonSource,
  summarizeSync,
} from "./telegram-channels-workspace-utils";

export function useTelegramChannelsWorkspaceMutations({
  setImportOpen,
  setAnalysisEditor,
  setDeletingAnalysis,
  setDeleting,
  setDeletingPerson,
  setNetworkFormOpen,
  setEditingNetwork,
  setDeletingNetwork,
  setSyncTargetChannel,
  updateTabs,
}: {
  setImportOpen: (value: boolean) => void;
  setAnalysisEditor: (value: null) => void;
  setDeletingAnalysis: (value: null) => void;
  setDeleting: (value: null) => void;
  setDeletingPerson: (value: null) => void;
  setNetworkFormOpen: (value: boolean) => void;
  setEditingNetwork: (value: null) => void;
  setDeletingNetwork: (value: null) => void;
  setSyncTargetChannel: (value: null) => void;
  updateTabs: (next: {
    tab?: TelegramTab;
    channelFilter?: ChannelFilter;
    accountFilter?: AccountFilter;
  }) => void;
}) {
  const queryClient = useQueryClient();
  const { pushToast, setProgress, clearProgress } = useAppToast();
  const importMutation = useMutation({
    mutationFn: async ({
      input,
      mode,
    }: {
      input: string;
      mode: "import" | "refresh";
    }) => {
      const progressId = `telegram-channel-${mode}:${Date.now()}`;
      const progressTitle =
        mode === "refresh" ? "Refresh channel" : "Import channel";
      const activeMessage =
        mode === "refresh" ? "Refreshing channel…" : "Importing channel…";
      const completedMessage =
        mode === "refresh"
          ? "Channel refresh completed"
          : "Channel import completed";
      setProgress({
        id: progressId,
        title: progressTitle,
        current: 0,
        total: 5,
        message: mode === "refresh" ? "Starting refresh…" : "Starting import…",
      });
      try {
        const source = await telegramChannelsApi.importWithProgress(
          { input },
          (item: { message?: string }, current, total) => {
            setProgress({
              id: progressId,
              title: progressTitle,
              current,
              total,
              message: item.message || activeMessage,
            });
          },
        );
        setProgress({
          id: progressId,
          title: progressTitle,
          current: 5,
          total: 5,
          message: completedMessage,
          completed: true,
          successCount: 1,
          failedCount: 0,
          skippedCount: 0,
        });
        scheduleProgressDismiss(clearProgress, progressId);
        return source;
      } catch (error) {
        clearProgress(progressId);
        throw error;
      }
    },
    onSuccess: async (source: ImportedTelegramSource) => {
      if (!isPersonSource(source)) {
        prependTelegramChannelToCaches(queryClient, source);
      }
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["advertising-people"] }),
      ]);
      setImportOpen(false);
      if (isPersonSource(source)) {
        updateTabs({ tab: "accounts", accountFilter: "people" });
      } else {
        updateTabs({
          tab: "channels",
          channelFilter:
            "adminLinks" in source && isOwnChannel(source) ? "own" : "external",
        });
      }
    },
    onError: (requestError: unknown) =>
      pushToast(
        requestErrorMessage(requestError, "Failed to import source."),
        "error",
      ),
  });
  const saveAnalysisMutation = useMutation({
    mutationFn: ({
      channelId,
      analysisId,
      payload,
    }: {
      channelId: string;
      analysisId?: string;
      payload: TelegramChannelAdAnalysisPayload;
    }) =>
      analysisId
        ? telegramChannelsApi.updateAdAnalysis(channelId, analysisId, payload)
        : telegramChannelsApi.createAdAnalysis(channelId, payload),
    onSuccess: (analysis) => {
      // The list preview contains server-derived analysis summaries.
      queryClient.invalidateQueries({
        queryKey: telegramChannelKeys.list(),
        exact: true,
      });
      queryClient.invalidateQueries({
        queryKey: ["telegram-channel-ad-analyses", analysis.telegramChannelId],
      });
      setAnalysisEditor(null);
      pushToast(
        analysis.warning
          ? `Analysis saved. Sync warning: ${analysis.warning}`
          : "Ad analysis saved.",
        analysis.warning ? "info" : "success",
      );
    },
    onError: (requestError: unknown) =>
      pushToast(
        requestErrorMessage(requestError, "Failed to save ad analysis."),
        "error",
      ),
  });
  const deleteAnalysisMutation = useMutation({
    mutationFn: ({
      channelId,
      analysisId,
    }: {
      channelId: string;
      analysisId: string;
    }) => telegramChannelsApi.deleteAdAnalysis(channelId, analysisId),
    onSuccess: (analysis) => {
      queryClient.invalidateQueries({
        queryKey: telegramChannelKeys.list(),
        exact: true,
      });
      queryClient.invalidateQueries({
        queryKey: ["telegram-channel-ad-analyses", analysis.telegramChannelId],
      });
      setDeletingAnalysis(null);
      pushToast("Ad analysis deleted.", "success");
    },
    onError: (requestError: unknown) =>
      pushToast(
        requestErrorMessage(requestError, "Failed to delete ad analysis."),
        "error",
      ),
  });
  const deleteMutation = useMutation({
    mutationFn: (id: string) => telegramChannelsApi.remove(id),
    onSuccess: (_result, channelId) => {
      removeTelegramChannelFromCaches(queryClient, channelId);
      setDeleting(null);
      pushToast("Channel deleted with related data.", "success");
    },
    onError: (requestError: unknown) =>
      pushToast(
        requestErrorMessage(requestError, "Failed to delete channel."),
        "error",
      ),
  });
  const {
    archiveMutation,
    restoreMutation,
    moveToTestMutation,
    moveToActiveMutation,
  } = useTelegramChannelLifecycleMutations();
  const deletePersonMutation = useMutation({
    mutationFn: (id: string) => advertisingChannelsApi.remove(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["advertising-people"] });
      setDeletingPerson(null);
      pushToast("Person deleted.", "success");
    },
    onError: (requestError: unknown) =>
      pushToast(
        requestErrorMessage(requestError, "Failed to delete person."),
        "error",
      ),
  });
  const createNetworkMutation = useMutation({
    mutationFn: telegramChannelNetworksApi.create,
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: networkKeys.list(),
      });
      setNetworkFormOpen(false);
      pushToast("Network created.", "success");
    },
    onError: (requestError: unknown) =>
      pushToast(
        requestErrorMessage(requestError, "Failed to create network."),
        "error",
      ),
  });
  const updateNetworkMutation = useMutation({
    mutationFn: ({
      id,
      payload,
    }: {
      id: string;
      payload: {
        name?: string;
        description?: string | null;
        iconId?: string | null;
        telegramChannelIds?: string[];
        excludedTelegramChannelIds?: string[];
      };
    }) => telegramChannelNetworksApi.update(id, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: networkKeys.list(),
      });
      setEditingNetwork(null);
      setNetworkFormOpen(false);
      pushToast("Network updated.", "success");
    },
    onError: (requestError: unknown) =>
      pushToast(
        requestErrorMessage(requestError, "Failed to update network."),
        "error",
      ),
  });
  const deleteNetworkMutation = useMutation({
    mutationFn: (id: string) => telegramChannelNetworksApi.remove(id),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: networkKeys.list(),
      });
      setDeletingNetwork(null);
      pushToast("Network deleted.", "success");
    },
    onError: (requestError: unknown) =>
      pushToast(
        requestErrorMessage(requestError, "Failed to delete network."),
        "error",
      ),
  });
  const syncNowMutation = useMutation({
    mutationFn: async ({
      channel,
      payload,
    }: {
      channel: TelegramChannel;
      payload: TelegramChannelSyncNowPayload;
    }) => {
      const progressId = `telegram-channel-sync:${channel.id}`;
      setProgress({
        id: progressId,
        title: `Sync ${channel.title}`,
        current: 0,
        total: 8,
        message: "Starting sync…",
        iconUrl: channel.photoUrl || undefined,
      });
      try {
        const result = await syncTelegramChannelNowWithProgress(
          channel.id,
          (item, current, total) => {
            setProgress(
              syncProgressToToast({
                id: progressId,
                title: `Sync ${channel.title}`,
                item,
                current,
                total,
                iconUrl: channel.photoUrl || undefined,
              }),
            );
          },
          payload,
        );
        const partial = result?.status === "partial";
        const failed = result?.status === "failed";
        setProgress({
          id: progressId,
          title: `Sync ${channel.title}`,
          current: 8,
          total: 8,
          message: failed
            ? "Channel sync failed"
            : partial
              ? "Channel sync completed partially"
              : "Channel sync completed",
          completed: !failed,
          successCount: failed ? 0 : partial ? 0 : 1,
          failedCount: failed ? 1 : 0,
          skippedCount: partial ? 1 : 0,
          iconUrl: channel.photoUrl || undefined,
        });
        scheduleProgressDismiss(clearProgress, progressId);
        return { channelId: channel.id, result };
      } catch (error) {
        clearProgress(progressId);
        throw error;
      }
    },
    onSettled: (_result, _error, { channel }) =>
      invalidateTelegramChannelQueries(queryClient, channel.id, {
        sourceAccessChanged: true,
      }),
    onSuccess: ({ result }) => {
      setSyncTargetChannel(null);
      pushToast(
        summarizeSync(result),
        result?.status === "partial" ? "info" : "success",
        8000,
      );
    },
    onError: (requestError: unknown) =>
      pushToast(requestErrorMessage(requestError, "Sync failed."), "error"),
  });

  return {
    importMutation,
    saveAnalysisMutation,
    deleteAnalysisMutation,
    deleteMutation,
    archiveMutation,
    restoreMutation,
    moveToTestMutation,
    moveToActiveMutation,
    deletePersonMutation,
    createNetworkMutation,
    updateNetworkMutation,
    deleteNetworkMutation,
    syncNowMutation,
  };
}
