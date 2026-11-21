"use client";

import {
  snapshotManagedPostPages,
  mapManagedPostPages,
  restoreManagedPostPages,
} from "@/components/features/telegram/telegram/managed-post-cache";
import { type PostGroup, telegramChannelsApi } from "@/lib/api";
import { telegramPostKeys } from "@/lib/query-keys";
import { useEffect } from "react";
import { plannerFormatWeightsPreferenceKey } from "./telegram-post-workspace-model";
import type { useTelegramPostSidebarState } from "./use-telegram-post-sidebar-state";
import type { useTelegramPostSidebarList } from "./use-telegram-post-sidebar-list";
import type { TelegramPostWorkspaceProps } from "./telegram-post-workspace-model";
import type { useTelegramWorkspaceView } from "./use-telegram-workspace-view";
import type { useTelegramCalendarState } from "./use-telegram-calendar-state";

type Input = Pick<
  ReturnType<typeof useTelegramPostSidebarState>,
  | "setCollapsedGroupIdsPreference"
  | "sidebarReorderVersionRef"
  | "sidebarReorderTimerRef"
  | "sidebarReorderQueueRef"
  | "setSidebarOrderKeys"
> &
  Pick<
    ReturnType<typeof useTelegramPostSidebarList>,
    "allGroupIds" | "canonicalSidebarKeys"
  > &
  Pick<TelegramPostWorkspaceProps, "channelId"> &
  Pick<
    ReturnType<typeof useTelegramWorkspaceView>,
    "queryClient" | "pushToast" | "t" | "localizedApiError"
  > &
  Pick<
    ReturnType<typeof useTelegramCalendarState>,
    "setPlannerFormatWeights" | "plannerFormatWeights"
  >;

export function useTelegramSidebarPreferences(input: Input) {
  const {
    setCollapsedGroupIdsPreference,
    sidebarReorderVersionRef,
    sidebarReorderTimerRef,
    sidebarReorderQueueRef,
    setSidebarOrderKeys,
    allGroupIds,
    canonicalSidebarKeys,
    channelId,
    queryClient,
    pushToast,
    t,
    localizedApiError,
    setPlannerFormatWeights,
    plannerFormatWeights,
  } = input;

  const toggleGroupCollapsed = (groupId: string) => {
    setCollapsedGroupIdsPreference((current) => {
      const base = current ?? allGroupIds;
      const next = base.includes(groupId)
        ? base.filter((id) => id !== groupId)
        : [...base, groupId];
      window.localStorage.setItem(
        `telegram-posts-collapsed-groups:${channelId}`,
        JSON.stringify(next),
      );
      return next;
    });
  };

  const scheduleSidebarOrderSave = (visibleOrder: string[]) => {
    const visibleKeys = new Set(visibleOrder);
    let visibleIndex = 0;
    const completeOrder = canonicalSidebarKeys.map((key) =>
      visibleKeys.has(key) ? visibleOrder[visibleIndex++] : key,
    );
    sidebarReorderVersionRef.current += 1;
    const version = sidebarReorderVersionRef.current;
    if (sidebarReorderTimerRef.current) {
      window.clearTimeout(sidebarReorderTimerRef.current);
    }
    sidebarReorderTimerRef.current = window.setTimeout(() => {
      sidebarReorderQueueRef.current = sidebarReorderQueueRef.current
        .catch(() => undefined)
        .then(async () => {
          const previousPosts = snapshotManagedPostPages(
            queryClient,
            channelId,
          );
          const previousGroups = queryClient.getQueryData<PostGroup[]>([
            "post-groups",
            channelId,
          ]);
          const orderIndex = new Map(
            completeOrder.map((key, index) => [key, index]),
          );
          mapManagedPostPages(queryClient, channelId, (current) => ({
            ...current,
            items: current.items.map((post) =>
              post.groupId
                ? post
                : {
                    ...post,
                    sidebarPosition:
                      orderIndex.get(`post:${post.id}`) ?? post.sidebarPosition,
                  },
            ),
          }));
          queryClient.setQueryData<PostGroup[]>(
            ["post-groups", channelId],
            (current) =>
              current?.map((group) => ({
                ...group,
                sidebarPosition:
                  orderIndex.get(`group:${group.id}`) ?? group.sidebarPosition,
              })),
          );
          try {
            await telegramChannelsApi.reorderManagedPostSidebar(
              channelId,
              completeOrder,
              true,
            );
            if (version !== sidebarReorderVersionRef.current) return;
            await Promise.all([
              queryClient.invalidateQueries({
                queryKey: telegramPostKeys.managedLists(channelId),
              }),
              queryClient.invalidateQueries({
                queryKey: ["post-groups", channelId],
              }),
            ]);
            setSidebarOrderKeys([]);
            pushToast(
              t("telegram.posts.editor.sidebarOrderSaved"),
              "success",
              3000,
            );
          } catch (reorderError) {
            if (version !== sidebarReorderVersionRef.current) return;
            restoreManagedPostPages(queryClient, previousPosts);
            queryClient.setQueryData(
              ["post-groups", channelId],
              previousGroups,
            );
            setSidebarOrderKeys([]);
            pushToast(
              localizedApiError(
                reorderError,
                t("telegram.posts.calendar.error.sidebarOrder"),
              ),
              "error",
            );
          }
        });
    }, 700);
  };

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(
        plannerFormatWeightsPreferenceKey(channelId),
      );
      // Channel-local planner weight preferences hydrate the sliders.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setPlannerFormatWeights(
        raw ? (JSON.parse(raw) as Record<string, number>) : {},
      );
    } catch {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setPlannerFormatWeights({});
    }
  }, [channelId]);

  useEffect(() => {
    window.localStorage.setItem(
      plannerFormatWeightsPreferenceKey(channelId),
      JSON.stringify(plannerFormatWeights),
    );
  }, [channelId, plannerFormatWeights]);

  return { toggleGroupCollapsed, scheduleSidebarOrderSave };
}
