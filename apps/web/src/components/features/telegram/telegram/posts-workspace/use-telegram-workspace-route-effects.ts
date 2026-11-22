"use client";

import { useEffect } from "react";
import {
  startOfMonth,
  toLocalDateKey,
} from "@/components/features/telegram/telegram/telegram-posts-calendar-view";
import type { TelegramPostWorkspaceProps } from "./telegram-post-workspace-model";
import type { useTelegramWorkspaceView } from "./use-telegram-workspace-view";
import type { useTelegramPostEditorState } from "./use-telegram-post-editor-state";
import type { useTelegramCalendarState } from "./use-telegram-calendar-state";
import type { useTelegramPostSidebarState } from "./use-telegram-post-sidebar-state";

type Input = Pick<TelegramPostWorkspaceProps, "initialPostView" | "channelId"> &
  Pick<
    ReturnType<typeof useTelegramWorkspaceView>,
    "setPostView"
  > &
  Pick<
    ReturnType<typeof useTelegramPostEditorState>,
    | "setStatusTab"
  > &
  Pick<
    ReturnType<typeof useTelegramCalendarState>,
    "setCalendarMonth" | "setSelectedCalendarDate"
  > &
  Pick<
    ReturnType<typeof useTelegramPostSidebarState>,
    "setCollapsedGroupIdsPreference"
  >;

export function useTelegramWorkspaceRouteEffects(input: Input) {
  const {
    initialPostView,
    channelId,
    setPostView,
    setStatusTab,
    setCalendarMonth,
    setSelectedCalendarDate,
    setCollapsedGroupIdsPreference,
  } = input;

  useEffect(() => {
    const saved = window.localStorage.getItem(
      `telegram-posts-status:${channelId}`,
    );
    if (saved === "DRAFT" || saved === "SCHEDULED" || saved === "PUBLISHED") {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setStatusTab(saved);
    } else {
      setStatusTab("DRAFT");
    }
  }, [channelId, initialPostView]);

  useEffect(() => {
    setPostView(initialPostView);
    setCalendarMonth(startOfMonth(new Date()));
    setSelectedCalendarDate(toLocalDateKey(new Date()));
  }, [channelId, initialPostView]);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(
        `telegram-posts-collapsed-groups:${channelId}`,
      );
      if (!raw) {
        setCollapsedGroupIdsPreference(null);
        return;
      }
      const saved = JSON.parse(raw);
      // Restore the collapsed groups independently for every channel.
      // Null means "no manual preference yet", so groups stay collapsed by default.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setCollapsedGroupIdsPreference(
        Array.isArray(saved)
          ? saved.filter((id): id is string => typeof id === "string")
          : null,
      );
    } catch {
      setCollapsedGroupIdsPreference(null);
    }
  }, [channelId]);

}
