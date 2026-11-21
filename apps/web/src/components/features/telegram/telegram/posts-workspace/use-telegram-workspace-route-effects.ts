"use client";

import { useEffect } from "react";
import {
  startOfMonth,
  toLocalDateKey,
} from "@/components/features/telegram/telegram/telegram-posts-calendar-view";
import {
  workspaceViewPreferenceKey,
  postGroupPreferenceKey,
} from "./telegram-post-workspace-model";
import type { TelegramPostWorkspaceProps } from "./telegram-post-workspace-model";
import type { useTelegramWorkspaceView } from "./use-telegram-workspace-view";
import type { useTelegramPostEditorState } from "./use-telegram-post-editor-state";
import type { useTelegramCalendarState } from "./use-telegram-calendar-state";
import type { useTelegramPostSidebarState } from "./use-telegram-post-sidebar-state";
import type { useTelegramPostWorkspaceQueries } from "./use-telegram-post-workspace-queries";
import type { useTelegramPostEditorContext } from "./use-telegram-post-editor-context";

type Input = Pick<TelegramPostWorkspaceProps, "initialPostView" | "channelId"> &
  Pick<
    ReturnType<typeof useTelegramWorkspaceView>,
    "setWorkspaceView" | "setPostView"
  > &
  Pick<
    ReturnType<typeof useTelegramPostEditorState>,
    | "setStatusTab"
    | "setRememberedPostGroupId"
    | "setPostGroupId"
    | "rememberedPostGroupId"
  > &
  Pick<
    ReturnType<typeof useTelegramCalendarState>,
    "setCalendarMonth" | "setSelectedCalendarDate"
  > &
  Pick<
    ReturnType<typeof useTelegramPostSidebarState>,
    "setCollapsedGroupIdsPreference"
  > &
  Pick<ReturnType<typeof useTelegramPostWorkspaceQueries>, "postGroups"> &
  Pick<ReturnType<typeof useTelegramPostEditorContext>, "rememberPostGroup">;

export function useTelegramWorkspaceRouteEffects(input: Input) {
  const {
    initialPostView,
    channelId,
    setWorkspaceView,
    setPostView,
    setStatusTab,
    setRememberedPostGroupId,
    setPostGroupId,
    rememberedPostGroupId,
    setCalendarMonth,
    setSelectedCalendarDate,
    setCollapsedGroupIdsPreference,
    postGroups,
    rememberPostGroup,
  } = input;

  useEffect(() => {
    if (initialPostView === "groups") {
      setWorkspaceView("groups");
      return;
    }
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
    if (initialPostView === "ai-posting") {
      setWorkspaceView("posts");
      return;
    }
    if (initialPostView === "groups" || initialPostView === "hypotheses") {
      setWorkspaceView(initialPostView);
      return;
    }
    const saved = window.localStorage.getItem(
      workspaceViewPreferenceKey(channelId),
    );
    setWorkspaceView(
      saved === "groups" || saved === "hypotheses" ? saved : "posts",
    );
  }, [channelId, initialPostView]);

  useEffect(() => {
    setPostView(
      initialPostView === "calendar" || initialPostView === "ai-posting"
        ? initialPostView
        : "editor",
    );
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

  useEffect(() => {
    const saved = window.localStorage.getItem(
      postGroupPreferenceKey(channelId),
    );
    // Restore the preferred new-post group independently for every channel.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setRememberedPostGroupId(saved);
    setPostGroupId((current) => current ?? saved);
  }, [channelId]);

  useEffect(() => {
    if (!rememberedPostGroupId || !postGroups.data) return;
    if (postGroups.data.some((group) => group.id === rememberedPostGroupId)) {
      return;
    }
    // Drop stale preferred group ids when a group was deleted or moved away.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    rememberPostGroup(null);
    setPostGroupId((current) =>
      current === rememberedPostGroupId ? null : current,
    );
    // rememberPostGroup intentionally updates local state and localStorage.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rememberedPostGroupId, postGroups.data]);
}
