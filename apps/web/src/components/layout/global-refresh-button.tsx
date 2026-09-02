"use client";

import { RefreshCw } from "lucide-react";

export function GlobalRefreshButton({
  refreshing,
  onRefresh,
  compact = false,
  hidden = false,
}: {
  refreshing: boolean;
  onRefresh: () => void;
  compact?: boolean;
  hidden?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onRefresh}
      className={`${hidden ? "hidden" : "flex"} ${compact ? "h-9 w-9" : "h-10 w-10"} items-center justify-center rounded-lg border border-neutral-800 text-neutral-300 transition hover:bg-neutral-900 hover:text-white`}
      aria-label="Refresh data"
      title="Refresh data"
    >
      <RefreshCw
        size={compact ? 16 : 18}
        className={refreshing ? "animate-spin" : ""}
      />
    </button>
  );
}
