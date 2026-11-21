"use client";

import { Pencil, Trash2 } from "lucide-react";
import { CreateActionIcon } from "./create-action-icon";

export function Button({
  variant = "primary",
  children,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "danger";
}) {
  const styles = {
    primary: "bg-blue-600 hover:bg-blue-500 text-white",
    secondary: "bg-neutral-700 hover:bg-neutral-600 text-white",
    danger: "bg-red-600 hover:bg-red-500 text-white",
  }[variant];
  return (
    <button
      {...props}
      className={`inline-flex items-center justify-center gap-2 whitespace-nowrap cursor-pointer rounded-lg px-4 py-2 text-sm font-medium disabled:opacity-50 ${styles} ${props.className ?? ""}`}
    >
      <CreateActionIcon>{children}</CreateActionIcon>
      {children}
    </button>
  );
}
export function ToggleRow({
  checked,
  onChange,
  label,
  description,
  disabled = false,
  className = "",
  activeTone = "emerald",
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
  description?: string;
  disabled?: boolean;
  className?: string;
  activeTone?: "blue" | "emerald";
}) {
  const activeClass =
    activeTone === "blue"
      ? "border-blue-500/70 bg-blue-500/20"
      : "border-emerald-500/70 bg-emerald-500/20";
  return (
    <div
      className={`flex items-center justify-between gap-3 rounded-lg border border-neutral-800 bg-neutral-950/40 p-3 ${className}`}
    >
      <div className="min-w-0">
        <p className="text-sm font-medium text-white">{label}</p>
        {description ? (
          <p className="mt-1 text-sm text-neutral-400">{description}</p>
        ) : null}
      </div>
      <button
        type="button"
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={`relative inline-flex h-8 w-14 shrink-0 items-center rounded-full border transition disabled:opacity-50 ${
          checked ? activeClass : "border-neutral-700 bg-neutral-900"
        }`}
        aria-pressed={checked}
        aria-label={label}
      >
        <span
          className={`absolute h-6 w-6 rounded-full bg-white transition ${
            checked ? "left-7" : "left-1"
          }`}
        />
      </button>
    </div>
  );
}

export function IconButton({
  kind = "edit",
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  kind?: "edit" | "delete";
}) {
  return (
    <button
      {...props}
      className={`inline-flex h-10 w-10 shrink-0 cursor-pointer items-center justify-center rounded-lg border p-0 ${kind === "delete" ? "border-red-700 text-red-300 hover:bg-red-950" : "border-neutral-700 text-neutral-200 hover:bg-neutral-800"} ${props.className ?? ""}`}
    >
      {kind === "delete" ? <Trash2 size={16} /> : <Pencil size={16} />}
    </button>
  );
}
