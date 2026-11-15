"use client";

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { CalendarClock, Check, CircleAlert, RotateCw } from "lucide-react";
import type { RescheduleChannelScheduledPostProgress } from "@telegram-system/shared";
import { Button, Modal } from "@/components/ui/primitives";
import { telegramChannelsApi } from "@/lib/api";
import { telegramPostKeys } from "@/lib/query-keys";
import { useI18n } from "@/providers/i18n-provider";
import type { TranslationFunction } from "@/providers/i18n-provider";
import type { TranslationKey } from "@/i18n/catalog";
import { useAppToast } from "@/providers/toast-provider";
import { invalidateManagedPostScheduleReads } from "./managed-post-cache";

export function RescheduleChannelPostsButton({
  channelId,
  channelTitle,
}: {
  channelId: string;
  channelTitle: string;
}) {
  const { t } = useI18n();
  const queryClient = useQueryClient();
  const { pushToast } = useAppToast();
  const [open, setOpen] = useState(false);
  const [progress, setProgress] = useState<RescheduleChannelScheduledPostProgress[]>([]);
  const reschedule = useMutation({
    mutationFn: () =>
      telegramChannelsApi.rescheduleChannelScheduledPosts(channelId, (item) =>
        setProgress((current) => {
          if (!item.postId) return [...current.filter((entry) => entry.postId), item];
          const existing = current.findIndex((entry) => entry.postId === item.postId);
          if (existing < 0) return [...current, item];
          return current.map((entry, index) => index === existing ? item : entry);
        }),
      ),
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
      setOpen(false);
      pushToast(
        t("telegram.posts.support.rescheduleResult", {
          rescheduled: result.rescheduledCount,
          drafts: result.returnedToDraftCount,
          failed: result.failedCount,
        }),
        result.failedCount ? "error" : "success",
        9000,
      );
    },
    onError: () =>
      pushToast(t("telegram.posts.support.rescheduleError"), "error", 7000),
  });

  return (
    <>
      <Button
        type="button"
        variant="secondary"
        className="h-[42px] shrink-0"
        onClick={() => setOpen(true)}
        disabled={reschedule.isPending}
      >
        <CalendarClock size={17} /> {t("telegram.posts.support.rescheduleAll")}
      </Button>
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={t("telegram.posts.support.rescheduleAll")}
        size="sm"
      >
        <div className="space-y-4">
          <p className="text-sm text-neutral-300">
            {t("telegram.posts.support.rescheduleConfirm", {
              channel: channelTitle,
            })}
          </p>
          {reschedule.error ? (
            <p className="text-sm text-rose-300">
              {t("telegram.posts.support.rescheduleError")}
            </p>
          ) : null}
          {reschedule.isPending ? (
            <section
              className="max-h-72 space-y-2 overflow-y-auto rounded-lg border border-neutral-700 bg-neutral-950/60 p-3"
              aria-live="polite"
            >
              <p className="text-sm font-medium text-neutral-200">
                {t("telegram.posts.support.rescheduleProgress", {
                  completed: progress.filter((item) =>
                    ["RESCHEDULED", "DRAFTED", "FAILED"].includes(item.stage),
                  ).length,
                })}
              </p>
              {progress.map((item, index) => (
                <div
                  key={item.postId ?? `progress-${index}`}
                  className="flex items-start gap-2 border-t border-neutral-800 pt-2 text-sm"
                >
                  {item.stage === "FAILED" ? (
                    <CircleAlert size={16} className="mt-0.5 shrink-0 text-rose-300" />
                  ) : item.stage === "RESCHEDULED" || item.stage === "DRAFTED" ? (
                    <Check size={16} className="mt-0.5 shrink-0 text-emerald-300" />
                  ) : (
                    <RotateCw size={15} className="mt-0.5 shrink-0 animate-spin text-blue-300" />
                  )}
                  <div className="min-w-0">
                    <p className="truncate text-neutral-100">
                      {item.title || item.postId || t("telegram.posts.support.reconcilingTelegram")}
                    </p>
                    <p className={item.stage === "FAILED" ? "text-rose-300" : "text-neutral-400"}>
                      {progressStageLabel(item.stage, t)}
                      {item.scheduledAt ? ` · ${new Date(item.scheduledAt).toLocaleString()}` : ""}
                      {item.message ? ` · ${item.message}` : ""}
                    </p>
                  </div>
                </div>
              ))}
            </section>
          ) : null}
          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="secondary"
              disabled={reschedule.isPending}
              onClick={() => setOpen(false)}
            >
              {t("common.cancel")}
            </Button>
            <Button
              type="button"
              disabled={reschedule.isPending}
              onClick={() => reschedule.mutate()}
            >
              <RotateCw
                size={16}
                className={reschedule.isPending ? "animate-spin" : ""}
              />
              {reschedule.isPending
                ? t("telegram.posts.support.rescheduling")
                : t("telegram.posts.support.rescheduleAll")}
            </Button>
          </div>
        </div>
      </Modal>
    </>
  );
}

function progressStageLabel(
  stage: RescheduleChannelScheduledPostProgress["stage"],
  t: TranslationFunction,
) {
  const keyByStage: Record<RescheduleChannelScheduledPostProgress["stage"], TranslationKey> = {
    RECONCILING_TELEGRAM: "telegram.posts.support.reconcilingTelegram",
    REMOVING_OLD_SCHEDULE: "telegram.posts.support.removingOldSchedule",
    SCHEDULING_AGAIN: "telegram.posts.support.schedulingAgain",
    RETURNING_TO_DRAFT: "telegram.posts.support.returningToDraft",
    RESCHEDULED: "telegram.posts.support.rescheduled",
    DRAFTED: "telegram.posts.support.returnedToDraft",
    FAILED: "telegram.posts.support.reschedulePostFailed",
  };
  return t(keyByStage[stage]);
}
