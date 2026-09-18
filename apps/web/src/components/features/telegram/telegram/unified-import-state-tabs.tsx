"use client";

import { useI18n } from "@/providers/i18n-provider";

export type UnifiedImportState = "pending" | "imported";

export function UnifiedImportStateTabs({
  value,
  pendingCount,
  importedCount,
  onChange,
}: {
  value: UnifiedImportState;
  pendingCount: number;
  importedCount: number;
  onChange: (value: UnifiedImportState) => void;
}) {
  const { t } = useI18n();
  return (
    <div className="mb-3 grid grid-cols-2 gap-1 rounded-lg border border-neutral-800 bg-neutral-900/70 p-1 text-xs">
      {(["pending", "imported"] as const).map((state) => (
        <button
          key={state}
          type="button"
          onClick={() => onChange(state)}
          className={`rounded-md px-2 py-1.5 transition ${
            value === state
              ? "bg-blue-600 text-white"
              : "text-neutral-400 hover:bg-neutral-800 hover:text-white"
          }`}
        >
          {state === "pending"
            ? t("telegram.posts.import.tabNotImported")
            : t("telegram.posts.import.tabImported")}{" "}
          ({state === "pending" ? pendingCount : importedCount})
        </button>
      ))}
    </div>
  );
}

export function ImportStateBadge({ imported }: { imported?: boolean }) {
  const { t } = useI18n();
  return (
    <span
      className={`shrink-0 rounded px-1.5 py-0.5 text-[11px] ${
        imported
          ? "bg-emerald-950/70 text-emerald-200"
          : "bg-neutral-800 text-neutral-300"
      }`}
    >
      {imported
        ? `✓ ${t("telegram.posts.import.tabImported")}`
        : t("telegram.posts.import.tabNotImported")}
    </span>
  );
}
