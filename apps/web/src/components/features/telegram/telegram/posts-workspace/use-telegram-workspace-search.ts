"use client";

import { useManagedPostSearch } from "@/components/features/telegram/telegram/use-managed-post-search";
import { useMemo } from "react";
import { type TelegramManagedPost } from "@/lib/api";
import {
  isBrokenPublishedPost,
  type EffectivePostGroup,
} from "./telegram-post-workspace-model";
import type { useTelegramPostWorkspaceQueries } from "./use-telegram-post-workspace-queries";
import type { useTelegramPostPendingState } from "./use-telegram-post-pending-state";
import type { useTelegramPostEditorState } from "./use-telegram-post-editor-state";
import type { useTelegramPostEditorContext } from "./use-telegram-post-editor-context";

type Input = Pick<ReturnType<typeof useTelegramPostWorkspaceQueries>, "posts"> &
  Pick<
    ReturnType<typeof useTelegramPostPendingState>,
    "pendingPostSaves" | "savingPostIds"
  > &
  Pick<ReturnType<typeof useTelegramPostEditorState>, "statusTab"> &
  Pick<
    ReturnType<typeof useTelegramPostEditorContext>,
    | "effectivePostGroup"
    | "effectivePostMember"
    | "effectivePostGroupId"
    | "postGroupsById"
    | "telegramImportedSystemGroup"
  >;

export function useTelegramWorkspaceSearch(input: Input) {
  const {
    posts,
    pendingPostSaves,
    savingPostIds,
    statusTab,
    effectivePostGroup,
    effectivePostMember,
    effectivePostGroupId,
    postGroupsById,
    telegramImportedSystemGroup,
  } = input;

  const {
    query: postSearch,
    setQuery: setPostSearch,
    visiblePosts,
    visiblePendingPosts: visiblePendingPostSaves,
  } = useManagedPostSearch({
    posts: posts.data || [],
    pendingPosts: pendingPostSaves,
    status: statusTab,
    savingPostIds,
    isBrokenPublishedPost,
    groupTitle: (post) => effectivePostGroup(post)?.title,
    memberName: (post) => effectivePostMember(post)?.user.name,
  });

  const groupedVisiblePosts = useMemo(() => {
    const grouped = new Map<
      string,
      { group: EffectivePostGroup; posts: TelegramManagedPost[] }
    >();
    const ungrouped: TelegramManagedPost[] = [];

    visiblePosts.forEach((post) => {
      const group = effectivePostGroup(post);
      const groupId = effectivePostGroupId(post);
      if (!groupId || !group) {
        ungrouped.push(post);
        return;
      }
      const section = grouped.get(groupId);
      if (section) section.posts.push(post);
      else grouped.set(groupId, { group, posts: [post] });
    });

    return {
      groups: [...grouped.values()].map((section) => ({
        ...section,
        posts: [...section.posts].sort((left, right) => {
          const leftPosition = left.groupPosition ?? Number.MAX_SAFE_INTEGER;
          const rightPosition = right.groupPosition ?? Number.MAX_SAFE_INTEGER;
          if (leftPosition !== rightPosition) {
            return leftPosition - rightPosition;
          }
          return (
            new Date(left.createdAt).getTime() -
            new Date(right.createdAt).getTime()
          );
        }),
      })),
      ungrouped,
    };
  }, [postGroupsById, telegramImportedSystemGroup, visiblePosts]);

  return {
    postSearch,
    setPostSearch,
    visiblePosts,
    visiblePendingPostSaves,
    groupedVisiblePosts,
  };
}
