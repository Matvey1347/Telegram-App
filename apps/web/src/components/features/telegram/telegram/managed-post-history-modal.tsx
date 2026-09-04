"use client";

import { formatDateTime } from "@/lib/date-format";

import { useQuery } from "@tanstack/react-query";
import { LoaderCircle } from "lucide-react";
import { IconAvatar } from "@/components/icons/icon-avatar";
import { Button, Modal } from "@/components/ui/primitives";
import {
  telegramChannelsApi,
  type TelegramManagedPostRevision,
} from "@/lib/api";
import { telegramPostKeys } from "@/lib/query-keys";
import { useI18n } from "@/providers/i18n-provider";

function revisionAction(
  reason: string,
  actorName: string,
  t: ReturnType<typeof useI18n>["t"],
) {
  const params = { name: actorName };
  switch (reason) {
    case "created":
      return t("telegram.posts.history.activity.created", params);
    case "before_update":
    case "before_edit":
      return t("telegram.posts.history.activity.updated", params);
    case "before_publish":
      return t("telegram.posts.history.activity.published", params);
    case "before_schedule":
      return t("telegram.posts.history.activity.scheduled", params);
    case "before_manual_link":
      return t("telegram.posts.history.activity.linkChanged", params);
    case "before_restore":
      return t("telegram.posts.history.activity.restored", params);
    case "before_delete":
      return t("telegram.posts.history.activity.deleted", params);
    case "before_return_to_draft":
    case "before_channel_scheduled_reset":
      return t("telegram.posts.history.activity.returnedToDraft", params);
    case "before_move":
      return t("telegram.posts.history.activity.moved", params);
    case "before_sync_missing":
    case "before_sync_broken":
    case "before_sync_publish_transition":
    case "before_sync_update":
      return t("telegram.posts.history.activity.synchronized", params);
    default:
      return t("telegram.posts.history.activity.changed", params);
  }
}

export function ManagedPostHistoryModal({
  open,
  channelId,
  postId,
  restorePending,
  onClose,
  onRestore,
}: {
  open: boolean;
  channelId: string;
  postId: string;
  restorePending: boolean;
  onClose: () => void;
  onRestore: (revision: TelegramManagedPostRevision) => void;
}) {
  const { locale, t } = useI18n();
  const history = useQuery({
    queryKey: telegramPostKeys.managedHistory(channelId, postId),
    queryFn: () => telegramChannelsApi.managedPostHistory(channelId, postId),
    enabled: open,
    staleTime: 30_000,
    refetchOnWindowFocus: false,
  });

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={t("telegram.posts.support.history")}
    >
      <p className="mb-4 text-xs text-neutral-400">
        {t("telegram.posts.support.historyDescription")}
      </p>
      {history.isLoading || history.isFetching ? (
        <div className="flex items-center gap-2 py-5 text-sm text-neutral-400">
          <LoaderCircle size={15} className="animate-spin" />
          {t("telegram.posts.support.loadingHistory")}
        </div>
      ) : history.isError ? (
        <p className="py-5 text-sm text-red-300">
          {t("telegram.posts.support.historyError")}
        </p>
      ) : history.data?.length ? (
        <div className="max-h-[60dvh] space-y-2 overflow-y-auto pr-1">
          {history.data.map((revision) => {
            const actorName =
              revision.actorMember?.user.name ||
              t("telegram.posts.history.systemActor");
            return (
              <div
                key={revision.id}
                className="flex items-center justify-between gap-3 rounded-md border border-neutral-800 bg-neutral-950/70 px-3 py-2"
              >
                <IconAvatar
                  icon={revision.actorMember?.avatarPresentation}
                  label={actorName}
                  size="sm"
                />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm text-white">
                    {revisionAction(revision.reason, actorName, t)}
                  </p>
                  <p className="text-xs text-neutral-400">
                    {actorName} · {formatDateTime(revision.createdAt, locale)}
                  </p>
                </div>
                <Button
                  type="button"
                  variant="secondary"
                  disabled={restorePending}
                  onClick={() => onRestore(revision)}
                >
                  {t("telegram.posts.support.restore")}
                </Button>
              </div>
            );
          })}
        </div>
      ) : (
        <p className="py-5 text-sm text-neutral-500">
          {t("telegram.posts.support.noBackups")}
        </p>
      )}
    </Modal>
  );
}
