"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "./finance-controls";
import type { FinanceLocale } from "../i18n/core";

const labels = {
  en: { previous: "Previous", next: "Next", page: "Page" },
  uk: { previous: "Назад", next: "Далі", page: "Сторінка" },
  ru: { previous: "Назад", next: "Далее", page: "Страница" },
} as const;

export function FinanceCursorPagination({
  locale,
  page,
  hasPrevious,
  hasNext,
  loading,
  onPrevious,
  onNext,
}: {
  locale: FinanceLocale;
  page: number;
  hasPrevious: boolean;
  hasNext: boolean;
  loading: boolean;
  onPrevious: () => void;
  onNext: () => void;
}) {
  if (!hasPrevious && !hasNext) return null;
  const t = labels[locale];
  return (
    <nav aria-label={t.page} className="flex items-center justify-between gap-3 rounded-xl border border-neutral-800 bg-neutral-900/50 p-2 text-sm">
      <Button type="button" variant="secondary" disabled={!hasPrevious || loading} onClick={onPrevious}>
        <ChevronLeft size={16} aria-hidden="true" /> {t.previous}
      </Button>
      <span aria-live="polite" className="text-neutral-300">{t.page} {page + 1}</span>
      <Button type="button" variant="secondary" disabled={!hasNext || loading} onClick={onNext}>
        {t.next} <ChevronRight size={16} aria-hidden="true" />
      </Button>
    </nav>
  );
}
