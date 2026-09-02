"use client";


import { createPortal } from "react-dom";
import { AlertTriangle, CheckCircle2, LoaderCircle } from "lucide-react";
import type { BulkActionResult } from "@/lib/api";
import { useI18n } from "@/providers/i18n-provider";
import { localizedBulkActionMessage } from "@/lib/features/telegram/telegram-posts-i18n";
export { localizedBulkActionMessage };
import { ChannelMultiSelect } from "./telegram-channel-multi-select";

export type ProgressState = {
  title: string;
  current: number;
  total: number;
  item?: BulkActionResult["results"][number];
  result?: BulkActionResult;
};

export function BulkProgressOverlay({
  progress,
}: {
  progress: ProgressState | null;
}) {
  const { locale, t } = useI18n();
  if (!progress || typeof document === "undefined") return null;
  return createPortal(
    <div className="fixed inset-x-0 top-4 z-[150] flex justify-center px-4">
      <div className="w-full max-w-xl rounded-xl border border-blue-600/70 bg-neutral-950 p-4 shadow-2xl">
        <div className="flex items-center gap-3">
          {!progress.result ? (
            <LoaderCircle className="animate-spin text-blue-400" size={20} />
          ) : progress.result.failedCount ? (
            <AlertTriangle className="text-amber-400" size={20} />
          ) : (
            <CheckCircle2 className="text-emerald-400" size={20} />
          )}
          <div className="min-w-0 flex-1">
            <div className="flex items-center justify-between gap-3">
              <p className="font-medium text-white">{progress.title}</p>
              <span className="text-sm text-neutral-300">
                {progress.current}/{progress.total}
              </span>
            </div>
            <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-neutral-800">
              <div
                className="h-full bg-blue-500 transition-all"
                style={{
                  width: `${progress.total ? (progress.current / progress.total) * 100 : 0}%`,
                }}
              />
            </div>
            {progress.item ? (
              <p className="mt-2 text-sm text-neutral-300">
                {localizedBulkActionMessage(progress.item, locale, t)}
              </p>
            ) : (
              <p className="mt-2 text-sm text-neutral-400">
                {t("telegram.posts.bulk.waiting")}
              </p>
            )}
            {progress.result ? (
              <p className="mt-1 text-xs text-neutral-400">
                {t("telegram.posts.bulk.completed", {
                  success: progress.result.successCount,
                  failed: progress.result.failedCount,
                  skipped: progress.result.skippedCount,
                })}
              </p>
            ) : null}
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}

export function CalendarSummaryCard({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-xl border border-neutral-800 bg-neutral-950/70 px-4 py-3">
      <div className="text-xs uppercase tracking-[0.18em] text-neutral-500">
        {label}
      </div>
      <div className="mt-2 text-2xl font-semibold text-white">{value}</div>
    </div>
  );
}

export { ChannelMultiSelect };
