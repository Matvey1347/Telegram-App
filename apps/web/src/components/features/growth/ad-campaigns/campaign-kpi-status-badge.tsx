"use client";
import type { MouseEventHandler } from "react";
import type { AdCampaignKpiStatus } from "@/lib/api";
import { useCampaignText } from "./use-campaign-text";

function kpiStatusClass(status?: AdCampaignKpiStatus | null) {
  if (status === "good")
    return "border-emerald-700 bg-emerald-950/20 text-emerald-200";
  if (status === "acceptable")
    return "border-yellow-700 bg-yellow-950/20 text-yellow-200";
  if (status === "bad") return "border-rose-700 bg-rose-950/20 text-rose-200";
  return "border-slate-700 bg-slate-950/30 text-slate-300";
}

function kpiStatusLabel(status?: AdCampaignKpiStatus | null) {
  if (status === "good") return "KPI hit";
  if (status === "acceptable") return "KPI ok";
  if (status === "bad") return "KPI missed";
  return "KPI unknown";
}

function kpiStatusTitle(status?: AdCampaignKpiStatus | null) {
  if (status === "good") return "CPA is inside target KPI range.";
  if (status === "acceptable") return "CPA is inside acceptable KPI range.";
  if (status === "bad") return "CPA is inside stop KPI range.";
  return "KPI range or enough CPA data is missing.";
}

export function KpiStatusBadge({
  status,
  onMouseEnter,
  onMouseLeave,
}: {
  status?: AdCampaignKpiStatus | null;
  onMouseEnter?: MouseEventHandler<HTMLSpanElement>;
  onMouseLeave?: MouseEventHandler<HTMLSpanElement>;
}) {
  const t = useCampaignText();
  return (
    <span
      className={`inline-flex rounded border px-1.5 py-0.5 text-[11px] leading-tight ${kpiStatusClass(status)} ${status && status !== "unknown" && onMouseEnter ? "cursor-help" : ""}`}
      title={t(kpiStatusTitle(status))}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
    >
      {t(kpiStatusLabel(status))}
    </span>
  );
}
