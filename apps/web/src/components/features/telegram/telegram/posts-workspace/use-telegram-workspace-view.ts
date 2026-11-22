"use client";

import { useI18n } from "@/providers/i18n-provider";
import { useCallback, useRef, useState } from "react";
import { safeApiErrorMessage } from "@/i18n/error-localization";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { useAppToast } from "@/providers/toast-provider";
import type { PostViewMode } from "./telegram-post-workspace-model";
import type { TelegramPostWorkspaceProps } from "./telegram-post-workspace-model";

type Input = Pick<TelegramPostWorkspaceProps, "initialPostView">;

export function useTelegramWorkspaceView({ initialPostView }: Input) {
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

  const [postView, setPostView] = useState<PostViewMode>(initialPostView);
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
    workspaceView: "posts" as const,
    postView,
    setPostView,
  };
}
