"use client";

import { useMemo, useEffect } from "react";
import {
  buildCalendarDays,
  toLocalDateKey,
} from "@/components/features/telegram/telegram/telegram-posts-calendar-view";
import {
  type TelegramManagedPostCalendarResult,
  type TelegramPostPlannerSlot,
  type ScheduleManagedPostsBatchItem,
} from "@telegram-system/shared";
import {
  buildCalendarDayScheduleSlots,
  getCalendarSchedulablePosts,
  getCalendarPlanImportPosts,
  sortScheduleManagedPostAssignments,
} from "@/lib/features/telegram/telegram-calendar-scheduler";
import { telegramPostGroupTitle } from "@/components/features/telegram/telegram/telegram-post-group-title";
import { normalizePlannerFormatWeights } from "@/lib/features/telegram/telegram-planner-weights";
import { canScheduleManagedPost } from "@/components/features/telegram/telegram/managed-post-internal-links-notice";
import { type TelegramManagedPost } from "@/lib/api";
import {
  isValidTimeInputValue,
  canonicalizeTimeInputValue,
} from "@/components/ui/primitives";
import { zonedDateTimeToUtc } from "@/lib/features/growth/telegram-ad-sales";
import { formatDateWithWeekday } from "@/lib/date-format";
import {
  type PlannerSlotDisplayGroup,
  plannerSlotDisplayGroupKey,
  type EffectivePostGroup,
} from "./telegram-post-workspace-model";
import type { useTelegramCalendarState } from "./use-telegram-calendar-state";
import type { useTelegramPostWorkspaceQueries } from "./use-telegram-post-workspace-queries";
import type { TelegramPostWorkspaceProps } from "./telegram-post-workspace-model";
import type { useTelegramWorkspaceView } from "./use-telegram-workspace-view";
import type { useTelegramPostEditorContext } from "./use-telegram-post-editor-context";

type Input = Pick<
  ReturnType<typeof useTelegramCalendarState>,
  | "calendarMonth"
  | "selectedCalendarDate"
  | "plannerFormatWeights"
  | "calendarPostSearch"
  | "calendarBatchSelectedPostIds"
  | "calendarBatchTimeChoiceByPostId"
  | "calendarBatchCustomTimeByPostId"
  | "setCalendarBatchSelectedPostIds"
  | "setCalendarBatchTimeChoiceByPostId"
  | "setCalendarBatchCustomTimeByPostId"
> &
  Pick<
    ReturnType<typeof useTelegramPostWorkspaceQueries>,
    | "calendarData"
    | "adCalendarOverlay"
    | "postGroups"
    | "plannerSlots"
    | "plannerFormats"
    | "posts"
  > &
  Pick<
    TelegramPostWorkspaceProps,
    "channelTimePosts" | "channelTelegramChatId" | "workspaceTimezone"
  > &
  Pick<ReturnType<typeof useTelegramWorkspaceView>, "t" | "locale"> &
  Pick<
    ReturnType<typeof useTelegramPostEditorContext>,
    | "effectivePostGroup"
    | "postGroupsById"
    | "telegramImportedSystemGroup"
    | "effectivePostGroupId"
  >;

export function useTelegramCalendarModel(input: Input) {
  const {
    calendarMonth,
    selectedCalendarDate,
    plannerFormatWeights,
    calendarPostSearch,
    calendarBatchSelectedPostIds,
    calendarBatchTimeChoiceByPostId,
    calendarBatchCustomTimeByPostId,
    setCalendarBatchSelectedPostIds,
    setCalendarBatchTimeChoiceByPostId,
    setCalendarBatchCustomTimeByPostId,
    calendarData,
    adCalendarOverlay,
    postGroups,
    plannerSlots,
    plannerFormats,
    posts,
    channelTimePosts,
    channelTelegramChatId,
    workspaceTimezone,
    t,
    locale,
    effectivePostGroup,
    postGroupsById,
    telegramImportedSystemGroup,
    effectivePostGroupId,
  } = input;

  const calendarDays = useMemo(
    () => buildCalendarDays(calendarMonth),
    [calendarMonth],
  );

  const calendarItemsByDay = useMemo(() => {
    const grouped = new Map<
      string,
      TelegramManagedPostCalendarResult["items"]
    >();
    for (const item of calendarData.data?.items || []) {
      const key = toLocalDateKey(
        item.status === "SCHEDULED"
          ? item.scheduledAt || item.publishedAt || new Date()
          : item.publishedAt || item.scheduledAt || new Date(),
      );
      grouped.set(key, [...(grouped.get(key) || []), item]);
    }
    for (const [key, items] of grouped) {
      grouped.set(
        key,
        [...items].sort((left, right) => {
          const leftDate = new Date(
            left.status === "SCHEDULED"
              ? left.scheduledAt || 0
              : left.publishedAt || 0,
          ).getTime();
          const rightDate = new Date(
            right.status === "SCHEDULED"
              ? right.scheduledAt || 0
              : right.publishedAt || 0,
          ).getTime();
          return leftDate - rightDate;
        }),
      );
    }
    return grouped;
  }, [calendarData.data]);

  const selectedCalendarItems =
    calendarItemsByDay.get(selectedCalendarDate) || [];

  const adCalendarItemsByDay = useMemo(() => {
    const grouped = new Map<
      string,
      Array<NonNullable<typeof adCalendarOverlay.data>["slots"][number]>
    >();
    for (const item of adCalendarOverlay.data?.slots || []) {
      if (item.state === "AVAILABLE") continue;
      const key = toLocalDateKey(item.scheduledAt);
      grouped.set(key, [...(grouped.get(key) || []), item]);
    }
    for (const [key, items] of grouped) {
      grouped.set(
        key,
        [...items].sort((left, right) =>
          left.scheduledAt.localeCompare(right.scheduledAt),
        ),
      );
    }
    return grouped;
  }, [adCalendarOverlay.data]);

  const selectedAdCalendarItems =
    adCalendarItemsByDay.get(selectedCalendarDate) || [];

  const calendarPresetScheduleSlots = useMemo(
    () =>
      buildCalendarDayScheduleSlots({
        dateKey: selectedCalendarDate,
        timePosts: channelTimePosts,
        items: selectedCalendarItems,
      }),
    [channelTimePosts, selectedCalendarDate, selectedCalendarItems],
  );

  const calendarScheduleSlots = calendarPresetScheduleSlots;

  const calendarPresetSlotByTime = useMemo(
    () =>
      new Map(
        calendarPresetScheduleSlots.map((slot) => [slot.time, slot] as const),
      ),
    [calendarPresetScheduleSlots],
  );

  const plannerGroupOptions = useMemo(
    () =>
      (postGroups.data || []).map((group) => ({
        value: group.id,
        label: telegramPostGroupTitle(group, t),
        iconEmoji:
          group.iconPresentation?.type === "unicode"
            ? group.iconPresentation.value
            : undefined,
        iconUrl:
          group.iconPresentation?.type === "image"
            ? group.iconPresentation.url
            : undefined,
        iconFallback: telegramPostGroupTitle(group, t),
      })),
    [postGroups.data, t],
  );

  const plannerTimePostOptions = useMemo(
    () =>
      channelTimePosts.map((slot) => ({
        value: slot.id,
        label: `${slot.time} · ${slot.title}`,
        iconEmoji:
          slot.iconPresentation?.type === "unicode"
            ? slot.iconPresentation.value
            : undefined,
        iconUrl:
          slot.iconPresentation?.type === "image"
            ? slot.iconPresentation.url
            : undefined,
        iconFallback: slot.title,
      })),
    [channelTimePosts],
  );

  const plannerTimePostsById = useMemo(
    () => new Map(channelTimePosts.map((slot) => [slot.id, slot])),
    [channelTimePosts],
  );

  const plannerTimePostsByTime = useMemo(
    () => new Map(channelTimePosts.map((slot) => [slot.time, slot])),
    [channelTimePosts],
  );

  const plannerSlotsByFormatId = useMemo(() => {
    const grouped = new Map<string, TelegramPostPlannerSlot[]>();
    for (const slot of plannerSlots.data || []) {
      if (!slot.formatId) continue;
      const current = grouped.get(slot.formatId) || [];
      current.push(slot);
      grouped.set(slot.formatId, current);
    }
    for (const slots of grouped.values()) {
      slots.sort(
        (left, right) =>
          left.position - right.position || left.time.localeCompare(right.time),
      );
    }
    return grouped;
  }, [plannerSlots.data]);

  const plannerSlotGroupsByFormatId = useMemo(() => {
    const groupedByFormat = new Map<string, PlannerSlotDisplayGroup[]>();
    for (const [formatId, slots] of plannerSlotsByFormatId) {
      const grouped = new Map<string, PlannerSlotDisplayGroup>();
      for (const slot of slots) {
        const key = plannerSlotDisplayGroupKey(slot);
        const timePostId = plannerTimePostsByTime.get(slot.time)?.id ?? "";
        const current =
          grouped.get(key) ??
          ({
            id: slot.id,
            slots: [],
            timePostIds: [],
            groupIds: slot.postGroupIds,
          } satisfies PlannerSlotDisplayGroup);
        current.slots.push(slot);
        if (timePostId && !current.timePostIds.includes(timePostId)) {
          current.timePostIds.push(timePostId);
        }
        grouped.set(key, current);
      }
      groupedByFormat.set(formatId, Array.from(grouped.values()));
    }
    return groupedByFormat;
  }, [plannerSlotsByFormatId, plannerTimePostsByTime]);

  const plannerFormatsWithWeights = useMemo(() => {
    const formats = plannerFormats.data || [];
    const normalizedWeights = normalizePlannerFormatWeights(
      formats.map((format) => format.id),
      plannerFormatWeights,
    );
    return formats.map((format) => ({
      format,
      weight: normalizedWeights[format.id] ?? 0,
      slots: plannerSlotsByFormatId.get(format.id) || [],
    }));
  }, [plannerFormatWeights, plannerFormats.data, plannerSlotsByFormatId]);

  const hasEnabledPlannerFormatWeight = plannerFormatsWithWeights.some(
    (item) => item.weight > 0,
  );

  const hasPlannerFormatSlots = plannerFormatsWithWeights.some(
    (item) => item.slots.length > 0,
  );

  const canUsePlannerFormatSlots =
    hasPlannerFormatSlots && hasEnabledPlannerFormatWeight;

  const calendarSchedulablePosts = useMemo(() => {
    const managedPosts = posts.data || [];
    return getCalendarSchedulablePosts(managedPosts).filter((post) =>
      canScheduleManagedPost(post, managedPosts, channelTelegramChatId),
    );
  }, [channelTelegramChatId, posts.data]);

  const calendarPlanImportPosts = useMemo(
    () =>
      getCalendarPlanImportPosts(posts.data || []).filter((post) =>
        canScheduleManagedPost(post, posts.data || [], channelTelegramChatId),
      ),
    [channelTelegramChatId, posts.data],
  );

  const calendarFilteredSchedulablePosts = useMemo(() => {
    const search = calendarPostSearch.trim().toLocaleLowerCase();
    if (!search) return calendarSchedulablePosts;
    return calendarSchedulablePosts.filter((post) => {
      const title = post.title.toLocaleLowerCase();
      const groupTitle =
        effectivePostGroup(post)?.title?.toLocaleLowerCase() || "";
      return title.includes(search) || groupTitle.includes(search);
    });
  }, [
    calendarPostSearch,
    calendarSchedulablePosts,
    postGroupsById,
    telegramImportedSystemGroup,
  ]);

  const calendarSchedulablePostsById = useMemo(
    () => new Map(calendarSchedulablePosts.map((post) => [post.id, post])),
    [calendarSchedulablePosts],
  );

  const calendarGroupedSchedulablePosts = useMemo(() => {
    const grouped = new Map<
      string,
      { group: EffectivePostGroup; posts: TelegramManagedPost[] }
    >();
    const ungrouped: TelegramManagedPost[] = [];
    for (const post of calendarFilteredSchedulablePosts) {
      const group = effectivePostGroup(post);
      const groupId = effectivePostGroupId(post);
      if (!groupId || !group) {
        ungrouped.push(post);
        continue;
      }
      const current = grouped.get(groupId);
      if (current) {
        current.posts.push(post);
      } else {
        grouped.set(groupId, { group, posts: [post] });
      }
    }
    return { groups: [...grouped.values()], ungrouped };
  }, [
    calendarFilteredSchedulablePosts,
    postGroupsById,
    telegramImportedSystemGroup,
  ]);

  const calendarBatchSelectedPosts = useMemo(
    () =>
      calendarBatchSelectedPostIds
        .map((postId) => calendarSchedulablePostsById.get(postId))
        .filter((post): post is TelegramManagedPost => Boolean(post)),
    [calendarBatchSelectedPostIds, calendarSchedulablePostsById],
  );

  const calendarBatchPlan = useMemo(() => {
    const assignments: ScheduleManagedPostsBatchItem[] = [];
    const invalidPostIds: string[] = [];
    const duplicatePostIds: string[] = [];
    const usedTimes = new Map<string, string>();
    const selectedSlotByTime = new Map(
      calendarScheduleSlots.map((slot) => [slot.time, slot]),
    );

    for (const postId of calendarBatchSelectedPostIds) {
      const choice = calendarBatchTimeChoiceByPostId[postId] || "";
      if (!choice) {
        invalidPostIds.push(postId);
        continue;
      }
      let resolvedTime = "";
      if (choice.startsWith("slot:")) {
        resolvedTime = choice.slice(5);
        const slot = selectedSlotByTime.get(resolvedTime);
        if (!slot || slot.state !== "available") {
          invalidPostIds.push(postId);
          continue;
        }
      } else if (choice === "custom") {
        const customTime = calendarBatchCustomTimeByPostId[postId] || "";
        if (!isValidTimeInputValue(customTime)) {
          invalidPostIds.push(postId);
          continue;
        }
        const candidate = zonedDateTimeToUtc(
          selectedCalendarDate,
          customTime,
          workspaceTimezone,
        );
        if (!candidate || candidate.getTime() <= Date.now()) {
          invalidPostIds.push(postId);
          continue;
        }
        const slot = selectedSlotByTime.get(customTime);
        if (slot?.state === "occupied" || slot?.state === "past") {
          invalidPostIds.push(postId);
          continue;
        }
        resolvedTime = canonicalizeTimeInputValue(customTime) ?? customTime;
      } else {
        invalidPostIds.push(postId);
        continue;
      }
      if (usedTimes.has(resolvedTime)) {
        duplicatePostIds.push(postId, usedTimes.get(resolvedTime)!);
        continue;
      }
      usedTimes.set(resolvedTime, postId);
      assignments.push({
        postId,
        scheduledAt: zonedDateTimeToUtc(
          selectedCalendarDate,
          resolvedTime,
          workspaceTimezone,
        ).toISOString(),
      });
    }

    const chronologicalAssignments =
      sortScheduleManagedPostAssignments(assignments);
    return {
      assignments: chronologicalAssignments,
      assignedPostIds: chronologicalAssignments.map((item) => item.postId),
      overflowPostIds: [],
      invalidPostIds: [...new Set(invalidPostIds)],
      duplicatePostIds: [...new Set(duplicatePostIds)],
    };
  }, [
    calendarBatchCustomTimeByPostId,
    calendarBatchSelectedPostIds,
    calendarBatchTimeChoiceByPostId,
    calendarScheduleSlots,
    selectedCalendarDate,
    workspaceTimezone,
  ]);

  const availableCalendarScheduleSlots = useMemo(
    () => calendarScheduleSlots.filter((slot) => slot.state === "available"),
    [calendarScheduleSlots],
  );

  const selectedCalendarDateLabel = formatDateWithWeekday(
    `${selectedCalendarDate}T12:00:00`,
    locale,
  );

  useEffect(() => {
    setCalendarBatchSelectedPostIds((current) =>
      current.filter((postId) => calendarSchedulablePostsById.has(postId)),
    );
  }, [calendarSchedulablePostsById]);

  useEffect(() => {
    setCalendarBatchTimeChoiceByPostId({});
    setCalendarBatchCustomTimeByPostId({});
  }, [selectedCalendarDate]);

  return {
    calendarDays,
    calendarItemsByDay,
    selectedCalendarItems,
    adCalendarItemsByDay,
    selectedAdCalendarItems,
    calendarScheduleSlots,
    calendarPresetSlotByTime,
    plannerGroupOptions,
    plannerTimePostOptions,
    plannerTimePostsById,
    plannerTimePostsByTime,
    plannerSlotsByFormatId,
    plannerSlotGroupsByFormatId,
    plannerFormatsWithWeights,
    hasPlannerFormatSlots,
    canUsePlannerFormatSlots,
    calendarSchedulablePosts,
    calendarPlanImportPosts,
    calendarFilteredSchedulablePosts,
    calendarSchedulablePostsById,
    calendarGroupedSchedulablePosts,
    calendarBatchSelectedPosts,
    calendarBatchPlan,
    availableCalendarScheduleSlots,
    selectedCalendarDateLabel,
  };
}
