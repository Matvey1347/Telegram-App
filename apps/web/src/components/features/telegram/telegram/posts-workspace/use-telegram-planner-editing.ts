"use client";

import { telegramPostKeys } from "@/lib/query-keys";
import { invalidateManagedPostScheduleReads } from "@/components/features/telegram/telegram/managed-post-cache";
import { telegramChannelsApi, type TelegramChannelTimePost } from "@/lib/api";
import { type TelegramPostPlannerFormat } from "@telegram-system/shared";
import {
  type PlannerSlotDisplayGroup,
  type PlannerSlotEditDraft,
  type PlannerFormatDraft,
} from "./telegram-post-workspace-model";
import type { useTelegramWorkspaceView } from "./use-telegram-workspace-view";
import type { TelegramPostWorkspaceProps } from "./telegram-post-workspace-model";
import type { useTelegramCalendarState } from "./use-telegram-calendar-state";
import type { useTelegramPostWorkspaceQueries } from "./use-telegram-post-workspace-queries";
import type { useTelegramCalendarModel } from "./use-telegram-calendar-model";

type Input = Pick<
  ReturnType<typeof useTelegramWorkspaceView>,
  | "queryClient"
  | "pushToast"
  | "localizedApiError"
  | "t"
  | "startOperation"
  | "locale"
> &
  Pick<TelegramPostWorkspaceProps, "channelId"> &
  Pick<
    ReturnType<typeof useTelegramCalendarState>,
    | "autoPlannerBusy"
    | "setAutoPlannerBusy"
    | "newPlannerFormatName"
    | "newPlannerFormatIcon"
    | "setNewPlannerFormatName"
    | "setNewPlannerFormatIcon"
    | "plannerSlotDraftsByFormatId"
    | "setPlannerSlotDraftsByFormatId"
    | "setPlannerSlotEditDraftsById"
    | "plannerSlotEditDraftsById"
    | "setEditingPlannerSlotGroupIds"
    | "setPlannerFormatDraftsById"
    | "plannerFormatDraftsById"
    | "setEditingPlannerFormatIds"
  > &
  Pick<ReturnType<typeof useTelegramPostWorkspaceQueries>, "plannerFormats"> &
  Pick<
    ReturnType<typeof useTelegramCalendarModel>,
    "plannerTimePostsById" | "plannerSlotsByFormatId"
  >;

export function useTelegramPlannerEditing(input: Input) {
  const {
    queryClient,
    pushToast,
    localizedApiError,
    t,
    startOperation,
    locale,
    channelId,
    autoPlannerBusy,
    setAutoPlannerBusy,
    newPlannerFormatName,
    newPlannerFormatIcon,
    setNewPlannerFormatName,
    setNewPlannerFormatIcon,
    plannerSlotDraftsByFormatId,
    setPlannerSlotDraftsByFormatId,
    setPlannerSlotEditDraftsById,
    plannerSlotEditDraftsById,
    setEditingPlannerSlotGroupIds,
    setPlannerFormatDraftsById,
    plannerFormatDraftsById,
    setEditingPlannerFormatIds,
    plannerFormats,
    plannerTimePostsById,
    plannerSlotsByFormatId,
  } = input;

  const invalidatePlannerCalendar = async () => {
    await Promise.all([
      queryClient.invalidateQueries({
        queryKey: telegramPostKeys.managedLists(channelId),
      }),
      invalidateManagedPostScheduleReads(queryClient, channelId),
      queryClient.invalidateQueries({
        queryKey: [
          "telegram-ad-availability",
          "telegram-posts-overlay",
          channelId,
        ],
      }),
      queryClient.invalidateQueries({
        queryKey: telegramPostKeys.postGroups(channelId),
      }),
      queryClient.invalidateQueries({
        queryKey: telegramPostKeys.plannerFormats(channelId),
      }),
      queryClient.invalidateQueries({
        queryKey: telegramPostKeys.plannerSlots(channelId),
      }),
      queryClient.invalidateQueries({
        queryKey: telegramPostKeys.linkTargets(channelId),
      }),
    ]);
  };

  const runPlannerMutation = async (
    action: () => Promise<unknown>,
    successMessage: string,
  ) => {
    if (autoPlannerBusy) return;
    setAutoPlannerBusy(true);
    try {
      await action();
      await invalidatePlannerCalendar();
      pushToast(successMessage, "success");
    } catch (error) {
      pushToast(
        localizedApiError(
          error,
          t("telegram.posts.calendar.error.updatePlanner"),
        ),
        "error",
      );
    } finally {
      setAutoPlannerBusy(false);
    }
  };

  const createPlannerFormat = async () => {
    const name = newPlannerFormatName.trim();
    if (!name || autoPlannerBusy) return;
    setAutoPlannerBusy(true);
    try {
      await telegramChannelsApi.createPostPlannerFormat(channelId, {
        name,
        icon: newPlannerFormatIcon.trim() || null,
        position: plannerFormats.data?.length ?? 0,
      });
      setNewPlannerFormatName("");
      setNewPlannerFormatIcon("");
      await invalidatePlannerCalendar();
      pushToast(t("telegram.posts.calendar.formatCreated"), "success");
    } catch (error) {
      pushToast(
        localizedApiError(
          error,
          t("telegram.posts.calendar.error.createFormat"),
        ),
        "error",
      );
    } finally {
      setAutoPlannerBusy(false);
    }
  };

  const createPlannerSlot = async (formatId: string) => {
    const draft = plannerSlotDraftsByFormatId[formatId];
    const timePosts = (draft?.timePostIds || [])
      .map((timePostId) => plannerTimePostsById.get(timePostId))
      .filter((timePost): timePost is TelegramChannelTimePost =>
        Boolean(timePost),
      );
    if (!timePosts.length || autoPlannerBusy) return;
    setAutoPlannerBusy(true);
    try {
      const basePosition = plannerSlotsByFormatId.get(formatId)?.length ?? 0;
      const operation = startOperation({
        id: `planner-slots-create:${channelId}:${formatId}`,
        title: t("telegram.posts.calendar.createSlots"),
        message: t("telegram.posts.calendar.starting"),
        current: 0,
        total: timePosts.length,
      });
      let successful = 0;
      let failed = 0;
      const result =
        await telegramChannelsApi.mutatePostPlannerSlotsWithProgress(
          channelId,
          timePosts.map((timePost, index) => ({
            action: "CREATE" as const,
            data: {
              formatId,
              postGroupIds: draft?.groupIds || [],
              weekday: 1,
              time: timePost.time,
              position: basePosition + index,
            },
          })),
          (item, current, total) => {
            if (item.success) successful += 1;
            else failed += 1;
            operation.update({
              message:
                (locale === "en" ? item.message : null) ||
                t("telegram.posts.calendar.updating"),
              current,
              total,
              progressSummary: { successful, failed },
            });
          },
        );
      const completion = {
        message: t("telegram.posts.calendar.result", {
          successful: result.successCount,
          failed: result.failedCount,
        }),
      };
      if (result.failedCount) operation.fail(completion);
      else operation.succeed(completion);
      setPlannerSlotDraftsByFormatId((current) => ({
        ...current,
        [formatId]: { timePostIds: [], groupIds: [] },
      }));
      await invalidatePlannerCalendar();
      pushToast(
        timePosts.length === 1
          ? t("telegram.posts.calendar.slotCreated")
          : t("telegram.posts.calendar.slotsCreated", {
              count: timePosts.length,
            }),
        result.failedCount ? "info" : "success",
      );
    } catch (error) {
      pushToast(
        localizedApiError(error, t("telegram.posts.calendar.error.createSlot")),
        "error",
      );
    } finally {
      setAutoPlannerBusy(false);
    }
  };

  const updatePlannerSlotGroupEditDraft = (
    slotGroup: PlannerSlotDisplayGroup,
    patch: Partial<PlannerSlotEditDraft>,
  ) => {
    setPlannerSlotEditDraftsById((current) => {
      const currentDraft = current[slotGroup.id] ?? {
        timePostIds: slotGroup.timePostIds,
        groupIds: slotGroup.groupIds,
      };
      return {
        ...current,
        [slotGroup.id]: {
          ...currentDraft,
          ...patch,
        },
      };
    });
  };

  const resetPlannerSlotEditDraft = (slotId: string) => {
    setPlannerSlotEditDraftsById((current) => {
      const next = { ...current };
      delete next[slotId];
      return next;
    });
  };

  const savePlannerSlotGroupEditDraft = async (
    slotGroup: PlannerSlotDisplayGroup,
  ) => {
    const draft = plannerSlotEditDraftsById[slotGroup.id] ?? {
      timePostIds: slotGroup.timePostIds,
      groupIds: slotGroup.groupIds,
    };
    const timePosts = draft.timePostIds
      .map((timePostId) => plannerTimePostsById.get(timePostId))
      .filter((timePost): timePost is TelegramChannelTimePost =>
        Boolean(timePost),
      );
    if (!timePosts.length) {
      pushToast(t("telegram.posts.calendar.timeRequired"), "error");
      return;
    }
    await runPlannerMutation(
      async () => {
        const [templateSlot] = slotGroup.slots;
        if (!templateSlot) {
          throw new Error(t("telegram.posts.calendar.error.slotMissing"));
        }
        const existingSlots = slotGroup.slots;
        const slotsToUpdate = existingSlots.slice(0, timePosts.length);
        const slotsToDelete = existingSlots.slice(timePosts.length);
        const timePostsToCreate = timePosts.slice(existingSlots.length);
        const formatSlots = templateSlot.formatId
          ? plannerSlotsByFormatId.get(templateSlot.formatId) || []
          : [];
        const basePosition = formatSlots.length;

        const mutations = [
          ...slotsToUpdate.map((existingSlot, index) => ({
            action: "UPDATE" as const,
            slotId: existingSlot.id,
            data: {
              postGroupIds: draft.groupIds,
              time: timePosts[index]?.time ?? existingSlot.time,
            },
          })),
          ...timePostsToCreate.map((timePost, index) => ({
            action: "CREATE" as const,
            data: {
              formatId: templateSlot.formatId,
              postGroupIds: draft.groupIds,
              weekday: templateSlot.weekday,
              time: timePost.time,
              timezone: templateSlot.timezone,
              position: basePosition + index,
              isActive: templateSlot.isActive,
            },
          })),
          ...slotsToDelete.map((existingSlot) => ({
            action: "DELETE" as const,
            slotId: existingSlot.id,
          })),
        ];
        let successful = 0;
        let failed = 0;
        const operation = startOperation({
          id: `planner-slots-save:${channelId}:${slotGroup.id}`,
          title: t("telegram.posts.calendar.updateSlots"),
          message: t("telegram.posts.calendar.starting"),
          current: 0,
          total: mutations.length,
        });
        const result =
          await telegramChannelsApi.mutatePostPlannerSlotsWithProgress(
            channelId,
            mutations,
            (item, current, total) => {
              if (item.success) successful += 1;
              else failed += 1;
              operation.update({
                message:
                  (locale === "en" ? item.message : null) ||
                  t("telegram.posts.calendar.updating"),
                current,
                total,
                progressSummary: { successful, failed },
              });
            },
          );
        const completion = {
          message: t("telegram.posts.calendar.result", {
            successful: result.successCount,
            failed: result.failedCount,
          }),
        };
        if (result.failedCount) operation.fail(completion);
        else operation.succeed(completion);
        if (result.failedCount) throw new Error(completion.message);
        resetPlannerSlotEditDraft(slotGroup.id);
        setEditingPlannerSlotGroupIds((current) =>
          current.filter((id) => id !== slotGroup.id),
        );
      },
      timePosts.length === 1
        ? t("telegram.posts.calendar.slotUpdated")
        : t("telegram.posts.calendar.slotsSaved", { count: timePosts.length }),
    );
  };

  const updatePlannerFormatDraft = (
    format: TelegramPostPlannerFormat,
    patch: Partial<PlannerFormatDraft>,
  ) => {
    setPlannerFormatDraftsById((current) => {
      const currentDraft = current[format.id] ?? {
        name: format.name,
        icon: format.icon ?? "",
      };
      return {
        ...current,
        [format.id]: {
          ...currentDraft,
          ...patch,
        },
      };
    });
  };

  const savePlannerFormatDraft = async (format: TelegramPostPlannerFormat) => {
    const draft = plannerFormatDraftsById[format.id];
    if (!draft || autoPlannerBusy) return;
    const name = draft.name.trim();
    if (!name) {
      pushToast(t("telegram.posts.calendar.nameRequired"), "error");
      return;
    }
    await runPlannerMutation(async () => {
      await telegramChannelsApi.updatePostPlannerFormat(channelId, format.id, {
        name,
        icon: draft.icon.trim() || null,
      });
      setPlannerFormatDraftsById((current) => {
        const { [format.id]: _removed, ...rest } = current;
        return rest;
      });
      setEditingPlannerFormatIds((current) =>
        current.filter((id) => id !== format.id),
      );
    }, t("telegram.posts.calendar.formatUpdated"));
  };

  return {
    invalidatePlannerCalendar,
    runPlannerMutation,
    createPlannerFormat,
    createPlannerSlot,
    updatePlannerSlotGroupEditDraft,
    resetPlannerSlotEditDraft,
    savePlannerSlotGroupEditDraft,
    updatePlannerFormatDraft,
    savePlannerFormatDraft,
  };
}
