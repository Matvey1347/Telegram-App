"use client";

import { formatDateTime } from "@/lib/date-format";
import {
  formatStatsPeriod,
  formatTelegramPercent,
} from "@/components/features/telegram/telegram/telegram-channel-graphs";
import { Modal } from "@/components/ui/primitives";
import { formatNullableNumber } from "./channel-analytics-format";
import { SnapshotItem, EmptyState } from "./channel-analytics-primitives";

export function SyncStatusModal({
  open,
  onClose,
  latestSnapshot,
  mtprotoStats,
}: {
  open: boolean;
  onClose: () => void;
  latestSnapshot: any;
  mtprotoStats: any;
}) {
  return (
    <Modal open={open} onClose={onClose} title="Sync status">
      {latestSnapshot ? (
        <div className="grid grid-cols-1 gap-3 text-sm md:grid-cols-2">
          <SnapshotItem
            label="Latest snapshot"
            value={formatDateTime(latestSnapshot.syncedAt)}
          />
          <SnapshotItem
            label="Status"
            value={mtprotoStats?.status || "unknown"}
          />
          <SnapshotItem
            label="Followers"
            value={formatNullableNumber(mtprotoStats?.followers?.current)}
          />
          <SnapshotItem
            label="Views / Post"
            value={formatNullableNumber(
              mtprotoStats?.views_per_post?.current,
              1,
            )}
          />
          <SnapshotItem
            label="Shares / Post"
            value={formatNullableNumber(
              mtprotoStats?.shares_per_post?.current,
              1,
            )}
          />
          <SnapshotItem
            label="Reactions / Post"
            value={formatNullableNumber(
              mtprotoStats?.reactions_per_post?.current,
              1,
            )}
          />
          <SnapshotItem
            label="Notifications enabled"
            value={formatTelegramPercent(mtprotoStats?.enabled_notifications)}
          />
          <SnapshotItem
            label="Telegram window"
            value={formatStatsPeriod(
              mtprotoStats?.period,
              mtprotoStats?.graphs,
            )}
          />
        </div>
      ) : (
        <EmptyState text="No channel snapshot yet." />
      )}
    </Modal>
  );
}
