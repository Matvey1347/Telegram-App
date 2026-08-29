"use client";

import type { TelegramChannel, TelegramChannelAdAnalysis, TelegramChannelAdAnalysisStatus } from "@/lib/api";
import { MemberBadge } from "@/components/features/workspace/member-badge";
import { Button, IconButton } from "@/components/ui/primitives";

const statusLabels: Record<TelegramChannelAdAnalysisStatus, string> = {
  NEW: "New", APPROVED: "Approved", REJECTED: "Rejected",
  WATCH_LATER: "Watch later", BLACKLIST: "Blacklist", TESTED: "Tested",
};
function formatNumber(value: unknown, decimals = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number.toLocaleString(undefined, {
    maximumFractionDigits: decimals,
  }) : "-";
}
function formatLocalDate(value?: string | Date | null) {
  if (!value) return "-";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "-" : date.toLocaleDateString();
}

export function ExternalChannelAdAnalysis({
  channel,
  onEdit,
  onDelete,
}: {
  channel: TelegramChannel;
  onEdit: (analysis?: TelegramChannelAdAnalysis) => void;
  onDelete: (analysis: TelegramChannelAdAnalysis) => void;
}) {
  const summary = channel.preview?.adAnalysis;
  const latest = summary?.latest;
  if (!latest) {
    return (
      <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-dashed border-slate-700 bg-slate-950/40 px-3 py-2">
        <span className="text-xs text-slate-400">No ad analysis yet</span>
        <Button type="button" variant="secondary" onClick={() => onEdit()}>
          Analyze
        </Button>
      </div>
    );
  }
  const chip =
    "rounded-md border border-slate-700 bg-slate-900 px-2 py-1 text-xs text-slate-200";
  const hasPrice = latest.price != null;
  const analysisTone =
    latest.status === "APPROVED"
      ? "border-emerald-700/80 bg-emerald-950/25"
      : latest.status === "REJECTED"
        ? "border-rose-700/80 bg-rose-950/25"
        : "border-slate-800 bg-slate-950/50";
  return (
    <div
      className={`mt-3 flex flex-wrap items-center gap-2 rounded-lg border p-2 ${analysisTone}`}
    >
      {hasPrice ? (
        <>
          <span className={chip}>
            {latest.currency} {formatNumber(latest.price, 2)}
          </span>
          <span className={chip}>
            CPM {latest.currency}{" "}
            {latest.cpm == null ? "-" : formatNumber(latest.cpm, 2)}
          </span>
        </>
      ) : null}
      <span
        className={`${chip} ${
          latest.status === "APPROVED"
            ? "border-emerald-700 text-emerald-300"
            : latest.status === "REJECTED"
              ? "border-rose-700 text-rose-300"
              : ""
        }`}
      >
        {statusLabels[latest.status]}
      </span>
      {latest.notes ? (
        <span className={`${chip} max-w-full truncate`}>{latest.notes}</span>
      ) : null}
      <span className="text-xs text-slate-500">
        {formatLocalDate(latest.analyzedAt)}
      </span>
      <MemberBadge member={latest.assignedMember} />
      <div className="ml-auto flex items-center gap-2">
        <IconButton
          type="button"
          aria-label="Edit analysis"
          title="Edit analysis"
          onClick={() => onEdit(latest)}
        />
        <IconButton
          type="button"
          kind="delete"
          aria-label="Delete analysis"
          title="Delete analysis"
          onClick={() => onDelete(latest)}
        />
      </div>
      {(summary?.historyCount ?? 0) > 1 ? (
        <span className="text-xs text-slate-500">
          {summary?.historyCount} analyses
        </span>
      ) : null}
    </div>
  );
}


