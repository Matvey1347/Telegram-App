"use client";


import { useId, useState, type ReactNode } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";

export function CalendarPostGroupSection({
  title,
  count,
  icon,
  children,
}: {
  title: string;
  count: number;
  icon?: ReactNode;
  children: ReactNode;
}) {
  const [collapsed, setCollapsed] = useState(false);
  const contentId = useId();

  return (
    <div className="overflow-hidden rounded-xl border border-neutral-800 bg-neutral-950/30">
      <button
        type="button"
        onClick={() => setCollapsed((current) => !current)}
        aria-expanded={!collapsed}
        aria-controls={contentId}
        className="flex w-full min-w-0 items-center gap-2 px-3 py-2 text-left transition hover:bg-neutral-900/70"
      >
        {collapsed ? (
          <ChevronRight size={15} className="shrink-0 text-neutral-400" />
        ) : (
          <ChevronDown size={15} className="shrink-0 text-neutral-400" />
        )}
        {icon}
        <span className="truncate text-sm font-medium text-white">{title}</span>
        <span className="text-xs text-neutral-500">{count}</span>
      </button>
      <div
        id={contentId}
        hidden={collapsed}
        className="space-y-2 border-t border-neutral-800 p-2"
      >
        {children}
      </div>
    </div>
  );
}
