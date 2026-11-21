"use client";

import { useI18n } from "@/providers/i18n-provider";
import { useWorkspaceTimezone } from "@/hooks/use-workspace-timezone";
import { useRouter, useSearchParams } from "next/navigation";
import { useState, useEffect, useMemo } from "react";
import { type ChannelImportMode } from "@/components/features/telegram/telegram/channel-import-navigation";
import { type TelegramPostsWorkspaceView } from "@/components/features/telegram/telegram/telegram-posts-workspace-navigation";
import {
  parseTelegramPostsView,
  buildTelegramPostsLegacyRedirectUrl,
  buildTelegramPostsUrl,
} from "@/lib/features/telegram/telegram-posts-url";
import type { I18nNamespace } from "@/i18n/catalog";
import { useQuery } from "@tanstack/react-query";
import { telegramChannelKeys } from "@/lib/query-keys";
import { telegramChannelsApi } from "@/lib/api";
import { AppShell } from "@/components/layout/app-shell";
import { LoadingState, EmptyState } from "@/components/ui/primitives";
import { TelegramPostsHeaderWorkflows } from "@/components/features/telegram/telegram/telegram-posts-header-workflows";
import {
  type TelegramPostsPageProps,
  type PostViewMode,
  lastSelectedTelegramPostsChannelKey,
} from "./telegram-post-workspace-model";
import { TelegramPostWorkspace } from "./telegram-post-workspace";

export function TelegramPostsPageClient({
  routeChannelId,
  routePostView,
}: TelegramPostsPageProps = {}) {
  const { t, ensureNamespaces, hasNamespaces } = useI18n();
  const workspaceTimezone = useWorkspaceTimezone();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [newPostToken, setNewPostToken] = useState(0);
  const [newGroupRequested, setNewGroupRequested] = useState(false);
  const [importMode, setImportMode] = useState<ChannelImportMode | null>(null);
  useEffect(() => {
    if (importMode) void ensureNamespaces(["telegram/posts/import"]);
  }, [ensureNamespaces, importMode]);
  const importTranslationsReady = hasNamespaces(["telegram/posts/import"]);
  const routeChannelIdValue = routeChannelId?.trim() || "";
  const channelId = routeChannelIdValue || searchParams.get("channelId") || "";
  const postId = searchParams.get("postId") || "";
  const groupId = searchParams.get("groupId") || "";
  const [pageWorkspaceView, setPageWorkspaceView] =
    useState<TelegramPostsWorkspaceView>(
      routePostView === "groups" || groupId
        ? "groups"
        : routePostView === "hypotheses"
          ? "hypotheses"
          : "posts",
    );
  const initialPostView =
    routePostView ?? parseTelegramPostsView(searchParams.get("postView"));
  const currentRoutePostView: PostViewMode =
    initialPostView === "calendar" || initialPostView === "ai-posting"
      ? initialPostView
      : "editor";
  const routeNamespaces = useMemo<I18nNamespace[]>(
    () => [
      "ad-sales/common",
      "telegram/posts/common",
      pageWorkspaceView === "groups"
        ? "telegram/posts/groups"
        : currentRoutePostView === "calendar"
          ? "telegram/posts/calendar"
          : "telegram/posts/editor",
    ],
    [currentRoutePostView, pageWorkspaceView],
  );
  useEffect(() => {
    void ensureNamespaces(routeNamespaces);
  }, [ensureNamespaces, routeNamespaces]);
  const routeTranslationsReady = hasNamespaces(routeNamespaces);
  const legacyRedirectUrl = useMemo(
    () =>
      routeChannelIdValue
        ? null
        : buildTelegramPostsLegacyRedirectUrl(searchParams),
    [routeChannelIdValue, searchParams],
  );
  const channels = useQuery({
    queryKey: telegramChannelKeys.select({
      canPostMessagesOnly: true,
      owned: true,
      includeTest: true,
    }),
    queryFn: () =>
      telegramChannelsApi.select({
        canPostMessagesOnly: true,
        owned: true,
        includeTest: true,
      }),
  });
  const availableChannels = channels.data || [];
  const channel =
    availableChannels.find((item) => item.id === channelId) ||
    availableChannels[0];
  useEffect(() => {
    if (!legacyRedirectUrl) return;
    router.replace(legacyRedirectUrl);
  }, [legacyRedirectUrl, router]);

  useEffect(() => {
    if (typeof window === "undefined" || !availableChannels.length) return;
    const params = new URLSearchParams(searchParams.toString());
    const savedChannelId = window.localStorage.getItem(
      lastSelectedTelegramPostsChannelKey,
    );
    const savedChannelStillAvailable = savedChannelId
      ? availableChannels.some((item) => item.id === savedChannelId)
      : false;

    if (channelId) {
      const requestedChannelStillAvailable = availableChannels.some(
        (item) => item.id === channelId,
      );
      if (requestedChannelStillAvailable) {
        window.localStorage.setItem(
          lastSelectedTelegramPostsChannelKey,
          channelId,
        );
        return;
      }

      const fallbackChannelId = savedChannelStillAvailable
        ? savedChannelId
        : availableChannels[0]?.id;
      if (!fallbackChannelId) return;
      params.delete("postId");
      router.replace(
        buildTelegramPostsUrl({
          channelId: fallbackChannelId,
          groupId: params.get("groupId"),
          postView: params.get("groupId") ? null : currentRoutePostView,
          extraParams: params,
        }),
      );
      return;
    }

    const fallbackChannelId = savedChannelStillAvailable
      ? savedChannelId
      : availableChannels[0]?.id;
    if (!fallbackChannelId) return;
    router.replace(
      buildTelegramPostsUrl({
        channelId: fallbackChannelId,
        groupId: params.get("groupId"),
        postView: params.get("groupId") ? null : currentRoutePostView,
        extraParams: params,
      }),
    );
  }, [
    availableChannels,
    channelId,
    currentRoutePostView,
    router,
    searchParams,
  ]);

  useEffect(() => {
    if (routeChannelIdValue || !channelId || groupId || initialPostView) return;
    router.replace(
      buildTelegramPostsUrl({
        channelId,
        postId: postId || null,
        postView: "editor",
      }),
    );
  }, [
    channelId,
    groupId,
    initialPostView,
    postId,
    routeChannelIdValue,
    router,
  ]);

  const navigateToChannel = (nextChannelId: string) => {
    if (typeof window !== "undefined") {
      window.localStorage.setItem(
        lastSelectedTelegramPostsChannelKey,
        nextChannelId,
      );
    }
    router.push(
      buildTelegramPostsUrl({
        channelId: nextChannelId,
        postView:
          pageWorkspaceView === "groups"
            ? "groups"
            : pageWorkspaceView === "hypotheses"
              ? "hypotheses"
              : currentRoutePostView,
      }),
    );
  };

  if (!routeTranslationsReady) {
    return (
      <AppShell>
        <LoadingState />
      </AppShell>
    );
  }

  return (
    <AppShell>
      <TelegramPostsHeaderWorkflows
        channel={channel}
        channels={availableChannels}
        importMode={importMode}
        importTranslationsReady={importTranslationsReady}
        onChannelChange={navigateToChannel}
        onImportModeChange={setImportMode}
      />
      {channels.isLoading ? <LoadingState /> : null}
      {!channels.isLoading && !channels.error && !availableChannels.length ? (
        <EmptyState text={t("telegram.posts.noChannels")} />
      ) : null}
      {channel ? (
        <div>
          <TelegramPostWorkspace
            key={channel.id}
            channelId={channel.id}
            channelTitle={channel.title}
            channelPhotoUrl={channel.photoUrl}
            channelUsername={channel.username}
            channelTelegramChatId={channel.telegramChatId}
            channelTimePosts={channel.timePosts || []}
            channelPublishingCapabilities={channel.publishingCapabilities}
            workspaceTimezone={workspaceTimezone}
            newPostToken={newPostToken}
            newGroupRequested={newGroupRequested}
            onNewGroupRequestHandled={() => setNewGroupRequested(false)}
            importMode={importMode}
            onImportModeChange={setImportMode}
            initialPostId={postId}
            initialGroupId={groupId}
            initialPostView={initialPostView}
            channels={availableChannels}
            onWorkspaceViewChange={setPageWorkspaceView}
            onRequestNewPost={() => {
              router.replace(
                buildTelegramPostsUrl({
                  channelId: channel.id,
                  postView: "editor",
                }),
              );
              setPageWorkspaceView("posts");
              setNewPostToken((value) => value + 1);
            }}
            onRequestNewGroup={() => {
              router.replace(
                buildTelegramPostsUrl({
                  channelId: channel.id,
                  postView: "groups",
                }),
              );
              setPageWorkspaceView("groups");
              setNewGroupRequested(true);
            }}
            onPostSelect={(selectedPostId) => {
              router.replace(
                buildTelegramPostsUrl({
                  channelId: channel.id,
                  postId: selectedPostId,
                  postView: "editor",
                }),
              );
            }}
          />
        </div>
      ) : null}
    </AppShell>
  );
}
