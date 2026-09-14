"use client";

import type { ConsumerFinanceExpenseNecessity } from "@telegram-system/shared";
import type { FinanceLocale } from "../i18n/core";

const copy = {
  en: {
    label: "Required expense",
    help: "On: essential spending. Off: optional spending.",
  },
  uk: {
    label: "Обов’язкова витрата",
    help: "Увімкнено: необхідна витрата. Вимкнено: необов’язкова.",
  },
  ru: {
    label: "Обязательный расход",
    help: "Включено: необходимая трата. Выключено: необязательная.",
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
    <div
      className={`rounded-lg border border-neutral-800 bg-neutral-950/40 p-3 ${className}`}
    >
      <div className="flex items-center justify-between gap-3">
        <span className="text-sm font-medium">{label ?? t.label}</span>
        <button
          type="button"
          role="switch"
          aria-checked={checked}
          aria-label={label ?? t.label}
          onClick={() => onChange(checked ? "DISCRETIONARY" : "REQUIRED")}
          className={`relative h-7 w-12 shrink-0 rounded-full border transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400 ${checked ? "border-sky-400 bg-sky-500" : "border-neutral-600 bg-neutral-700"}`}
        >
          <span
            className={`absolute left-0.5 top-0.5 h-6 w-6 rounded-full bg-white shadow-md transition-transform ${checked ? "translate-x-5" : "translate-x-0"}`}
          />
        </button>
      </div>
      <p className="mt-1 text-xs text-neutral-500">{help ?? t.help}</p>
    </div>
  );
}
