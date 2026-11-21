"use client";

import { useI18n } from "@/providers/i18n-provider";
import { useCallback, useRef, useState, useEffect } from "react";
import { safeApiErrorMessage } from "@/i18n/error-localization";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { useAppToast } from "@/providers/toast-provider";
import { type TelegramPostsWorkspaceView } from "@/components/features/telegram/telegram/telegram-posts-workspace-navigation";
import {
  workspaceViewPreferenceKey,
  type PostViewMode,
} from "./telegram-post-workspace-model";
import type { TelegramPostWorkspaceProps } from "./telegram-post-workspace-model";

type Input = Pick<
  TelegramPostWorkspaceProps,
  | "initialPostView"
  | "initialGroupId"
  | "channelId"
  | "onWorkspaceViewChange"
  | "newGroupRequested"
>;

export function useTelegramWorkspaceView(input: Input) {
  const {
    initialPostView,
    initialGroupId,
    channelId,
    onWorkspaceViewChange,
    newGroupRequested,
  } = input;

  const { locale, t } = useI18n();

  const localizedApiError = useCallback(
    (error: unknown, fallback: string) =>
      safeApiErrorMessage(error, locale, t, fallback),
    [locale, t],
  );

  const router = useRouter();

  const restoredPostIdRef = useRef("");

  const queryClient = useQueryClient();

  const { pushToast, setProgress, clearProgress, startOperation } =
    useAppToast();

  const [customEmojiPacksOpen, setCustomEmojiPacksOpen] = useState(false);

  const [workspaceView, setWorkspaceView] =
    useState<TelegramPostsWorkspaceView>(() => {
      if (typeof window === "undefined") return "posts";
      if (initialPostView === "groups") return "groups";
      if (initialPostView === "hypotheses") return "hypotheses";
      if (initialGroupId) return "groups";
      const saved = window.localStorage.getItem(
        workspaceViewPreferenceKey(channelId),
      );
      return saved === "groups" || saved === "hypotheses" ? saved : "posts";
    });

  useEffect(
    () => onWorkspaceViewChange(workspaceView),
    [onWorkspaceViewChange, workspaceView],
  );

  useEffect(() => {
    if (!newGroupRequested) return;
    const timeout = window.setTimeout(() => {
      setWorkspaceView("groups");
      onWorkspaceViewChange("groups");
      window.localStorage.setItem(
        workspaceViewPreferenceKey(channelId),
        "groups",
      );
    }, 0);
    return () => window.clearTimeout(timeout);
  }, [channelId, newGroupRequested, onWorkspaceViewChange]);

  const [postView, setPostView] = useState<PostViewMode>(() => {
    return initialPostView === "calendar" || initialPostView === "ai-posting"
      ? initialPostView
      : "editor";
  });

  return {
    locale,
    t,
    localizedApiError,
    router,
    restoredPostIdRef,
    queryClient,
    pushToast,
    setProgress,
    clearProgress,
    startOperation,
    customEmojiPacksOpen,
    setCustomEmojiPacksOpen,
    workspaceView,
    setWorkspaceView,
    postView,
    setPostView,
  };
}
