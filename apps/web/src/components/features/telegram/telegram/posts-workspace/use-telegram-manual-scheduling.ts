"use client";

import { telegramChannelsApi } from "@/lib/api";
import { telegramPostKeys } from "@/lib/query-keys";
import type { useTelegramCalendarState } from "./use-telegram-calendar-state";
import type { useTelegramCalendarModel } from "./use-telegram-calendar-model";
import type { TelegramPostWorkspaceProps } from "./telegram-post-workspace-model";
import type { useTelegramWorkspaceView } from "./use-telegram-workspace-view";

type Input = Pick<
  ReturnType<typeof useTelegramCalendarState>,
  | "setCalendarBatchSelectedPostIds"
  | "setCalendarBatchTimeChoiceByPostId"
  | "setCalendarBatchCustomTimeByPostId"
  | "calendarBatchBusy"
  | "selectedCalendarDate"
  | "setCalendarBatchBusy"
> &
  Pick<
    ReturnType<typeof useTelegramCalendarModel>,
    "calendarBatchPlan" | "selectedCalendarDateLabel"
  > &
  Pick<TelegramPostWorkspaceProps, "channelId" | "channelPhotoUrl"> &
  Pick<
    ReturnType<typeof useTelegramWorkspaceView>,
    | "setProgress"
    | "t"
    | "locale"
    | "clearProgress"
    | "queryClient"
    | "pushToast"
    | "localizedApiError"
  >;

export function useTelegramManualScheduling(input: Input) {
  const {
    setCalendarBatchSelectedPostIds,
    setCalendarBatchTimeChoiceByPostId,
    setCalendarBatchCustomTimeByPostId,
    calendarBatchBusy,
    selectedCalendarDate,
    setCalendarBatchBusy,
    calendarBatchPlan,
    selectedCalendarDateLabel,
    channelId,
    channelPhotoUrl,
    setProgress,
    t,
    locale,
    clearProgress,
    queryClient,
    pushToast,
    localizedApiError,
  } = input;

  const toggleCalendarBatchPostSelection = (postId: string) => {
    setCalendarBatchSelectedPostIds((current) => {
      if (current.includes(postId)) {
        setCalendarBatchTimeChoiceByPostId((choices) => {
          const next = { ...choices };
          delete next[postId];
          return next;
        });
        setCalendarBatchCustomTimeByPostId((times) => {
          const next = { ...times };
          delete next[postId];
          return next;
        });
        return current.filter((value) => value !== postId);
      }
      return [...current, postId];
    });
  };

  const clearCalendarBatchSelection = () => {
    setCalendarBatchSelectedPostIds([]);
    setCalendarBatchTimeChoiceByPostId({});
    setCalendarBatchCustomTimeByPostId({});
  };

  const scheduleCalendarBatch = async () => {
    const assignments = calendarBatchPlan.assignments;
    if (!assignments.length || calendarBatchBusy) return;
    const progressId = `calendar-batch:${channelId}:${selectedCalendarDate}`;
    setCalendarBatchBusy(true);
    setProgress({
      id: progressId,
      title: t("telegram.posts.calendar.scheduleDay"),
      current: 0,
      total: assignments.length,
      message: t("telegram.posts.calendar.schedulingDay", {
        count: assignments.length,
        date: selectedCalendarDateLabel,
      }),
      iconUrl: channelPhotoUrl || undefined,
    });
    try {
      const result = await telegramChannelsApi.scheduleManagedPostsBatch(
        channelId,
        { items: assignments },
        (item, current, total) => {
          setProgress({
            id: progressId,
            title: t("telegram.posts.calendar.scheduleDay"),
            current,
            total,
            message:
              (locale === "en" ? item.message : null) ||
              t("telegram.posts.calendar.schedulingPosts"),
            iconUrl: channelPhotoUrl || undefined,
          });
        },
      );
      setProgress({
        id: progressId,
        title: t("telegram.posts.calendar.scheduleDay"),
        current: result.total,
        total: result.total,
        message:
          result.failedCount > 0
            ? t("telegram.posts.calendar.finishedForDate", {
                date: selectedCalendarDateLabel,
              })
            : t("telegram.posts.calendar.scheduledForDate", {
                date: selectedCalendarDateLabel,
              }),
        completed: true,
        successCount: result.successCount,
        failedCount: result.failedCount,
        skippedCount: result.skippedCount,
        iconUrl: channelPhotoUrl || undefined,
      });
      window.setTimeout(() => clearProgress(progressId), 2800);
      const successfulIds = new Set(
        result.results
          .filter((item) => item.success && item.action === "SCHEDULED")
          .map((item) => item.postId),
      );
      setCalendarBatchSelectedPostIds((current) =>
        current.filter((postId) => !successfulIds.has(postId)),
      );
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: telegramPostKeys.managedLists(channelId),
        }),
        queryClient.invalidateQueries({
          queryKey: ["telegram-managed-posts-calendar", channelId],
        }),
        queryClient.invalidateQueries({
          queryKey: ["post-groups", channelId],
        }),
        queryClient.invalidateQueries({
          queryKey: ["telegram-managed-post-link-targets", channelId],
        }),
      ]);
      pushToast(
        result.failedCount
          ? t("telegram.posts.calendar.scheduleResult", {
              successful: result.successCount,
              failed: result.failedCount,
            })
          : t("telegram.posts.calendar.scheduledCountForDate", {
              count: result.successCount,
              date: selectedCalendarDateLabel,
            }),
        result.failedCount ? "info" : "success",
      );
    } catch (scheduleError) {
      clearProgress(progressId);
      pushToast(
        localizedApiError(
          scheduleError,
          t("telegram.posts.calendar.error.scheduleDay"),
        ),
        "error",
        7000,
      );
    } finally {
      setCalendarBatchBusy(false);
    }
  };

  return {
    toggleCalendarBatchPostSelection,
    clearCalendarBatchSelection,
    scheduleCalendarBatch,
  };
}
