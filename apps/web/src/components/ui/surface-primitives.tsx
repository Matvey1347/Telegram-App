"use client";

import { type PropsWithChildren } from "react";

export function StatusPill({ value }: { value: string }) {
  const tone =
    value === "active"
      ? "bg-emerald-900/50 text-emerald-300 border-emerald-700"
      : value === "draft" || value === "planned"
        ? "bg-amber-900/40 text-amber-300 border-amber-700"
        : value === "finished"
          ? "bg-blue-900/40 text-blue-300 border-blue-700"
          : value === "cancelled" || value === "archived"
            ? "bg-red-900/40 text-red-300 border-red-700"
            : "bg-neutral-800 text-neutral-300 border-neutral-700";
  return (
    <span
      className={`inline-flex rounded-full border px-2 py-0.5 text-xs font-medium ${tone}`}
    >
      {value}
    </span>
  );
}

export function Card({
  children,
  className = "",
}: PropsWithChildren<{ className?: string }>) {
  return (
    <div
      className={`rounded-lg border border-neutral-800 bg-neutral-900 p-4 sm:p-5 ${className}`}
    >
      {children}
    </div>
  );
}
export function Table({ children }: PropsWithChildren) {
  return (
    <div className="table-scroll w-full">
      <table className="w-max min-w-full text-left text-sm text-neutral-200">
        {children}
      </table>
    </div>
  );
}

export function EntityCard({
  title,
  children,
  actions,
  className = "",
}: PropsWithChildren<{
  title: React.ReactNode;
  actions?: React.ReactNode;
  className?: string;
}>) {
  return (
    <Card className={className}>
      <div className="mb-3 flex items-start justify-between gap-3">
        <h3 className="text-lg font-semibold text-white">{title}</h3>
        {actions}
      </div>
      <div className="space-y-1 text-sm text-neutral-300">{children}</div>
    </Card>
  );
}

export function PageHeader({
  title,
  subtitle,
  action,
}: {
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="mb-5 flex flex-col gap-3 sm:mb-6 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
      <div>
        <h2 className="text-2xl font-semibold sm:text-3xl">{title}</h2>
        {subtitle ? (
          <p className="mt-1 text-sm text-neutral-400 sm:text-base">
            {subtitle}
          </p>
        ) : null}
      </div>
      {action ? (
        <div className="w-full sm:w-auto [&>a]:inline-flex [&>a]:w-full [&>button]:w-full sm:[&>a]:w-auto sm:[&>button]:w-auto">
          {action}
        </div>
      ) : null}
    </div>
  );
}
