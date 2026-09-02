
import { AlertTriangle } from "lucide-react";
import type { TelegramManagedPostsImportProgressItem } from "@/lib/api";
import { useI18n } from "@/providers/i18n-provider";
import { TELEGRAM_POSTS_ERROR_KEYS } from "@telegram-system/shared";
import type { TranslationKey } from "@/i18n/catalog";

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
  const { t } = useI18n();
  return (
    <div className="grid gap-2 sm:grid-cols-4">
      <ImportStat label={t("telegram.posts.import.parsedRows")} value={parsed} />
      <ImportStat label={t("telegram.posts.import.successful")} value={successful} tone="success" />
      <ImportStat label={t("telegram.posts.import.skipped")} value={skipped} tone="warning" />
      <ImportStat label={t("telegram.posts.import.errors")} value={errors} tone="danger" />
    </div>
  );
}

export function ManagedPostsImportErrors({
  rows,
}: {
  rows: TelegramManagedPostsImportProgressItem[];
}) {
  const { locale, t } = useI18n();
  if (!rows.length) return null;
  return (
    <div className="rounded-lg border border-rose-800/70 bg-rose-950/25 p-3 text-sm text-rose-100">
      <div className="mb-2 flex items-center gap-2 font-medium">
        <AlertTriangle size={16} />
        {t("telegram.posts.import.errorTitle", { count: rows.length })}
      </div>
      <ul className="space-y-1 text-xs">
        {rows.slice(0, 5).map((item) => {
          const errorKey = item.errorCode && item.errorCode in TELEGRAM_POSTS_ERROR_KEYS
            ? TELEGRAM_POSTS_ERROR_KEYS[item.errorCode as keyof typeof TELEGRAM_POSTS_ERROR_KEYS] as TranslationKey
            : null;
          const error = errorKey
            ? t(errorKey, item.errorParams)
            : locale === "en" && item.error?.trim()
              ? item.error
              : t("telegram.posts.import.unknownRowError");
          return (
            <li key={`${item.index}-${item.errorCode || item.error || "unknown"}`}>
              {t("telegram.posts.import.errorRow", { row: item.index + 1, error })}
            </li>
          );
        })}
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
