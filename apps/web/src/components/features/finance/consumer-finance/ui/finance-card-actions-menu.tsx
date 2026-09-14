"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { EllipsisVertical } from "lucide-react";

export type FinanceCardAction = {
  label: string;
  icon?: ReactNode;
  onSelect: () => void;
  disabled?: boolean;
  danger?: boolean;
};

export function FinanceCardActionsMenu({
  label,
  actions,
}: {
  label: string;
  actions: FinanceCardAction[];
}) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const close = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", close);
    return () => document.removeEventListener("pointerdown", close);
  }, []);

  return (
    <div ref={root} className="relative shrink-0">
      <button
        type="button"
        aria-label={label}
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
        className="grid h-10 w-10 place-items-center rounded-lg border border-neutral-700 text-neutral-200 transition hover:border-sky-500 hover:bg-sky-950/40"
      >
        <EllipsisVertical size={18} aria-hidden="true" />
      </button>
      {open ? (
        <div className="absolute right-0 top-11 z-40 min-w-52 rounded-xl border border-neutral-700 bg-neutral-950 p-1.5 shadow-2xl">
          {actions.map((action) => (
            <button
              key={action.label}
              type="button"
              disabled={action.disabled}
              onClick={() => {
                setOpen(false);
                action.onSelect();
              }}
              className={`flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm transition hover:bg-neutral-800 disabled:opacity-50 ${action.danger ? "text-rose-300" : "text-neutral-100"}`}
            >
              {action.icon}
              <span>{action.label}</span>
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
