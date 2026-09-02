"use client";

import { MoreVertical } from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";

export function ActionMenu({
  label,
  children,
  trigger,
  triggerClassName,
  menuClassName,
}: {
  label: string;
  children: ReactNode;
  trigger?: ReactNode;
  triggerClassName?: string;
  menuClassName?: string;
}) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", close);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("pointerdown", close);
      document.removeEventListener("keydown", escape);
    };
  }, [open]);

  return (
    <div ref={root} className="relative shrink-0">
      <button
        type="button"
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        title={label}
        onClick={() => setOpen((value) => !value)}
        className={triggerClassName ?? "inline-flex h-10 w-10 items-center justify-center rounded-lg text-neutral-400 transition hover:bg-neutral-800 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"}
      >
        {trigger ?? <MoreVertical size={19} aria-hidden="true" />}
      </button>
      {open ? (
        <div
          role="menu"
          className={menuClassName ?? "absolute right-0 top-11 z-50 w-52 rounded-lg border border-neutral-700 bg-neutral-950 p-1.5 shadow-2xl"}
          onClick={() => setOpen(false)}
        >
          {children}
        </div>
      ) : null}
    </div>
  );
}

export function ActionMenuItem({
  children,
  icon,
  danger = false,
  disabled = false,
  onClick,
}: {
  children: ReactNode;
  icon: ReactNode;
  danger?: boolean;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      role="menuitem"
      disabled={disabled}
      onClick={onClick}
      className={`flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-left text-sm transition hover:bg-neutral-800 disabled:cursor-not-allowed disabled:opacity-50 ${danger ? "text-rose-300 hover:bg-rose-950/40" : "text-neutral-200"}`}
    >
      {icon}
      {children}
    </button>
  );
}
