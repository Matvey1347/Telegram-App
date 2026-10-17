"use client";

import type { ConsumerFinanceExpenseNecessity } from "@telegram-system/shared";
import type { FinanceLocale } from "@consumer-finance/web/components/i18n/core";

const copy = {
  en: {
    label: "Required expense",
  },
  uk: {
    label: "Обов’язкова витрата",
  },
  ru: {
    label: "Обязательный расход",
  },
} as const;

export function FinanceNecessityToggle({
  value,
  locale,
  onChange,
  label,
  help,
  className = "",
}: {
  value: ConsumerFinanceExpenseNecessity;
  locale: FinanceLocale;
  onChange: (value: ConsumerFinanceExpenseNecessity) => void;
  label?: string;
  help?: string;
  className?: string;
}) {
  const t = copy[locale];
  const checked = value === "REQUIRED";
  return (
    <div className={className}>
      <div className="flex min-h-10 items-center justify-between gap-3">
        <span className="text-sm font-medium">{label ?? t.label}</span>
        <button
          type="button"
          role="switch"
          aria-checked={checked}
          aria-label={label ?? t.label}
          onClick={() => onChange(checked ? "DISCRETIONARY" : "REQUIRED")}
          className={`relative h-8 w-14 shrink-0 rounded-full border transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400 ${checked ? "border-sky-400 bg-sky-500" : "border-neutral-600 bg-neutral-700"}`}
        >
          <span
            className={`absolute left-1 top-1 size-6 rounded-full bg-white shadow-md transition-transform ${checked ? "translate-x-6" : "translate-x-0"}`}
          />
        </button>
      </div>
      {help ? <p className="mt-1 text-xs text-neutral-500">{help}</p> : null}
    </div>
  );
}
