"use client";

import { useOptionalI18n } from "@/providers/i18n-provider";

export function ErrorState({ text }: { text?: string }) {
  const i18n = useOptionalI18n(),
    resolvedText =
      text ?? i18n?.t("common.error.short") ?? "Something went wrong.";
  return (
    <div className="rounded-lg border border-rose-700 bg-rose-950/30 p-4 text-sm text-rose-200">
      {resolvedText}
    </div>
  );
}

export function LoadingState({ text }: { text?: string }) {
  const i18n = useOptionalI18n(),
    resolvedText = text ?? i18n?.t("common.loading") ?? "Loading…";
  return (
    <div
      className="overflow-hidden rounded-lg border border-neutral-800 bg-neutral-900 p-4 sm:p-5"
      role="status"
      aria-label={resolvedText}
    >
      <span className="sr-only">{resolvedText}</span>
      <div className="space-y-3" aria-hidden="true">
        <Skeleton className="h-5 w-40" />
        <Skeleton className="h-3 w-full" />
        <Skeleton className="h-3 w-4/5" />
        <div className="grid grid-cols-2 gap-3 pt-2 sm:grid-cols-4">
          <Skeleton className="h-16" />
          <Skeleton className="h-16" />
          <Skeleton className="h-16" />
          <Skeleton className="h-16" />
        </div>
      </div>
    </div>
  );
}

export function TableLoadingState({
  text = "Loading...",
  columns = 4,
  rows = 5,
}: {
  text?: string;
  columns?: number;
  rows?: number;
}) {
  return (
    <div
      className="overflow-hidden rounded-lg border border-neutral-800 bg-neutral-900"
      role="status"
      aria-label={text}
    >
      <span className="sr-only">{text}</span>
      <div className="border-b border-neutral-800 bg-neutral-900 px-3 py-2">
        <div
          className="grid gap-3"
          style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}
          aria-hidden="true"
        >
          {Array.from({ length: columns }, (_, index) => (
            <Skeleton key={index} className="h-3 w-16" />
          ))}
        </div>
      </div>
      <div className="divide-y divide-neutral-800" aria-hidden="true">
        {Array.from({ length: rows }, (_, rowIndex) => (
          <div
            key={rowIndex}
            className="grid gap-3 bg-neutral-950 px-3 py-3"
            style={{
              gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`,
            }}
          >
            {Array.from({ length: columns }, (_, columnIndex) => (
              <Skeleton
                key={columnIndex}
                className={columnIndex === 0 ? "h-10 w-4/5" : "h-5 w-full"}
              />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

export function Skeleton({ className = "" }: { className?: string }) {
  return (
    <div
      className={`animate-pulse rounded-md bg-neutral-800/80 ${className}`}
      aria-hidden="true"
    />
  );
}

export function EmptyState({ text }: { text?: string }) {
  const t = useOptionalI18n()?.t;
  return (
    <div className="rounded-xl border border-dashed border-neutral-700 p-5 text-neutral-400">
      {text ?? t?.("common.empty") ?? "No data yet."}
    </div>
  );
}
