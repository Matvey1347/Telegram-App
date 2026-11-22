"use client";

import { useQuery } from "@tanstack/react-query";
import { telegramPostKeys, workspaceKeys, memberKeys } from "@/lib/query-keys";
import {
  telegramChannelsApi,
  telegramAdSalesApi,
  workspaceMembersApi,
} from "@/lib/api";
import { useManagedPostDeepLink } from "@/components/features/telegram/telegram/use-managed-post-deep-link";
import { useManagedPostPageItems } from "@/components/features/telegram/telegram/managed-post-page";
import { useCallback, useMemo } from "react";
import {
  startOfDay,
  calendarGridStart,
  endOfDay,
  calendarGridEnd,
} from "@/components/features/telegram/telegram/telegram-posts-calendar-view";
import type { TelegramPostWorkspaceProps } from "./telegram-post-workspace-model";
import type { useTelegramWorkspaceView } from "./use-telegram-workspace-view";
import type { useTelegramPostEditorState } from "./use-telegram-post-editor-state";
import type { useTelegramCalendarState } from "./use-telegram-calendar-state";

type Input = Pick<
  TelegramPostWorkspaceProps,
  "channelId" | "initialPostId" | "workspaceTimezone"
> &
  Pick<
    ReturnType<typeof useTelegramWorkspaceView>,
    "workspaceView" | "postView" | "queryClient" | "customEmojiPacksOpen"
  > &
  Pick<ReturnType<typeof useTelegramPostEditorState>, "editing"> &
  Pick<
    ReturnType<typeof useTelegramCalendarState>,
    "calendarMonth" | "showAdSalesOverlay"
  >;

export function useTelegramPostWorkspaceQueries(input: Input) {
  const {
    channelId,
    initialPostId,
    workspaceTimezone,
    workspaceView,
    postView,
    queryClient,
    customEmojiPacksOpen,
    editing,
    calendarMonth,
    showAdSalesOverlay,
  } = input;

  const postsPage = useQuery({
    queryKey: telegramPostKeys.managedList(channelId, {
      all: true,
    }),
    queryFn: () =>
      telegramChannelsApi.managedPostsPage(channelId, { all: true }),
    enabled: workspaceView === "posts" && postView !== "ai-posting",
    // This archive is expensive and already kept in memory for tab switches.
    // Every managed-post mutation invalidates the channel list family, so a
    // longer stale window avoids repeat reads without hiding local edits.
    staleTime: 15 * 60_000,
  });

  const deepLinkedPost = useManagedPostDeepLink({
    channelId,
    postId: initialPostId,
    queryClient,
  });

  const postsData = useManagedPostPageItems(
    postsPage.data?.items,
    deepLinkedPost.data,
  );

  const posts = {
    ...postsPage,
    data: postsData,
    editorialPairs: postsPage.data?.editorialPairs,
  };

  const authoritativeEditingPost =
    editing?.id && deepLinkedPost.data?.id === editing.id
      ? deepLinkedPost.data
      : (posts.data?.find((post) => post.id === editing?.id) ?? editing);

  const scheduleTimezone =
    authoritativeEditingPost?.scheduleTimezone ?? workspaceTimezone;

  const isDeepLinkedPostLoading =
    Boolean(initialPostId) && deepLinkedPost.isLoading && !editing;

  const customEmojiPacks = useQuery({
    queryKey: workspaceKeys.telegramCustomEmojiPacks(),
    queryFn: () => telegramChannelsApi.customEmojiPacks(),
    enabled: customEmojiPacksOpen,
  });

  const refreshCustomEmojiPacks = useCallback(async () => {
    await queryClient.invalidateQueries({
      queryKey: workspaceKeys.telegramCustomEmojiPacks(),
    });
  }, [queryClient]);

  const calendarRange = useMemo(
    () => ({
      from: startOfDay(calendarGridStart(calendarMonth)).toISOString(),
      to: endOfDay(calendarGridEnd(calendarMonth)).toISOString(),
    }),
    [calendarMonth],
  );

  const calendarData = useQuery({
    queryKey: [
      "telegram-managed-posts-calendar",
      channelId,
      calendarRange.from,
      calendarRange.to,
    ],
    queryFn: () =>
      telegramChannelsApi.managedPostsCalendar(channelId, calendarRange),
    enabled: workspaceView === "posts" && postView === "calendar",
    staleTime: 30_000,
    gcTime: 5 * 60_000,
    refetchOnWindowFocus: false,
  });

  const adCalendarOverlay = useQuery({
    queryKey: [
      "telegram-ad-availability",
      "telegram-posts-overlay",
      channelId,
      calendarRange.from,
      calendarRange.to,
    ],
    queryFn: () =>
      telegramAdSalesApi.availability({
        from: calendarRange.from,
        to: calendarRange.to,
        channelIds: [channelId],
      }),
    enabled:
      workspaceView === "posts" &&
      postView === "calendar" &&
      showAdSalesOverlay,
    staleTime: 30_000,
    gcTime: 5 * 60_000,
    refetchOnWindowFocus: false,
  });

  const postGroups = useQuery({
    queryKey: ["post-groups", channelId],
    queryFn: () => telegramChannelsApi.postGroupSummaries(channelId),
    enabled: workspaceView === "posts" && postView !== "ai-posting",
  });

  const plannerFormats = useQuery({
    queryKey: telegramPostKeys.plannerFormats(channelId),
    queryFn: () => telegramChannelsApi.postPlannerFormats(channelId),
    enabled: false,
  });

  const plannerSlots = useQuery({
    queryKey: telegramPostKeys.plannerSlots(channelId),
    queryFn: () => telegramChannelsApi.postPlannerSlots(channelId),
    enabled: false,
  });

  const members = useQuery({
    queryKey: memberKeys.membersSelect(),
    queryFn: () => workspaceMembersApi.select(),
    enabled: workspaceView === "posts" && postView === "editor",
  });

  return {
    deepLinkedPost,
    posts,
    authoritativeEditingPost,
    scheduleTimezone,
    isDeepLinkedPostLoading,
    customEmojiPacks,
    calendarData,
    adCalendarOverlay,
    postGroups,
    plannerFormats,
    plannerSlots,
    members,
  };
}
