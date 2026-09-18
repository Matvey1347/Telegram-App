"use client";

import { ArrowDown, ArrowUp } from "lucide-react";
import { CustomSelect } from "./primitives";

export type SortDirection = "ASC" | "DESC";

export type SortOption<TField extends string = string> = {
  value: TField;
  label: string;
};

export function SortControl<TField extends string>({
  field,
  options,
  direction,
  onFieldChange,
  onDirectionChange,
  fieldLabel = "Sort by",
  ascendingLabel = "Ascending",
  descendingLabel = "Descending",
  className = "",
}: {
  field: TField;
  options: ReadonlyArray<SortOption<TField>>;
  direction: SortDirection;
  onFieldChange: (field: TField) => void;
  onDirectionChange: (direction: SortDirection) => void;
  fieldLabel?: string;
  ascendingLabel?: string;
  descendingLabel?: string;
  className?: string;
}) {
  const nextDirection = direction === "ASC" ? "DESC" : "ASC";
  const currentLabel = direction === "ASC" ? ascendingLabel : descendingLabel;
  const nextLabel = nextDirection === "ASC" ? ascendingLabel : descendingLabel;

  return (
    <div className={`flex min-w-0 items-center gap-2 ${className}`}>
      <div className="min-w-0 flex-1">
        <CustomSelect
          value={field}
          onChange={(value) => onFieldChange(value as TField)}
          options={[...options]}
          ariaLabel={fieldLabel}
          searchable={false}
          placeholder={fieldLabel}
        />
      </div>
      <button
        type="button"
        className="inline-flex h-[42px] w-[42px] shrink-0 items-center justify-center rounded-lg border border-neutral-700 bg-neutral-900 text-neutral-200 transition hover:border-neutral-600 hover:bg-neutral-800 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
        aria-label={`${fieldLabel}: ${currentLabel}. Change to ${nextLabel}`}
        title={`${currentLabel}; change to ${nextLabel}`}
        onClick={() => onDirectionChange(nextDirection)}
      >
        {direction === "ASC" ? (
          <ArrowUp size={18} aria-hidden="true" />
        ) : (
          <ArrowDown size={18} aria-hidden="true" />
        )}
      </button>
    </div>
  );
}
