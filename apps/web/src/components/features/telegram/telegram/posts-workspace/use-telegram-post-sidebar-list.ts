"use client";

import { useMemo } from "react";
import { type TelegramManagedPost } from "@/lib/api";
import { type TelegramPostsWorkspaceView } from "@/components/features/telegram/telegram/telegram-posts-workspace-navigation";
import { buildTelegramPostsUrl } from "@/lib/features/telegram/telegram-posts-url";
import {
  type PendingPostSave,
  type PostSidebarSection,
  type PostStatusTab,
  workspaceViewPreferenceKey,
  type PostViewMode,
} from "./telegram-post-workspace-model";
import type { useTelegramWorkspaceSearch } from "./use-telegram-workspace-search";
import type { useTelegramPostWorkspaceQueries } from "./use-telegram-post-workspace-queries";
import type { useTelegramPostEditorContext } from "./use-telegram-post-editor-context";
import type { useTelegramPostSidebarState } from "./use-telegram-post-sidebar-state";
import type { useTelegramPostEditorState } from "./use-telegram-post-editor-state";
import type { TelegramPostWorkspaceProps } from "./telegram-post-workspace-model";
import type { useTelegramWorkspaceView } from "./use-telegram-workspace-view";

type Input = Pick<
  ReturnType<typeof useTelegramWorkspaceSearch>,
  "visiblePendingPostSaves" | "groupedVisiblePosts" | "visiblePosts"
> &
  Pick<
    ReturnType<typeof useTelegramPostWorkspaceQueries>,
    "postGroups" | "posts"
  > &
  Pick<
    ReturnType<typeof useTelegramPostEditorContext>,
    "effectivePostGroupId" | "postGroupsById" | "telegramImportedSystemGroup"
  > &
  Pick<
    ReturnType<typeof useTelegramPostSidebarState>,
    "sidebarOrderKeys" | "collapsedGroupIdsPreference"
  > &
  Pick<
    ReturnType<typeof useTelegramPostEditorState>,
    "selectedPostIds" | "setStatusTab" | "editing"
  > &
  Pick<
    TelegramPostWorkspaceProps,
    "channelId" | "onWorkspaceViewChange" | "initialGroupId" | "initialPostId"
  > &
  Pick<
    ReturnType<typeof useTelegramWorkspaceView>,
    "setWorkspaceView" | "router" | "postView" | "setPostView"
  >;

export function useTelegramPostSidebarList(input: Input) {
  const {
    visiblePendingPostSaves,
    groupedVisiblePosts,
    visiblePosts,
    postGroups,
    posts,
    effectivePostGroupId,
    postGroupsById,
    telegramImportedSystemGroup,
    sidebarOrderKeys,
    collapsedGroupIdsPreference,
    selectedPostIds,
    setStatusTab,
    editing,
    channelId,
    onWorkspaceViewChange,
    initialGroupId,
    initialPostId,
    setWorkspaceView,
    router,
    postView,
    setPostView,
  } = input;

  const groupedPendingPostSaves = useMemo(() => {
    const grouped = new Map<string, PendingPostSave[]>();
    const ungrouped: PendingPostSave[] = [];

    visiblePendingPostSaves.forEach((post) => {
      if (!post.groupId) {
        ungrouped.push(post);
        return;
      }
      grouped.set(post.groupId, [...(grouped.get(post.groupId) ?? []), post]);
    });

    return { grouped, ungrouped };
  }, [visiblePendingPostSaves]);

  const canonicalSidebarKeys = useMemo(
    () =>
      [
        ...(postGroups.data || []).map((group, index) => ({
          key: `group:${group.id}`,
          position: group.sidebarPosition,
          fallback: index,
        })),
        ...(posts.data || [])
          .filter((post) => !effectivePostGroupId(post))
          .map((post, index) => ({
            key: `post:${post.id}`,
            position: post.sidebarPosition,
            fallback: (postGroups.data?.length || 0) + index,
          })),
      ]
        .sort(
          (left, right) =>
            (left.position ?? Number.MAX_SAFE_INTEGER) -
              (right.position ?? Number.MAX_SAFE_INTEGER) ||
            left.fallback - right.fallback,
        )
        .map((item) => item.key),
    [postGroups.data, postGroupsById, posts.data, telegramImportedSystemGroup],
  );

  const sidebarSections = useMemo<PostSidebarSection[]>(() => {
    const groupsById = new Map(
      (postGroups.data || []).map((group) => [group.id, group]),
    );
    const visibleGroupsById = new Map(
      groupedVisiblePosts.groups.map((section) => [section.group.id, section]),
    );
    const groupIds = [
      ...new Set([
        ...groupedVisiblePosts.groups.map((section) => section.group.id),
        ...groupedPendingPostSaves.grouped.keys(),
      ]),
    ];
    const groupSections: PostSidebarSection[] = groupIds.flatMap((groupId) => {
      const visibleGroup = visibleGroupsById.get(groupId);
      const group = visibleGroup?.group ?? groupsById.get(groupId);
      if (!group) return [];
      return [
        {
          key: `group:${group.id}`,
          group,
          posts: visibleGroup?.posts ?? [],
          pendingPosts: groupedPendingPostSaves.grouped.get(group.id) ?? [],
        },
      ];
    });
    const sections: PostSidebarSection[] = [
      ...groupSections,
      ...groupedVisiblePosts.ungrouped.map((post) => ({
        key: `post:${post.id}`,
        group: null,
        posts: [post],
        pendingPosts: [],
      })),
    ];
    const canonicalIndex = new Map(
      canonicalSidebarKeys.map((key, index) => [key, index]),
    );
    return sections.sort(
      (left, right) =>
        (canonicalIndex.get(left.key) ?? Number.MAX_SAFE_INTEGER) -
        (canonicalIndex.get(right.key) ?? Number.MAX_SAFE_INTEGER),
    );
  }, [
    canonicalSidebarKeys,
    groupedPendingPostSaves.grouped,
    groupedVisiblePosts,
    postGroups.data,
  ]);

  const orderedSidebarSections = useMemo(() => {
    if (
      sidebarOrderKeys.length !== sidebarSections.length ||
      sidebarOrderKeys.some(
        (key) => !sidebarSections.some((section) => section.key === key),
      )
    ) {
      return sidebarSections;
    }
    const byKey = new Map(
      sidebarSections.map((section) => [section.key, section]),
    );
    return sidebarOrderKeys
      .map((key) => byKey.get(key))
      .filter((section): section is PostSidebarSection => Boolean(section));
  }, [sidebarOrderKeys, sidebarSections]);

  const channelPostIds = (posts.data || []).map((post) => post.id);

  const tabPostIds = visiblePosts.map((post) => post.id);

  const selectedPosts = selectedPostIds
    .map((id) => posts.data?.find((post) => post.id === id))
    .filter((post): post is TelegramManagedPost => Boolean(post));

  const allChannelPostsSelected =
    channelPostIds.length > 0 &&
    channelPostIds.every((id) => selectedPostIds.includes(id));

  const allTabPostsSelected =
    tabPostIds.length > 0 &&
    tabPostIds.every((id) => selectedPostIds.includes(id));

  const allGroupIds = [
    ...new Set([
      ...(postGroups.data || []).map((group) => group.id),
      ...groupedVisiblePosts.groups.map(({ group }) => group.id),
    ]),
  ];

  const collapsedGroupIds = collapsedGroupIdsPreference ?? allGroupIds;

  const changeStatusTab = (next: PostStatusTab) => {
    setStatusTab(next);
    window.localStorage.setItem(`telegram-posts-status:${channelId}`, next);
  };

  const changeWorkspaceView = (next: TelegramPostsWorkspaceView) => {
    setWorkspaceView(next);
    onWorkspaceViewChange(next);
    window.localStorage.setItem(workspaceViewPreferenceKey(channelId), next);
    router.replace(
      buildTelegramPostsUrl({
        channelId,
        groupId: next === "groups" ? initialGroupId || null : null,
        postView:
          next === "groups"
            ? "groups"
            : next === "hypotheses"
              ? "hypotheses"
              : postView,
      }),
    );
  };

  const changePostView = (next: PostViewMode) => {
    setPostView(next);
    router.replace(
      buildTelegramPostsUrl({
        channelId,
        postId: editing?.id || initialPostId || null,
        postView: next,
      }),
    );
  };

  return {
    groupedPendingPostSaves,
    canonicalSidebarKeys,
    orderedSidebarSections,
    channelPostIds,
    tabPostIds,
    selectedPosts,
    allChannelPostsSelected,
    allTabPostsSelected,
    allGroupIds,
    collapsedGroupIds,
    changeStatusTab,
    changeWorkspaceView,
    changePostView,
  };
}
