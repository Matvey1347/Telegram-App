"use client";

import {
  toLocalDateKey,
  addDays,
} from "@/components/features/telegram/telegram/telegram-posts-calendar-view";
import { telegramChannelsApi } from "@/lib/api";
import { type TelegramPostPlannerPreviewResult } from "@telegram-system/shared";
import { serializeCalendarPlanImport } from "@/components/features/telegram/telegram/calendar-plan-import-model";
import type { useTelegramCalendarState } from "./use-telegram-calendar-state";
import type { useTelegramCalendarModel } from "./use-telegram-calendar-model";
import type { TelegramPostWorkspaceProps } from "./telegram-post-workspace-model";
import type { useTelegramWorkspaceView } from "./use-telegram-workspace-view";
import type { useTelegramPlannerEditing } from "./use-telegram-planner-editing";
import type { useTelegramPostEditorContext } from "./use-telegram-post-editor-context";

type Input = Pick<
  ReturnType<typeof useTelegramCalendarState>,
  | "autoPlannerFrom"
  | "autoPlannerDays"
  | "autoPlannerTo"
  | "autoPlannerBusy"
  | "setAutoPlannerBusy"
  | "setAutoPlannerPreview"
  | "setAutoPlannerPreviewSource"
  | "setAutoPlannerRerollOffsetsByDate"
  | "autoPlannerPreview"
  | "autoPlannerRerollOffsetsByDate"
  | "setAutoPlannerRerollingDate"
  | "autoPlannerPreviewSource"
  | "setCalendarPlanImportContent"
> &
  Pick<
    ReturnType<typeof useTelegramCalendarModel>,
    | "plannerFormatsWithWeights"
    | "calendarPlanImportPosts"
    | "calendarSchedulablePosts"
  > &
  Pick<TelegramPostWorkspaceProps, "channelId" | "channelPhotoUrl"> &
  Pick<
    ReturnType<typeof useTelegramWorkspaceView>,
    | "pushToast"
    | "t"
    | "localizedApiError"
    | "setProgress"
    | "locale"
    | "clearProgress"
  > &
  Pick<
    ReturnType<typeof useTelegramPlannerEditing>,
    "invalidatePlannerCalendar"
  > &
  Pick<ReturnType<typeof useTelegramPostEditorContext>, "effectivePostGroupId">;

export function useTelegramAutomaticPlanner(input: Input) {
  const {
    autoPlannerFrom,
    autoPlannerDays,
    autoPlannerTo,
    autoPlannerBusy,
    setAutoPlannerBusy,
    setAutoPlannerPreview,
    setAutoPlannerPreviewSource,
    setAutoPlannerRerollOffsetsByDate,
    autoPlannerPreview,
    autoPlannerRerollOffsetsByDate,
    setAutoPlannerRerollingDate,
    autoPlannerPreviewSource,
    setCalendarPlanImportContent,
    plannerFormatsWithWeights,
    calendarPlanImportPosts,
    calendarSchedulablePosts,
    channelId,
    channelPhotoUrl,
    pushToast,
    t,
    localizedApiError,
    setProgress,
    locale,
    clearProgress,
    invalidatePlannerCalendar,
    effectivePostGroupId,
  } = input;

  const autoPlannerRange = () => {
    const from = autoPlannerFrom;
    const to =
      autoPlannerDays > 0
        ? toLocalDateKey(
            addDays(new Date(`${from}T00:00:00`), autoPlannerDays - 1),
          )
        : autoPlannerTo;
    return { from, to };
  };

  const autoPlannerPreviewPayload = () => {
    const { from, to } = autoPlannerRange();
    const formatWeights = Object.fromEntries(
      plannerFormatsWithWeights.map(({ format, weight }) => [
        format.id,
        weight,
      ]),
    );
    return {
      from,
      to,
      formatIds: plannerFormatsWithWeights
        .filter((item) => item.weight > 0)
        .map((item) => item.format.id),
      formatWeights,
      limit: 50,
    };
  };

  const fillPlannerRange = async () => {
    if (autoPlannerBusy) return;
    setAutoPlannerBusy(true);
    try {
      const result = await telegramChannelsApi.previewPostPlanner(
        channelId,
        autoPlannerPreviewPayload(),
      );
      setAutoPlannerPreview(result);
      setAutoPlannerPreviewSource("system");
      setAutoPlannerRerollOffsetsByDate({});
      pushToast(
        result.summary.plannedPosts
          ? t("telegram.posts.calendar.previewReady", {
              count: result.summary.plannedPosts,
            })
          : result.summary.availableSlots
            ? t("telegram.posts.calendar.noDraftMatches", {
                count: result.summary.availableSlots,
              })
            : t("telegram.posts.calendar.noSlots"),
        result.summary.plannedPosts ? "success" : "info",
      );
    } catch (error) {
      pushToast(
        localizedApiError(error, t("telegram.posts.calendar.error.preview")),
        "error",
      );
    } finally {
      setAutoPlannerBusy(false);
    }
  };

  const rerollAutoPlannerDay = async (date: string) => {
    if (!autoPlannerPreview || autoPlannerBusy) return;
    const rerollOffset = (autoPlannerRerollOffsetsByDate[date] ?? 0) + 1;
    const otherAssignments = autoPlannerPreview.assignments.filter(
      (assignment) => assignment.date !== date,
    );
    setAutoPlannerBusy(true);
    setAutoPlannerRerollingDate(date);
    try {
      const result = await telegramChannelsApi.previewPostPlanner(channelId, {
        ...autoPlannerPreviewPayload(),
        from: date,
        to: date,
        rerollOffset,
        excludePostIds: otherAssignments.map((assignment) => assignment.postId),
      });
      const assignments = [...otherAssignments, ...result.assignments].sort(
        (left, right) =>
          new Date(left.scheduledAt).getTime() -
          new Date(right.scheduledAt).getTime(),
      );
      setAutoPlannerPreview((current) =>
        current
          ? {
              ...current,
              assignments,
              summary: {
                ...current.summary,
                plannedPosts: assignments.length,
                unfilledSlots: Math.max(
                  0,
                  current.summary.availableSlots - assignments.length,
                ),
              },
            }
          : current,
      );
      setAutoPlannerRerollOffsetsByDate((current) => ({
        ...current,
        [date]: rerollOffset,
      }));
    } catch (error) {
      pushToast(
        localizedApiError(error, t("telegram.posts.calendar.error.reroll")),
        "error",
      );
    } finally {
      setAutoPlannerRerollingDate(null);
      setAutoPlannerBusy(false);
    }
  };

  const updateEditedPlannerPreview = (
    preview: TelegramPostPlannerPreviewResult | null,
  ) => {
    setAutoPlannerPreview(preview);
    if (autoPlannerPreviewSource === "import") {
      setCalendarPlanImportContent(
        preview ? serializeCalendarPlanImport(preview) : "",
      );
    }
  };

  const scheduleAutoPlannerPreview = async () => {
    if (!autoPlannerPreview?.assignments.length || autoPlannerBusy) return;
    const assignments = autoPlannerPreview.assignments;
    const uniqueTimes = new Set(
      assignments.map((assignment) => assignment.scheduledAt),
    );
    if (uniqueTimes.size !== assignments.length) {
      pushToast(t("telegram.posts.calendar.duplicatePreview"), "error");
      return;
    }
    const progressId = `auto-planner:${channelId}:${autoPlannerPreview.from}:${autoPlannerPreview.to}`;
    setAutoPlannerBusy(true);
    setProgress({
      id: progressId,
      title: t("telegram.posts.calendar.schedulePlan"),
      current: 0,
      total: assignments.length,
      message: t("telegram.posts.calendar.schedulingPreview", {
        count: assignments.length,
      }),
      iconUrl: channelPhotoUrl || undefined,
      successCount: 0,
      failedCount: 0,
    });
    try {
      let successful = 0;
      let failed = 0;
      const result = await telegramChannelsApi.scheduleManagedPostsBatch(
        channelId,
        {
          items: assignments.map((assignment) => ({
            postId: assignment.postId,
            scheduledAt: assignment.scheduledAt,
          })),
        },
        (item, current, total) => {
          if (item.success) successful += 1;
          else failed += 1;
          setProgress({
            id: progressId,
            title: t("telegram.posts.calendar.schedulePlan"),
            current,
            total,
            message:
              (locale === "en" ? item.message : null) ||
              t("telegram.posts.calendar.schedulingPreviewPosts"),
            iconUrl: channelPhotoUrl || undefined,
            successCount: successful,
            failedCount: failed,
          });
        },
      );
      setProgress({
        id: progressId,
        title: t("telegram.posts.calendar.schedulePlan"),
        current: result.total,
        total: result.total,
        message: t("telegram.posts.calendar.finished"),
        completed: true,
        successCount: result.successCount,
        failedCount: result.failedCount,
        skippedCount: result.skippedCount,
        iconUrl: channelPhotoUrl || undefined,
      });
      window.setTimeout(() => clearProgress(progressId), 2800);
      const failedPostIds = new Set(
        result.results
          .filter((item) => !item.success)
          .map((item) => item.postId),
      );
      if (failedPostIds.size) {
        const remaining = assignments.filter((assignment) =>
          failedPostIds.has(assignment.postId),
        );
        updateEditedPlannerPreview({
          ...autoPlannerPreview,
          assignments: remaining,
          summary: {
            ...autoPlannerPreview.summary,
            plannedPosts: remaining.length,
            unfilledSlots: Math.max(
              0,
              autoPlannerPreview.summary.availableSlots - remaining.length,
            ),
          },
        });
      } else {
        updateEditedPlannerPreview(null);
      }
      await invalidatePlannerCalendar();
      pushToast(
        result.failedCount
          ? t("telegram.posts.calendar.scheduleResult", {
              successful: result.successCount,
              failed: result.failedCount,
            })
          : t("telegram.posts.calendar.scheduledCount", {
              count: result.successCount,
            }),
        result.failedCount ? "info" : "success",
      );
    } catch (error) {
      clearProgress(progressId);
      pushToast(
        localizedApiError(
          error,
          t("telegram.posts.calendar.error.schedulePlan"),
        ),
        "error",
      );
    } finally {
      setAutoPlannerBusy(false);
    }
  };

  const removeAutoPlannerAssignment = (postId: string, scheduledAt: string) => {
    if (!autoPlannerPreview) return;
    const assignments = autoPlannerPreview.assignments.filter(
      (assignment) =>
        assignment.postId !== postId || assignment.scheduledAt !== scheduledAt,
    );
    updateEditedPlannerPreview({
      ...autoPlannerPreview,
      assignments,
      summary: {
        ...autoPlannerPreview.summary,
        plannedPosts: assignments.length,
        unfilledSlots: Math.max(
          0,
          autoPlannerPreview.summary.availableSlots - assignments.length,
        ),
      },
    });
  };

  const replaceAutoPlannerAssignmentPost = (
    currentPostId: string,
    scheduledAt: string,
    nextPostId: string,
  ) => {
    const nextPost = (
      autoPlannerPreviewSource === "import"
        ? calendarPlanImportPosts
        : calendarSchedulablePosts
    ).find((post) => post.id === nextPostId);
    if (!nextPost) return;
    if (
      autoPlannerPreview?.assignments.some(
        (assignment) =>
          assignment.postId === nextPostId &&
          assignment.postId !== currentPostId,
      )
    ) {
      pushToast(t("telegram.posts.calendar.alreadyUsed"), "error");
      return;
    }
    if (!autoPlannerPreview) return;
    updateEditedPlannerPreview({
      ...autoPlannerPreview,
      assignments: autoPlannerPreview.assignments.map((assignment) =>
        assignment.postId === currentPostId &&
        assignment.scheduledAt === scheduledAt
          ? {
              ...assignment,
              postId: nextPost.id,
              title: nextPost.title,
              currentScheduledAt: nextPost.scheduledAt ?? null,
              groupId: effectivePostGroupId(nextPost),
              provenance: {
                ...assignment.provenance,
                groupId: effectivePostGroupId(nextPost),
              },
            }
          : assignment,
      ),
    });
  };

  return {
    fillPlannerRange,
    rerollAutoPlannerDay,
    scheduleAutoPlannerPreview,
    removeAutoPlannerAssignment,
    replaceAutoPlannerAssignmentPost,
  };
}
