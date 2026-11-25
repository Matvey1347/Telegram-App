import type { ReactNode } from "react";

export function SegmentedControl<T extends string>({
  value,
  options,
  onChange,
  ariaLabel,
  disabled = false,
}: {
  value: T;
  options: readonly { value: T; label: string; icon?: ReactNode }[];
  onChange: (value: T) => void;
  ariaLabel?: string;
  disabled?: boolean;
}) {
  return (
    <div
      role="group"
      aria-label={ariaLabel}
      className="inline-grid shrink-0 grid-flow-col rounded-md border border-neutral-700 bg-neutral-950 p-px"
    >
      {options.map((option) => {
        const selected = value === option.value;
        return (
          <button
            key={option.value}
            type="button"
            disabled={disabled}
            aria-pressed={selected}
            onClick={() => onChange(option.value)}
            className={`inline-flex h-6 items-center justify-center gap-1.5 whitespace-nowrap rounded-[5px] px-2 text-[11px] font-medium leading-none transition disabled:cursor-not-allowed disabled:opacity-50 ${
              selected
                ? "bg-blue-600 text-white shadow-sm"
                : "text-neutral-400 hover:bg-neutral-800 hover:text-white"
            }`}
          >
            {option.icon}
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
