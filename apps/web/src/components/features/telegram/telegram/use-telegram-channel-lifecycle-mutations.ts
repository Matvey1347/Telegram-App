"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { telegramChannelsApi } from "@/lib/api";
import { dashboardKeys, telegramChannelKeys } from "@/lib/query-keys";
import { moveTelegramChannelBetweenLifecycleCaches } from "@/lib/features/telegram/telegram-channel-cache";
import { useAppToast } from "@/providers/toast-provider";

function errorMessage(error: unknown, fallback: string) {
  if (error && typeof error === "object" && "message" in error) {
    const message = String((error as { message?: unknown }).message || "").trim();
    if (message) return message;
  }
  return fallback;
}

export function useTelegramChannelLifecycleMutations() {
  const queryClient = useQueryClient();
  const { pushToast } = useAppToast();

  const reconcile = (channel: Parameters<typeof moveTelegramChannelBetweenLifecycleCaches>[1]) => {
    moveTelegramChannelBetweenLifecycleCaches(queryClient, channel);
    queryClient.invalidateQueries({ queryKey: telegramChannelKeys.selects() });
    queryClient.invalidateQueries({ queryKey: dashboardKeys.summary() });
  };

  const archiveMutation = useMutation({
    mutationFn: (id: string) => telegramChannelsApi.archive(id),
    onSuccess: (channel) => {
      reconcile(channel);
      pushToast("Channel archived.", "success");
    },
    onError: (error: unknown) =>
      pushToast(errorMessage(error, "Failed to archive channel."), "error"),
  });
  const restoreMutation = useMutation({
    mutationFn: (id: string) => telegramChannelsApi.restore(id),
    onSuccess: (channel) => {
      reconcile(channel);
      pushToast("Channel restored.", "success");
    },
    onError: (error: unknown) =>
      pushToast(errorMessage(error, "Failed to restore channel."), "error"),
  });
  const moveToTestMutation = useMutation({
    mutationFn: (id: string) => telegramChannelsApi.moveToTest(id),
    onSuccess: (channel) => {
      reconcile(channel);
      pushToast("Channel moved to For Test.", "success");
    },
    onError: (error: unknown) =>
      pushToast(errorMessage(error, "Failed to move channel to For Test."), "error"),
  });
  const moveToActiveMutation = useMutation({
    mutationFn: (id: string) => telegramChannelsApi.moveToActive(id),
    onSuccess: (channel) => {
      reconcile(channel);
      pushToast("Channel moved to Active.", "success");
    },
    onError: (error: unknown) =>
      pushToast(errorMessage(error, "Failed to move channel to Active."), "error"),
  });

  return {
    archiveMutation,
    restoreMutation,
    moveToTestMutation,
    moveToActiveMutation,
  };
}
