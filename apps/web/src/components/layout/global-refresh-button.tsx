"use client";

import { RefreshCw } from "lucide-react";
import { useI18n } from "@/providers/i18n-provider";

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
  const { t } = useI18n();
  return (
    <button
      type="button"
      onClick={onRefresh}
      className={`${hidden ? "hidden" : "flex"} ${compact ? "h-9 w-9" : "h-10 w-10"} items-center justify-center rounded-lg border border-neutral-800 text-neutral-300 transition hover:bg-neutral-900 hover:text-white`}
      aria-label={t("navigation.refreshData")}
      title={t("navigation.refreshData")}
    >
      <RefreshCw
        size={compact ? 16 : 18}
        className={refreshing ? "animate-spin" : ""}
      />
    </button>
  );
}
