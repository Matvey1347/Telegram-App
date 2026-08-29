"use client";

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { RotateCcw } from "lucide-react";
import { telegramChannelsApi } from "@/lib/api";
import { telegramPostKeys } from "@/lib/query-keys";
import { Button, ConfirmDeleteModal } from "@/components/ui/primitives";
import { useAppToast } from "@/providers/toast-provider";
import { TelegramCardMenuAction } from "./telegram-card-actions-menu";

export function ResetChannelScheduledPostsButton({
  channelId,
  channelTitle,
  onCompleted,
  presentation = "button",
}: {
  channelId: string;
  channelTitle: string;
  onCompleted?: () => void;
  presentation?: "button" | "menu";
}) {
  const queryClient = useQueryClient();
  const { pushToast } = useAppToast();
  const [confirmationOpen, setConfirmationOpen] = useState(false);
  const resetScheduled = useMutation({
    mutationFn: () =>
      telegramChannelsApi.resetChannelScheduledPostsToDrafts(channelId),
    onSuccess: async (result) => {
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: telegramPostKeys.managedLists(channelId),
        }),
        queryClient.invalidateQueries({
          queryKey: telegramPostKeys.managedCalendar(channelId),
        }),
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
      const deleted = result.remoteScheduledDeletedCount;
      const returned = result.postsReturnedToDraftCount;
      pushToast(
        deleted || returned
          ? `Deleted ${deleted} scheduled Telegram messages and returned ${returned} posts to drafts.`
          : "No scheduled Telegram messages or system posts were found.",
        "success",
        7000,
      );
    },
    onError: (error) => {
      pushToast(
        error instanceof Error
          ? error.message
          : "Could not return scheduled posts to drafts",
        "error",
        7000,
      );
    },
  });

  return (
    <>
      {presentation === "menu" ? (
        <TelegramCardMenuAction
          label={resetScheduled.isPending ? "Returning…" : "Return all to drafts"}
          icon={<RotateCcw size={15} />}
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
            <RotateCcw size={15} />
            {resetScheduled.isPending ? "Returning…" : "Return all to drafts"}
          </span>
        </Button>
      )}
      <ConfirmDeleteModal
        open={confirmationOpen}
        onClose={() => setConfirmationOpen(false)}
        entityName={channelTitle}
        label="Return all to drafts"
        description="This permanently deletes every scheduled message currently queued in this Telegram channel. All scheduled posts in Telegram System will become clean drafts and lose their Telegram message IDs and links. Published messages are not affected."
        onConfirm={() => resetScheduled.mutateAsync()}
      />
    </>
  );
}
