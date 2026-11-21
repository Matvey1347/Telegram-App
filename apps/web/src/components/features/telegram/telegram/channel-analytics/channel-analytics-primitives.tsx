"use client";

import { type ReactNode, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ChevronDown, ChevronRight, CircleHelp } from "lucide-react";
import { MetricPreviewLabel } from "@/lib/metric-preview-icons";

export function SimplePanel({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <div className="rounded-lg border border-slate-700 bg-slate-950/20 p-3">
      <h3 className="mb-2.5 text-base font-semibold">{title}</h3>
      {children}
    </div>
  );
}

export function EmptyState({ text }: { text: string }) {
  return (
    <div className="rounded-lg border border-slate-800 bg-slate-900/30 p-3 text-sm text-slate-400">
      {text}
    </div>
  );
}

export function SnapshotItem({
  label,
  value,
}: {
  label: string;
  value: ReactNode;
}) {
  return (
    <div className="min-h-[58px] rounded-lg border border-slate-800 bg-slate-900/25 px-2.5 py-2">
      <MetricPreviewLabel
        label={label}
        className="truncate text-xs text-slate-400"
      />
      <div className="mt-1 truncate text-sm font-semibold text-slate-100">
        {value || "-"}
      </div>
    </div>
  );
}

export function InfoTooltip({
  tip,
  children,
}: {
  tip: string;
  children?: ReactNode;
}) {
  const triggerRef = useRef<HTMLSpanElement | null>(null);
  const tooltipRef = useRef<HTMLSpanElement | null>(null);
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState({
    top: 0,
    left: 0,
    ready: false,
  });

  useLayoutEffect(() => {
    if (!open || !triggerRef.current || !tooltipRef.current) return;
    const trigger = triggerRef.current.getBoundingClientRect();
    const tooltip = tooltipRef.current.getBoundingClientRect();
    const gap = 8;
    const padding = 12;
    const top = Math.max(padding, trigger.top - tooltip.height - gap);
    const centeredLeft = trigger.left + trigger.width / 2 - tooltip.width / 2;
    const left = Math.min(
      window.innerWidth - tooltip.width - padding,
      Math.max(padding, centeredLeft),
    );
    setPosition({ top, left, ready: true });
  }, [open, tip]);

  const tooltip =
    open && typeof document !== "undefined"
      ? createPortal(
          <span
            ref={tooltipRef}
            className={`pointer-events-none fixed z-[140] w-[200px] max-w-[calc(100vw-1.5rem)] rounded-md border border-slate-700 bg-slate-950 px-2 py-1.5 text-xs leading-relaxed text-slate-100 shadow-xl transition-opacity ${position.ready ? "opacity-100" : "opacity-0"}`}
            style={{ top: position.top, left: position.left }}
          >
            {tip}
          </span>,
          document.body,
        )
      : null;

  return (
    <span
      ref={triggerRef}
      className="relative inline-flex"
      onMouseEnter={() => {
        setPosition((prev) => ({ ...prev, ready: false }));
        setOpen(true);
      }}
      onMouseLeave={() => setOpen(false)}
      onFocus={() => {
        setPosition((prev) => ({ ...prev, ready: false }));
        setOpen(true);
      }}
      onBlur={() => setOpen(false)}
    >
      {children || (
        <span className="inline-flex h-5 w-5 cursor-help items-center justify-center rounded-full border border-slate-600 text-slate-300">
          <CircleHelp size={13} />
        </span>
      )}
      {tooltip}
    </span>
  );
}

export function SectionToggle({
  title,
  open,
  onToggle,
}: {
  title: string;
  open: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className="mb-3 flex w-full items-center justify-between rounded-lg border border-slate-700 bg-slate-900/30 px-3 py-2 text-left"
    >
      <span className="text-lg font-semibold">{title}</span>
      {open ? (
        <ChevronDown size={18} className="text-slate-300" />
      ) : (
        <ChevronRight size={18} className="text-slate-300" />
      )}
    </button>
  );
}
