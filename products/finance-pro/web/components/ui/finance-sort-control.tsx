"use client";

import { ArrowDown, ArrowUp } from "lucide-react";
import { Button, Select } from "./finance-controls";
import type { FinanceLocale } from "../i18n/core";

export function FinanceSortControl<TField extends string>({
  locale,
  field,
  options,
  direction,
  onFieldChange,
  onDirectionChange,
  fieldLabel,
  ascendingLabel,
  descendingLabel,
}: {
  locale: FinanceLocale;
  field: TField;
  options: ReadonlyArray<{ value: TField; label: string }>;
  direction: "ASC" | "DESC";
  onFieldChange: (value: TField) => void;
  onDirectionChange: (value: "ASC" | "DESC") => void;
  fieldLabel: string;
  ascendingLabel: string;
  descendingLabel: string;
}) {
  const next = direction === "ASC" ? "DESC" : "ASC";
  const currentLabel = direction === "ASC" ? ascendingLabel : descendingLabel;
  const nextLabel = next === "ASC" ? ascendingLabel : descendingLabel;
  return (
    <div className="flex min-w-0 items-center gap-2">
      <div className="min-w-0 flex-1">
        <Select
          uiLocale={locale}
          triggerAriaLabel={fieldLabel}
          value={field}
          onChange={(event) => onFieldChange(event.target.value as TField)}
        >
          {options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </Select>
      </div>
      <Button
        type="button"
        variant="cancel"
        className="h-10 w-10 shrink-0 px-0"
        aria-label={`${fieldLabel}: ${currentLabel}. ${nextLabel}`}
        title={`${currentLabel}; ${nextLabel}`}
        onClick={() => onDirectionChange(next)}
      >
        {direction === "ASC" ? (
          <ArrowUp size={18} aria-hidden="true" />
        ) : (
          <ArrowDown size={18} aria-hidden="true" />
        )}
      </Button>
    </div>
  );
}
