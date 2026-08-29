"use client";

import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import type { TelegramManagedPost } from "@/lib/api";
import { telegramPostKeys } from "@/lib/query-keys";
import { findManagedPostInPages } from "./managed-post-cache";

const RETRY_DELAYS_MS = [0, 1_000, 2_000, 4_000, 8_000] as const;
const MAX_TIMER_DELAY_MS = 2_147_483_647;

export function useManagedPostDueRefresh({
  channelId,
  post,
}: {
  channelId: string;
  post: TelegramManagedPost | null;
}) {
  const queryClient = useQueryClient();
  const postId = post?.id;
  const postStatus = post?.status;
  const scheduleMode = post?.scheduleMode;
  const scheduledAt = post?.scheduledAt;

  useEffect(() => {
    if (
      !postId ||
      (postStatus !== "SCHEDULED" && postStatus !== "PUBLISHING") ||
      scheduleMode !== "LOCAL" ||
      !scheduledAt
    ) {
      return;
    }
    const dueAt = new Date(scheduledAt).getTime();
    if (!Number.isFinite(dueAt)) return;

    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let attempt = 0;

    const refresh = async () => {
      if (stopped) return;
      await Promise.all([
        queryClient.refetchQueries({
          queryKey: telegramPostKeys.managedLists(channelId),
          type: "active",
        }),
        queryClient.refetchQueries({
          queryKey: telegramPostKeys.managedDetail(channelId, postId),
          type: "active",
          exact: true,
        }),
      ]);
      if (stopped) return;
      const current = findManagedPostInPages(queryClient, channelId, postId);
      if (current && current.status !== "SCHEDULED" && current.status !== "PUBLISHING") {
        await Promise.all([
          queryClient.invalidateQueries({
            queryKey: telegramPostKeys.managedCalendar(channelId),
          }),
          queryClient.invalidateQueries({
            queryKey: telegramPostKeys.linkTargets(channelId),
          }),
        ]);
        return;
      }
      attempt += 1;
      if (attempt < RETRY_DELAYS_MS.length) {
        timer = setTimeout(refresh, RETRY_DELAYS_MS[attempt]);
      }
    };

    const armDueWake = () => {
      const remaining = dueAt - Date.now();
      if (remaining <= 0) {
        void refresh();
        return;
      }
      timer = setTimeout(armDueWake, Math.min(remaining, MAX_TIMER_DELAY_MS));
    };
    armDueWake();

    return () => {
      stopped = true;
      if (timer) clearTimeout(timer);
    };
  }, [
    channelId,
    postId,
    postStatus,
    queryClient,
    scheduleMode,
    scheduledAt,
  ]);
}
