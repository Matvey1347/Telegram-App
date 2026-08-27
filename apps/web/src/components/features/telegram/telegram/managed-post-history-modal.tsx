"use client";

import { formatDateTime } from "@/lib/date-format";

import { useQuery } from "@tanstack/react-query";
import { LoaderCircle } from "lucide-react";
import { Button, Modal } from "@/components/ui/primitives";
import {
  telegramChannelsApi,
  type TelegramManagedPostRevision,
} from "@/lib/api";
import { telegramPostKeys } from "@/lib/query-keys";

function revisionReason(reason: string) {
  return reason
    .replace(/_/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
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
  const history = useQuery({
    queryKey: telegramPostKeys.managedHistory(channelId, postId),
    queryFn: () => telegramChannelsApi.managedPostHistory(channelId, postId),
    enabled: open,
    staleTime: 30_000,
    refetchOnWindowFocus: false,
  });

  return (
    <Modal open={open} onClose={onClose} title="Post history">
      <p className="mb-4 text-xs text-neutral-400">
        Automatic backups are kept for 7 days before risky changes.
      </p>
      {history.isLoading || history.isFetching ? (
        <div className="flex items-center gap-2 py-5 text-sm text-neutral-400">
          <LoaderCircle size={15} className="animate-spin" />
          Loading history…
        </div>
      ) : history.isError ? (
        <p className="py-5 text-sm text-red-300">Could not load history.</p>
      ) : history.data?.length ? (
        <div className="space-y-2">
          {history.data.slice(0, 6).map((revision) => (
            <div
              key={revision.id}
              className="flex items-center justify-between gap-3 rounded-md border border-neutral-800 bg-neutral-950/70 px-3 py-2"
            >
              <div className="min-w-0">
                <p className="truncate text-sm text-white">
                  {revisionReason(revision.reason)}
                </p>
                <p className="text-xs text-neutral-400">
                  {formatDateTime(revision.createdAt)}
                </p>
              </div>
              <Button
                type="button"
                variant="secondary"
                disabled={restorePending}
                onClick={() => onRestore(revision)}
              >
                Restore
              </Button>
            </div>
          ))}
        </div>
      ) : (
        <p className="py-5 text-sm text-neutral-500">
          No backups yet. A backup is created before publish, schedule, sync
          changes, restore, delete, and manual edits.
        </p>
      )}
    </Modal>
  );
}
