"use client";

import {
  CalendarDays,
  Users,
} from "lucide-react";
import type { ReactNode } from "react";
import { TelegramEntityAvatar } from "@/components/features/telegram/telegram/telegram-entity-avatar";

export function AdSaleModalSummary({
  advertiser,
  clientAvatarUrl,
  scheduleGroups,
  dateLabel,
  financeSkipped,
  amount,
  currency,
  submissionError,
  children,
}: {
  advertiser: string;
  clientAvatarUrl?: string | null;
  scheduleGroups?: Array<{ date: string; time: string; format?: string }>;
  /** Compatibility for older summary call sites; placement totals are no longer displayed. */
  placementCount?: number;
  dateLabel?: string;
  financeSkipped: boolean;
  amount: number;
  currency: string;
  submissionError: string | null;
  children?: ReactNode;
}) {
  const visibleScheduleGroups = scheduleGroups ?? (dateLabel
    ? [{ date: dateLabel, time: "Not set" }]
    : []);
  const formattedAmount = new Intl.NumberFormat(undefined, {
    style: "currency",
    currency: currency || "UAH",
    maximumFractionDigits: 2,
  }).format(amount);
  return (
    <aside className="contents lg:sticky lg:top-2 lg:block lg:rounded-2xl lg:border lg:border-neutral-800 lg:bg-neutral-950/70 lg:p-5">
      <div className="hidden items-center justify-between gap-2 lg:flex">
        <h3 className="text-base font-semibold text-white">Sale summary</h3>
        <span className="inline-flex items-center gap-2 rounded-full border border-neutral-800 px-2 py-1 text-[11px] text-neutral-400">
          <span aria-hidden="true" className="size-1.5 animate-pulse rounded-full bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.8)]" />
          Live preview
        </span>
      </div>
      <dl className="hidden space-y-3 text-sm lg:mt-4 lg:block">
        <SummaryRow
          icon={Users}
          avatar={<TelegramEntityAvatar imageUrl={clientAvatarUrl} kind="person" size="xs" alt="" />}
          label="Client"
          value={advertiser || "Not selected"}
        />
      </dl>
      <div className="hidden space-y-2 lg:mt-3 lg:block">
        {visibleScheduleGroups.length ? visibleScheduleGroups.map((group) => (
          <div key={group.date} className="rounded-lg border border-neutral-800 bg-neutral-900/50 px-3 py-2">
            <div className="flex items-center gap-2 text-sm font-medium text-neutral-200">
              <CalendarDays size={15} aria-hidden="true" className="shrink-0 text-sky-300" />
              <span>{group.date}</span>
            </div>
            <dl className={`ml-[23px] mt-1 grid gap-x-3 text-xs ${group.format ? "grid-cols-2" : "grid-cols-1"}`}>
              <div className="min-w-0">
                <dt className="text-neutral-500">Time</dt>
                <dd className="truncate text-neutral-200">{group.time}</dd>
              </div>
              {group.format ? (
                <div className="min-w-0">
                  <dt className="text-neutral-500">Format</dt>
                  <dd className="truncate text-neutral-200" title={group.format}>{group.format}</dd>
                </div>
              ) : null}
            </dl>
          </div>
        )) : (
          <SummaryRow icon={CalendarDays} label="Date" value="Not selected" />
        )}
      </div>
      <div className="hidden border-t border-neutral-800 pt-4 lg:mt-5 lg:block">
        {!financeSkipped ? (
          <p className="text-xs text-neutral-500">Sale total</p>
        ) : null}
        <p className="mt-1 text-2xl font-semibold text-white">
          {financeSkipped ? "Free" : formattedAmount}
        </p>
      </div>
      {submissionError ? (
        <p className="hidden rounded-lg border border-rose-800 bg-rose-950/30 p-2 text-xs text-rose-200 lg:mt-3 lg:block">
          {submissionError}
        </p>
      ) : null}
      {children ? (
      <div className="fixed inset-x-0 bottom-0 z-40 flex items-center justify-end gap-2 border-t border-neutral-800 bg-neutral-900/95 px-2 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] shadow-2xl backdrop-blur sm:px-5 lg:static lg:mt-5 lg:flex lg:flex-row lg:flex-wrap lg:justify-end lg:border-0 lg:bg-transparent lg:p-0 lg:shadow-none lg:backdrop-blur-none">
          <div className="flex min-w-0 shrink items-center gap-2 [&>button]:min-w-0 [&>button]:px-2.5 [&>button]:text-sm sm:[&>button]:px-4 sm:[&>button]:text-base">
            {children}
          </div>
        </div>
      ) : null}
    </aside>
  );
}

function SummaryRow({
  icon: Icon,
  avatar,
  label,
  value,
}: {
  icon: typeof Users;
  avatar?: ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="flex min-w-0 items-start gap-2">
      {avatar ?? <Icon size={15} className="mt-0.5 shrink-0 text-sky-300" />}
      <dt className="shrink-0 text-neutral-500">{label}</dt>
      <dd
        className="ml-auto min-w-0 truncate text-right text-neutral-200"
        title={value}
      >
        {value}
      </dd>
    </div>
  );
}
