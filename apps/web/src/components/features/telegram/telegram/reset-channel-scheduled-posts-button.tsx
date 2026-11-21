"use client";

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { RotateCcw } from "lucide-react";
import { telegramChannelsApi } from "@/lib/api";
import { telegramPostKeys } from "@/lib/query-keys";
import { invalidateManagedPostScheduleReads } from "./managed-post-cache";
import { Button, ConfirmDeleteModal } from "@/components/ui/primitives";
import { useAppToast } from "@/providers/toast-provider";
import { TelegramCardMenuAction } from "./telegram-card-actions-menu";
import { useI18n } from "@/providers/i18n-provider";
import { safeApiErrorMessage } from "@/i18n/error-localization";

export function ResetChannelScheduledPostsButton({
  channelId,
  channelTitle,
  postIds = [],
  onCompleted,
  presentation = "button",
}: {
  channelId: string;
  channelTitle: string;
  postIds?: string[];
  onCompleted?: () => void;
  presentation?: "button" | "menu";
}) {
  const { locale, t } = useI18n();
  const queryClient = useQueryClient();
  const { pushToast } = useAppToast();
  const [confirmationOpen, setConfirmationOpen] = useState(false);
  const resetScheduled = useMutation({
    mutationFn: () =>
      telegramChannelsApi.resetChannelScheduledPostsToDrafts(channelId, postIds),
    onSuccess: async (result) => {
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: telegramPostKeys.managedLists(channelId),
        }),
        invalidateManagedPostScheduleReads(queryClient, channelId),
        queryClient.invalidateQueries({
          queryKey: telegramPostKeys.managedHistories(channelId),
        }),
        queryClient.invalidateQueries({
          queryKey: telegramPostKeys.linkTargets(channelId),
        }),
        queryClient.invalidateQueries({
          queryKey: telegramPostKeys.postGroups(channelId),
        }),
      ]);
      onCompleted?.();
      const unresolved = result.results?.filter((item) => item.status !== "DRAFTED") ?? [];
      const deleted = result.remoteScheduledDeletedCount;
      const returned = result.postsReturnedToDraftCount;
      pushToast(
        unresolved.length ? t("telegram.posts.support.reschedulePostFailed") + " · " + unresolved.length : deleted || returned
          ? t("telegram.posts.support.resetResult", { deleted, returned })
          : t("telegram.posts.support.resetEmpty"),
        unresolved.length ? "info" : "success",
        7000,
      );
    },
    onError: (error) => {
      pushToast(
        safeApiErrorMessage(
          error,
          locale,
          t,
          t("telegram.posts.support.resetError"),
        ),
        "error",
        7000,
      );
    },
  });

  return (
    <>
      {presentation === "menu" ? (
        <TelegramCardMenuAction
          label={
            resetScheduled.isPending
              ? t("telegram.posts.support.returning")
              : t("telegram.posts.support.returnDrafts")
          }
          icon={<RotateCcw size={17} className="shrink-0" />}
          danger
          disabled={resetScheduled.isPending}
          onClick={() => setConfirmationOpen(true)}
        />
      ) : (
        <Button
          variant="danger"
          className="shrink-0"
          disabled={resetScheduled.isPending}
          onClick={() => setConfirmationOpen(true)}
        >
          <span className="inline-flex items-center gap-2">
            <RotateCcw size={17} className="shrink-0" />
            {resetScheduled.isPending
              ? t("telegram.posts.support.returning")
              : t("telegram.posts.support.returnDrafts")}
          </span>
        </Button>
      )}
      <ConfirmDeleteModal
        open={confirmationOpen}
        onClose={() => setConfirmationOpen(false)}
        entityName={channelTitle}
        label={t("telegram.posts.support.returnDrafts")}
        description={t("telegram.posts.support.returnDraftsDescription")}
        onConfirm={() => resetScheduled.mutateAsync()}
      />
    </>
  );
}
