"use client";
import { useLeadText } from "./lead-copy";
import { useOptionalI18n } from "@/providers/i18n-provider";
import { Button } from "@/components/ui/primitives";
export function LeadQueryState({
  loading,
  error,
  empty,
  onRetry,
}: {
  loading: boolean;
  error: boolean;
  empty: boolean;
  onRetry: () => void;
}) {
  const t = useLeadText();
  const ru = useOptionalI18n()?.locale === "ru";
  if (loading)
    return (
      <div
        role="status"
        aria-busy="true"
        className="animate-pulse rounded-lg border border-neutral-800 bg-neutral-900 p-5"
      >
        {t("Loading Lead Discovery…")}
      </div>
    );
  if (error)
    return (
      <div
        role="alert"
        className="rounded-lg border border-rose-900 p-4 text-sm"
      >
        {ru ? "Не удалось загрузить данные. Проверьте доступ и повторите попытку." : "Lead Discovery could not be loaded. Check access and retry."}{" "}
        <Button
          className="max-w-full !whitespace-normal"
          variant="secondary"
          onClick={onRetry}
        >
          {t("Retry")}
        </Button>
      </div>
    );
  if (empty)
    return (
      <p
        role="status"
        className="rounded-lg border border-neutral-800 p-5 text-sm text-neutral-400"
      >
        {t("No records match these filters.")}
      </p>
    );
  return null;
}
