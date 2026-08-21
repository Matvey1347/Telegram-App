"use client";

import { useState } from "react";
import { ArrowDown, ArrowLeftRight, ArrowUp, Plus, X } from "lucide-react";
import type { FinanceCopy } from "./finance-i18n";
import type { ConsumerFinanceAction } from "./consumer-finance-navigation";

export function ConsumerFinanceActionLauncher({
  copy,
  compact = false,
  showOnDesktop = false,
  onAction,
}: {
  copy: FinanceCopy;
  compact?: boolean;
  showOnDesktop?: boolean;
  onAction: (action: ConsumerFinanceAction) => void;
}) {
  const [open, setOpen] = useState(false);
  const actions = [
    { id: "expense", label: copy.expense, Icon: ArrowDown },
    { id: "income", label: copy.income, Icon: ArrowUp },
    { id: "transfer", label: copy.transfers, Icon: ArrowLeftRight },
  ] as const;

  if (!compact) {
    return (
      <div className="flex flex-wrap items-center gap-2">
        {actions.map(({ id, label, Icon }, index) => (
          <button
            key={id}
            type="button"
            onClick={() => onAction(id)}
            className={`inline-flex min-h-11 items-center gap-2 rounded-lg border px-3 text-sm font-medium outline-none transition focus-visible:ring-2 focus-visible:ring-sky-300 ${index === 0 ? "border-sky-500 bg-sky-500 text-neutral-950" : "border-neutral-700 bg-neutral-900 text-neutral-100 hover:border-neutral-600"}`}
          >
            <Icon size={17} aria-hidden="true" />
            {label}
          </button>
        ))}
      </div>
    );
  }

  return (
    <div
      className={`fixed bottom-[calc(5rem+env(safe-area-inset-bottom))] right-4 z-40 ${showOnDesktop ? "" : "md:hidden"}`}
    >
      {open ? (
        <div className="mb-3 grid min-w-48 gap-2 rounded-xl border border-neutral-800 bg-neutral-900 p-2 shadow-2xl">
          {actions.map(({ id, label, Icon }) => (
            <button
              key={id}
              type="button"
              onClick={() => {
                setOpen(false);
                onAction(id);
              }}
              className="flex min-h-11 items-center gap-3 rounded-lg px-3 text-left text-sm text-neutral-100 outline-none hover:bg-neutral-800 focus-visible:ring-2 focus-visible:ring-sky-300"
            >
              <Icon size={18} className="text-sky-300" aria-hidden="true" />
              {label}
            </button>
          ))}
        </div>
      ) : null}
      <button
        type="button"
        aria-label={copy.addTransaction}
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
        className="ml-auto flex size-12 items-center justify-center rounded-full bg-sky-500 text-neutral-950 shadow-lg outline-none focus-visible:ring-2 focus-visible:ring-sky-200"
      >
        {open ? <X size={21} /> : <Plus size={21} />}
      </button>
    </div>
  );
}
