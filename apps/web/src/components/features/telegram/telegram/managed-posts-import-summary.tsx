import { AlertTriangle } from "lucide-react";
import type { TelegramManagedPostsImportProgressItem } from "@/lib/api";

export function ManagedPostsImportStats({
  parsed,
  successful,
  skipped,
  errors,
}: {
  parsed: number;
  successful: number;
  skipped: number;
  errors: number;
}) {
  return (
    <div className="grid gap-2 sm:grid-cols-4">
      <ImportStat label="Parsed rows" value={parsed} />
      <ImportStat label="Successful" value={successful} tone="success" />
      <ImportStat label="Skipped" value={skipped} tone="warning" />
      <ImportStat label="Errors" value={errors} tone="danger" />
    </div>
  );
}

export function ManagedPostsImportErrors({
  rows,
}: {
  rows: Array<TelegramManagedPostsImportProgressItem & { error: string }>;
}) {
  if (!rows.length) return null;
  return (
    <div className="rounded-lg border border-rose-800/70 bg-rose-950/25 p-3 text-sm text-rose-100">
      <div className="mb-2 flex items-center gap-2 font-medium">
        <AlertTriangle size={16} />
        Import errors ({rows.length})
      </div>
      <ul className="space-y-1 text-xs">
        {rows.slice(0, 5).map((item) => (
          <li key={`${item.index}-${item.error}`}>
            Row {item.index + 1}: {item.error}
          </li>
        ))}
      </ul>
    </div>
  );
}

function ImportStat({
  label,
  value,
  tone = "muted",
}: {
  label: string;
  value: number;
  tone?: "muted" | "success" | "warning" | "danger";
}) {
  const toneClass = {
    muted: "text-neutral-100",
    success: "text-emerald-200",
    warning: "text-amber-200",
    danger: "text-rose-200",
  }[tone];
  return (
    <div className="rounded-lg border border-neutral-800 bg-neutral-950 p-3">
      <div className="text-xs text-neutral-500">{label}</div>
      <div className={`mt-1 text-lg font-semibold ${toneClass}`}>{value}</div>
    </div>
  );
}
