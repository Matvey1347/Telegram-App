"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowDown, ArrowLeftRight, ArrowUp, Plus, X } from "lucide-react";
import type { FinanceCoreCopy } from "@consumer-finance/web/components/i18n/core";
import type { ConsumerFinanceAction } from "@consumer-finance/web/components/app/consumer-finance-navigation";

export function ConsumerFinanceActionLauncher({
  copy,
  compact = false,
  showOnDesktop = false,
  onAction,
}: {
  copy: FinanceCoreCopy;
  compact?: boolean;
  showOnDesktop?: boolean;
  onAction: (action: ConsumerFinanceAction) => void;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const actions = [
    { id: "expense", label: copy.expense, Icon: ArrowDown },
    { id: "income", label: copy.income, Icon: ArrowUp },
    { id: "transfer", label: copy.transfers, Icon: ArrowLeftRight },
  ] as const;
  const quickActions = actions;

  useEffect(() => {
    if (!open || !compact) return;
    const closeOutside = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const closeEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", closeOutside);
    document.addEventListener("keydown", closeEscape);
    return () => {
      document.removeEventListener("mousedown", closeOutside);
      document.removeEventListener("keydown", closeEscape);
    };
  }, [compact, open]);

  if (!compact) {
    return (
      <div className="flex flex-wrap items-center gap-2">
        {actions.map(({ id, label, Icon }) => (
          <button
            key={id}
            type="button"
            onClick={() => onAction(id)}
            className="inline-flex min-h-11 items-center gap-2 rounded-2xl border border-[#dce8db] bg-white px-3 text-sm font-semibold text-[#18382d] outline-none transition hover:bg-[#edf3eb] focus-visible:ring-2 focus-visible:ring-[#98c876]"
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
      ref={rootRef}
      data-finance-action-launcher
      className={`fixed bottom-[calc(5rem+env(safe-area-inset-bottom))] right-[max(1rem,env(safe-area-inset-right))] z-40 ${showOnDesktop ? "" : "md:hidden"}`}
    >
      {open ? (
        <div className="mb-3 grid min-w-48 gap-2 rounded-[22px] border border-[#e4ebe3] bg-white p-2 shadow-[0_18px_48px_rgba(21,58,41,0.16)]">
          {quickActions.map(({ id, label, Icon }) => (
            <button
              key={id}
              type="button"
              onClick={() => {
                setOpen(false);
                onAction(id);
              }}
              className="flex min-h-11 items-center gap-3 rounded-2xl px-3 text-left text-sm font-medium text-[#18382d] outline-none hover:bg-[#edf3eb] focus-visible:ring-2 focus-visible:ring-[#98c876]"
            >
              <Icon size={18} className="text-[#448e6b]" aria-hidden="true" />
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
        className="ml-auto flex size-14 items-center justify-center rounded-[22px] border-[3px] border-white bg-[#174a37] text-[#cff08b] shadow-[0_12px_30px_rgba(21,58,41,0.25)] outline-none transition hover:bg-[#113e30] focus-visible:ring-2 focus-visible:ring-[#98c876]"
      >
        {open ? <X size={21} /> : <Plus size={21} />}
      </button>
    </div>
  );
}
