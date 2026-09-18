import {
  AlertTriangle,
  CheckCircle2,
  CircleDashed,
  LoaderCircle,
  MinusCircle,
  XCircle,
} from "lucide-react";
import type {
  TelegramUnifiedImportManifest,
  TelegramUnifiedImportProgressItem,
  TelegramUnifiedImportResult,
} from "@telegram-system/shared";
import { useI18n } from "@/providers/i18n-provider";
import { ActionBadge } from "./unified-import-entities-preview";

export type UnifiedImportProgressEntry = {
  item: TelegramUnifiedImportProgressItem;
  current: number;
  total: number;
};

export type UnifiedImportProgressStatus =
  | "running"
  | "completed"
  | "completed-with-errors"
  | "failed"
  | "cancelled";

export function applyUnifiedImportProgressToManifest(
  manifest: TelegramUnifiedImportManifest,
  item: TelegramUnifiedImportProgressItem,
) {
  if (item.kind !== "operation" || item.status !== "success" || !item.ref)
    return manifest;
  if (
    item.section === "groups" ||
    item.section === "hypotheses" ||
    item.section === "posts"
  ) {
    const rows = manifest[item.section] ?? [];
    if (!rows.some((row) => row.ref === item.ref)) return manifest;
    return {
      ...manifest,
      [item.section]: rows.map((row) =>
        row.ref === item.ref ? { ...row, imported: true } : row,
      ),
    };
  }
  if (item.section === "schedule") {
    const schedule = manifest.schedule ?? [];
    if (
      !schedule.some(
        (row) =>
          (row.postRef ?? row.postId) === item.ref &&
          (row.action ?? "SCHEDULE") === item.action,
      )
    )
      return manifest;
    return {
      ...manifest,
      schedule: schedule.map((row) =>
        (row.postRef ?? row.postId) === item.ref &&
        (row.action ?? "SCHEDULE") === item.action
          ? { ...row, imported: true }
          : row,
      ),
    };
  }
  const match = /^delete:(post|hypothesis|group):(.+)$/.exec(item.ref);
  if (item.section !== "deletions" || !match) return manifest;
  const section = `${match[1]}s` as "posts" | "hypotheses" | "groups";
  const rows = manifest.delete?.[section] ?? [];
  if (!rows.some((row) => row.id === match[2])) return manifest;
  return {
    ...manifest,
    delete: {
      ...manifest.delete,
      [section]: rows.map((row) =>
        row.id === match[2] ? { ...row, imported: true } : row,
      ),
    },
  };
}

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

export function successfulUnifiedImportProgressCount(
  summary: ReturnType<typeof summarizeUnifiedImportProgress>,
) {
  return (
    summary.created +
    summary.updated +
    summary.deleted +
    summary.scheduled +
    summary.unscheduled
  );
}

export function reconcileUnifiedImportResult(
  entries: UnifiedImportProgressEntry[],
  result: TelegramUnifiedImportResult,
) {
  const operationTotal = result.sections.reduce(
    (total, section) =>
      total +
      section.created +
      section.updated +
      section.deleted +
      section.scheduled +
      section.unscheduled +
      section.failed.length,
    0,
  );
  const reconciled = [...entries];
  for (const section of result.sections) {
    for (const failure of section.failed) {
      if (
        reconciled.some(
          ({ item }) => item.status === "failed" && item.ref === failure.ref,
        )
      )
        continue;
      reconciled.push({
        current: Math.min(reconciled.length + 1, operationTotal),
        total: operationTotal,
        item: {
          kind: "operation",
          section: section.key,
          status: "failed",
          ref: failure.ref,
          label: failure.ref,
          message: `${failure.ref}: ${failure.error}`,
        },
      });
    }
  }
  return reconciled;
}

export function UnifiedImportProgress({
  entries,
  status,
  errorMessage,
}: {
  entries: UnifiedImportProgressEntry[];
  status: UnifiedImportProgressStatus;
  errorMessage?: string;
}) {
  const { t } = useI18n();
  const summary = summarizeUnifiedImportProgress(entries);
  const latest = entries.at(-1);
  const operationEntries = entries.filter(
    ({ item }) => item.kind === "operation",
  );
  const successful = successfulUnifiedImportProgressCount(summary);
  const StatusIcon =
    status === "running"
      ? LoaderCircle
      : status === "completed"
        ? CheckCircle2
        : status === "completed-with-errors"
          ? AlertTriangle
          : status === "cancelled"
            ? MinusCircle
            : XCircle;
  const statusTone =
    status === "completed"
      ? "text-emerald-400"
      : status === "completed-with-errors"
        ? "text-amber-400"
        : status === "failed"
          ? "text-rose-400"
          : status === "running"
            ? "text-blue-400"
            : "text-neutral-400";
  const stats = [
    [
      t("telegram.posts.import.progressSuccessful"),
      successful,
      "text-emerald-400",
    ],
    [
      t("telegram.posts.import.progressCreated"),
      summary.created,
      "text-emerald-400",
    ],
    [
      t("telegram.posts.import.progressUpdated"),
      summary.updated,
      "text-blue-400",
    ],
    [
      t("telegram.posts.import.progressDeleted"),
      summary.deleted,
      "text-rose-400",
    ],
    [
      t("telegram.posts.import.progressScheduled"),
      summary.scheduled,
      "text-violet-400",
    ],
    [
      t("telegram.posts.import.progressUnscheduled"),
      summary.unscheduled,
      "text-amber-400",
    ],
    [t("telegram.posts.import.errors"), summary.failed, "text-red-400"],
  ] as const;

  return (
    <section
      aria-label={t("telegram.posts.import.progressTitle")}
      className="rounded-xl border border-neutral-800 bg-neutral-950/70 p-3"
    >
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="inline-flex items-center gap-2 text-sm font-semibold text-neutral-100">
          <StatusIcon
            className={`${statusTone} ${status === "running" ? "animate-spin" : ""}`}
            size={16}
          />
          {t("telegram.posts.import.progressTitle")}
          <span className={`text-xs font-medium ${statusTone}`}>
            {t(`telegram.posts.import.progressStatus.${status}`)}
          </span>
        </div>
        {latest ? (
          <span className="text-xs text-neutral-400">
            {latest.current}/{latest.total}
          </span>
        ) : null}
      </div>
      <div className="mb-3 grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-7">
        {stats.map(([label, value, valueTone]) => (
          <div
            key={label}
            className="rounded-lg border border-neutral-800 px-2 py-1.5"
          >
            <div className="text-[11px] text-neutral-500">{label}</div>
            <div className={`text-sm font-semibold ${valueTone}`}>{value}</div>
          </div>
        ))}
      </div>
      {errorMessage ? (
        <p
          role="alert"
          className="mb-2 rounded-lg border border-rose-900/80 bg-rose-950/30 px-3 py-2 text-xs text-rose-200"
        >
          {errorMessage}
        </p>
      ) : null}
      {operationEntries.length ? (
        <div className="max-h-48 space-y-1 overflow-y-auto pr-1" role="log">
          {operationEntries.map(({ item }, index) => {
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
                <span
                  className={
                    item.status === "failed"
                      ? "min-w-0 break-words text-rose-200"
                      : "truncate"
                  }
                >
                  {item.message}
                </span>
              </div>
            );
          })}
        </div>
      ) : status === "running" ? (
        <p role="status" className="text-xs text-neutral-400">
          {latest?.item.message ?? t("telegram.posts.import.progressStarting")}
        </p>
      ) : null}
    </section>
  );
}
