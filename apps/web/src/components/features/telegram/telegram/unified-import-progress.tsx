import {
  CheckCircle2,
  CircleDashed,
  LoaderCircle,
  MinusCircle,
  XCircle,
} from "lucide-react";
import type { TelegramUnifiedImportProgressItem } from "@telegram-system/shared";
import { useI18n } from "@/providers/i18n-provider";
import { ActionBadge } from "./unified-import-entities-preview";

export type UnifiedImportProgressEntry = {
  item: TelegramUnifiedImportProgressItem;
  current: number;
  total: number;
};

export function summarizeUnifiedImportProgress(
  entries: UnifiedImportProgressEntry[],
) {
  const completed = entries.filter(
    ({ item }) =>
      item.kind === "operation" &&
      ["success", "failed", "skipped"].includes(item.status),
  );
  const count = (action: TelegramUnifiedImportProgressItem["action"]) =>
    completed.filter(
      ({ item }) => item.status === "success" && item.action === action,
    ).length;
  return {
    created: count("CREATE"),
    updated: count("UPDATE") + count("ARCHIVE"),
    deleted: count("DELETE"),
    scheduled: count("SCHEDULE"),
    unscheduled: count("UNSCHEDULE"),
    failed: completed.filter(({ item }) => item.status === "failed").length,
    skipped: completed.filter(({ item }) => item.status === "skipped").length,
  };
}

export function UnifiedImportProgress({
  entries,
  busy,
}: {
  entries: UnifiedImportProgressEntry[];
  busy: boolean;
}) {
  const { t } = useI18n();
  if (!entries.length) return null;
  const summary = summarizeUnifiedImportProgress(entries);
  const latest = entries.at(-1)!;
  const stats = [
    [t("telegram.posts.import.progressCreated"), summary.created],
    [t("telegram.posts.import.progressUpdated"), summary.updated],
    [t("telegram.posts.import.progressDeleted"), summary.deleted],
    [t("telegram.posts.import.progressScheduled"), summary.scheduled],
    [t("telegram.posts.import.progressUnscheduled"), summary.unscheduled],
    [t("telegram.posts.import.errors"), summary.failed],
  ] as const;

  return (
    <section
      aria-label={t("telegram.posts.import.progressTitle")}
      className="rounded-xl border border-neutral-800 bg-neutral-950/70 p-3"
    >
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="inline-flex items-center gap-2 text-sm font-semibold text-neutral-100">
          {busy ? (
            <LoaderCircle className="animate-spin text-blue-400" size={16} />
          ) : (
            <CheckCircle2 className="text-emerald-400" size={16} />
          )}
          {t("telegram.posts.import.progressTitle")}
        </div>
        <span className="text-xs text-neutral-400">
          {latest.current}/{latest.total}
        </span>
      </div>
      <div className="mb-3 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
        {stats.map(([label, value]) => (
          <div
            key={label}
            className="rounded-lg border border-neutral-800 px-2 py-1.5"
          >
            <div className="text-[11px] text-neutral-500">{label}</div>
            <div className="text-sm font-semibold text-neutral-100">
              {value}
            </div>
          </div>
        ))}
      </div>
      <div className="max-h-48 space-y-1 overflow-y-auto pr-1" role="log">
        {entries.slice(-40).map(({ item }, index) => {
          const Icon =
            item.status === "failed"
              ? XCircle
              : item.status === "skipped"
                ? MinusCircle
                : item.status === "started"
                  ? CircleDashed
                  : CheckCircle2;
          return (
            <div
              key={`${item.kind}:${item.section}:${item.ref ?? item.status}:${index}`}
              className="flex items-center gap-2 rounded-md px-2 py-1 text-xs text-neutral-300"
            >
              <Icon
                size={14}
                className={
                  item.status === "failed"
                    ? "text-rose-400"
                    : item.status === "skipped"
                      ? "text-neutral-500"
                      : item.status === "started"
                        ? "text-blue-400"
                        : "text-emerald-400"
                }
              />
              {item.action ? <ActionBadge action={item.action} /> : null}
              <span className="truncate">{item.message}</span>
            </div>
          );
        })}
      </div>
    </section>
  );
}
