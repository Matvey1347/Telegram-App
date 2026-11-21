"use client";

import { useEffect } from "react";
import {
  managedPostStatusTab,
  expandDeepLinkedPostGroup,
} from "@/components/features/telegram/telegram/managed-post-deep-link";
import {
  workspaceViewPreferenceKey,
  isBrokenPublishedPost,
} from "./telegram-post-workspace-model";
import type { TelegramPostWorkspaceProps } from "./telegram-post-workspace-model";
import type { useTelegramWorkspaceView } from "./use-telegram-workspace-view";
import type { useTelegramPostSidebarList } from "./use-telegram-post-sidebar-list";
import type { useTelegramPostWorkspaceQueries } from "./use-telegram-post-workspace-queries";
import type { useTelegramPostEditorState } from "./use-telegram-post-editor-state";
import type { useTelegramPostEditorContext } from "./use-telegram-post-editor-context";
import type { useTelegramPostSidebarState } from "./use-telegram-post-sidebar-state";
import type { useTelegramPostSelection } from "./use-telegram-post-selection";

type Input = Pick<
  TelegramPostWorkspaceProps,
  "initialPostId" | "onWorkspaceViewChange" | "channelId" | "initialGroupId"
> &
  Pick<
    ReturnType<typeof useTelegramWorkspaceView>,
    "setWorkspaceView" | "restoredPostIdRef"
  > &
  Pick<
    ReturnType<typeof useTelegramPostSidebarList>,
    "changeWorkspaceView" | "allGroupIds"
  > &
  Pick<
    ReturnType<typeof useTelegramPostWorkspaceQueries>,
    "posts" | "postGroups" | "deepLinkedPost"
  > &
  Pick<
    ReturnType<typeof useTelegramPostEditorState>,
    "editing" | "setStatusTab"
  > &
  Pick<
    ReturnType<typeof useTelegramPostEditorContext>,
    "effectivePostGroupId"
  > &
  Pick<
    ReturnType<typeof useTelegramPostSidebarState>,
    "setCollapsedGroupIdsPreference"
  > &
  Pick<ReturnType<typeof useTelegramPostSelection>, "selectPost">;

export function useTelegramWorkspaceDeepLinks(input: Input) {
  const {
    initialPostId,
    onWorkspaceViewChange,
    channelId,
    initialGroupId,
    setWorkspaceView,
    restoredPostIdRef,
    changeWorkspaceView,
    allGroupIds,
    posts,
    postGroups,
    deepLinkedPost,
    editing,
    setStatusTab,
    effectivePostGroupId,
    setCollapsedGroupIdsPreference,
    selectPost,
  } = input;

  useEffect(() => {
    if (!initialPostId) return;
    // The URL is the source of truth for a deep-linked post. Updating the
    // workspace tab here must not navigate again, otherwise the postId that
    // was just added by openPost() is immediately removed from the URL.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setWorkspaceView("posts");
    onWorkspaceViewChange("posts");
    window.localStorage.setItem(workspaceViewPreferenceKey(channelId), "posts");
  }, [channelId, initialPostId, onWorkspaceViewChange]);

  useEffect(() => {
    if (!initialGroupId) return;
    changeWorkspaceView("groups");
  }, [initialGroupId]);

  useEffect(() => {
    if (!initialPostId || !posts.data?.length || postGroups.isLoading) return;
    // The detail request is authoritative for a URL-opened post. The list is
    // allowed to be stale while its query is being refreshed, so it must never
    // overwrite the schedule that came from the detail endpoint.
    const post =
      deepLinkedPost.data?.id === initialPostId
        ? deepLinkedPost.data
        : posts.data.find((item) => item.id === initialPostId);
    const detailScheduleChanged =
      deepLinkedPost.data?.id === initialPostId &&
      (editing?.scheduledAt !== deepLinkedPost.data.scheduledAt ||
        editing?.scheduleTimezone !== deepLinkedPost.data.scheduleTimezone);
    if (restoredPostIdRef.current === initialPostId && !detailScheduleChanged) {
      return;
    }
    // URL restoration intentionally hydrates the local editor state.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (post) {
      const nextStatusTab = managedPostStatusTab(
        post.status,
        isBrokenPublishedPost(post),
      );
      setStatusTab(nextStatusTab);
      window.localStorage.setItem(
        `telegram-posts-status:${channelId}`,
        nextStatusTab,
      );
      const linkedGroupId = effectivePostGroupId(post);
      if (linkedGroupId) {
        setCollapsedGroupIdsPreference((current) => {
          const next = expandDeepLinkedPostGroup(
            current,
            allGroupIds,
            linkedGroupId,
          );
          window.localStorage.setItem(
            `telegram-posts-collapsed-groups:${channelId}`,
            JSON.stringify(next),
          );
          return next;
        });
      }
      selectPost(post);
    }
    // selectPost is intentionally excluded to avoid rehydrating on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    deepLinkedPost.data,
    editing?.scheduledAt,
    editing?.scheduleTimezone,
    initialPostId,
    postGroups.data,
    postGroups.isLoading,
    posts.data,
  ]);
}
