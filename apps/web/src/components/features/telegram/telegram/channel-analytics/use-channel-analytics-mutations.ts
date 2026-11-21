"use client";

import { formatStatsPeriod } from "@/components/features/telegram/telegram/telegram-channel-graphs";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { DEFAULT_CHANNEL_SYNC_SELECTION } from "@/components/features/telegram/telegram/channel-sync-scope-modal";
import {
  syncTelegramChannelNowWithProgress,
  telegramChannelsApi,
  type TelegramChannelSyncNowPayload,
  type TelegramChannelSyncSelection,
} from "@/lib/api";
import { scheduleProgressDismiss, syncProgressToToast } from "@/lib/progress";
import {
  invalidateTelegramChannelQueries,
  invalidateTelegramPostMetricReads,
} from "@/lib/features/telegram/telegram-query-invalidation";
import { useAppToast } from "@/providers/toast-provider";
import { toNumber, formatNumber } from "./channel-analytics-format";
import type { useChannelAnalyticsQueries } from "./use-channel-analytics-queries";

export function summarizeSync(result: any) {
  const status = result?.status || "success";
  const steps = Array.isArray(result?.steps) ? result.steps : [];
  const historical = result?.historical || {};
  const publicInfo = result?.publicInfo || {};
  const posts = result?.postsMetricsSync || {};
  const olderPosts = result?.olderPostsBackfill || {};
  const stats = result?.channelStatsSync || {};
  const managedPosts = result?.managedPostsSync || {};
  const importedLinks = toNumber(historical.imported);
  const updatedLinks = toNumber(historical.updated);
  const dailyRows = toNumber(historical.postsUpdated);
  const syncedPosts = toNumber(posts.syncedPosts);
  const olderSyncedPosts = toNumber(olderPosts.syncedPosts);
  const points = toNumber(stats.pointsUpserted);
  const syncedManagedPosts = Array.isArray(managedPosts.posts)
    ? managedPosts.posts.length
    : 0;
  const failedSteps = steps.filter((step: any) => step?.status === "failed");
  const skippedSteps = steps.filter((step: any) => step?.status === "skipped");
  const period = formatStatsPeriod(
    stats.snapshot?.normalizedStats?.period,
    stats.snapshot?.normalizedStats?.graphs,
  );
  const linkText =
    importedLinks || updatedLinks
      ? `Invite links: added ${importedLinks}, updated ${updatedLinks}.`
      : "Invite links: no new or changed links.";
  const inviteGapText =
    historical.inviteLinksScope === "PARTIAL_ADMINS"
      ? `Invite links fetched ${toNumber(historical.inviteLinksFetchedTotal)} of ${toNumber(historical.inviteLinksExpectedTotal)} expected, missing ${toNumber(historical.inviteLinksMissingTotal)}.`
      : null;
  const postText =
    dailyRows || syncedPosts || olderSyncedPosts
      ? `Posts: refreshed ${syncedPosts} post metrics, backfilled ${olderSyncedPosts} older posts, and ${dailyRows} daily rows.`
      : "Posts: no post updates returned.";
  const statsText = stats.success
    ? `Analytics: loaded ${points} chart points${period !== "-" ? ` for ${period}` : ""}.`
    : `Analytics: not updated${stats.snapshot?.normalizedStats?.status ? ` (${stats.snapshot.normalizedStats.status})` : ""}.`;
  const publicText = publicInfo.updated
    ? `Channel info: refreshed${publicInfo.subscribersCount != null ? `, ${formatNumber(publicInfo.subscribersCount)} subscribers` : ""}.`
    : publicInfo.reason
      ? `Channel info: not updated (${publicInfo.reason}).`
      : "Channel info: refreshed.";
  const managedPostsText = syncedManagedPosts
    ? `Managed posts: refreshed ${syncedManagedPosts}.`
    : "Managed posts: no changes returned.";
  const statusText =
    status === "partial"
      ? "Sync completed partially."
      : status === "failed"
        ? "Sync failed."
        : "Sync completed.";
  const notes = [
    inviteGapText,
    failedSteps.length ? `Failed steps: ${failedSteps.length}.` : null,
    skippedSteps.length ? `Skipped steps: ${skippedSteps.length}.` : null,
  ]
    .filter(Boolean)
    .join(" ");
  return `${statusText}\n${publicText}\n${linkText}\n${postText}\n${statsText}\n${managedPostsText}${notes ? `\n${notes}` : ""}`;
}

function countSelectedSyncSections(selection: TelegramChannelSyncSelection) {
  return Object.values(selection).filter(Boolean).length;
}

type MutationQueries = Pick<
  ReturnType<typeof useChannelAnalyticsQueries>,
  "channel" | "setSyncScopeOpen" | "setLastSyncResult"
>;
export function useChannelAnalyticsMutations(
  id: string,
  queries: MutationQueries,
) {
  const { channel, setSyncScopeOpen, setLastSyncResult } = queries;
  const queryClient = useQueryClient();
  const { pushToast, setProgress, clearProgress } = useAppToast();

  const syncMutation = useMutation({
    mutationFn: async (payload: TelegramChannelSyncNowPayload) => {
      const progressId = `telegram-channel-sync:${id}`;
      const progressTitle = `Sync ${channel?.title || "channel"}`;
      const syncSelection: TelegramChannelSyncSelection = {
        syncIncludePublicInfo:
          payload.syncIncludePublicInfo ??
          DEFAULT_CHANNEL_SYNC_SELECTION.syncIncludePublicInfo,
        syncIncludeInviteLinks:
          payload.syncIncludeInviteLinks ??
          DEFAULT_CHANNEL_SYNC_SELECTION.syncIncludeInviteLinks,
        syncIncludeHistoricalPosts:
          payload.syncIncludeHistoricalPosts ??
          DEFAULT_CHANNEL_SYNC_SELECTION.syncIncludeHistoricalPosts,
        syncIncludePostMetrics:
          payload.syncIncludePostMetrics ??
          DEFAULT_CHANNEL_SYNC_SELECTION.syncIncludePostMetrics,
        syncIncludeOlderPosts:
          payload.syncIncludeOlderPosts ??
          DEFAULT_CHANNEL_SYNC_SELECTION.syncIncludeOlderPosts,
        syncIncludeChannelStats:
          payload.syncIncludeChannelStats ??
          DEFAULT_CHANNEL_SYNC_SELECTION.syncIncludeChannelStats,
        syncIncludeManagedPosts:
          payload.syncIncludeManagedPosts ??
          DEFAULT_CHANNEL_SYNC_SELECTION.syncIncludeManagedPosts,
        syncIncludeAudienceSnapshot:
          payload.syncIncludeAudienceSnapshot ??
          DEFAULT_CHANNEL_SYNC_SELECTION.syncIncludeAudienceSnapshot,
      };
      const totalSelectedSteps = Math.max(
        1,
        countSelectedSyncSections(syncSelection),
      );
      setProgress({
        id: progressId,
        title: progressTitle,
        current: 0,
        total: totalSelectedSteps,
        message: "Starting sync…",
        iconUrl: channel?.photoUrl || undefined,
      });
      try {
        const result = await syncTelegramChannelNowWithProgress(
          id,
          (item, current, total) => {
            setProgress(
              syncProgressToToast({
                id: progressId,
                title: progressTitle,
                item,
                current,
                total,
                iconUrl: channel?.photoUrl || undefined,
              }),
            );
          },
          payload,
        );
        const partial = result?.status === "partial";
        const failed = result?.status === "failed";
        setProgress({
          id: progressId,
          title: progressTitle,
          current: totalSelectedSteps,
          total: totalSelectedSteps,
          message: failed
            ? "Channel sync failed"
            : partial
              ? "Channel sync completed partially"
              : "Channel sync completed",
          completed: !failed,
          successCount: failed ? 0 : partial ? 0 : 1,
          failedCount: failed ? 1 : 0,
          skippedCount: partial ? 1 : 0,
          iconUrl: channel?.photoUrl || undefined,
        });
        scheduleProgressDismiss(clearProgress, progressId);
        return result;
      } catch (error) {
        clearProgress(progressId);
        throw error;
      }
    },
    onSettled: () =>
      invalidateTelegramChannelQueries(queryClient, id, {
        sourceAccessChanged: true,
      }),
    onSuccess: (result) => {
      setSyncScopeOpen(false);
      setLastSyncResult(result);
      pushToast(
        summarizeSync(result),
        result?.status === "partial" ? "info" : "success",
        8000,
      );
    },
    onError: (error: any) =>
      pushToast(error?.response?.data?.message || "Sync failed.", "error"),
  });

  const manualMetricsMutation = useMutation({
    mutationFn: ({
      postId,
      payload,
    }: {
      postId: string;
      payload: {
        manualOwnViews?: number;
        manualOwnReactions?: number;
        excludeFromAnalytics?: boolean;
      };
    }) => telegramChannelsApi.updatePostManualMetrics(id, postId, payload),
    onSuccess: () => {
      void invalidateTelegramPostMetricReads(queryClient, id);
      pushToast("Post correction saved.", "success");
    },
    onError: (error: any) =>
      pushToast(
        error?.response?.data?.message || "Failed to save post correction.",
        "error",
      ),
  });

  return { syncMutation, manualMetricsMutation };
}
