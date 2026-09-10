"use client";

import dynamic from "next/dynamic";
import { useState } from "react";
import { Minus, TrendingDown, TrendingUp } from "lucide-react";
import type {
  TelegramChannelAudienceTrend,
  TelegramChannelTrendMetric,
} from "@telegram-system/shared";
import { Modal } from "@/components/ui/primitives";
import { TelegramEntityAvatar } from "./telegram-entity-avatar";
import { ChannelDynamicsSkeleton } from "./channel-dynamics-skeleton";

const ChannelPerformanceHistoryPanel = dynamic(
  () =>
    import("./channel-performance-history-panel").then(
      (module) => module.ChannelPerformanceHistoryPanel,
    ),
  {
    ssr: false,
    loading: () => <ChannelDynamicsSkeleton />,
  },
);

export function ChannelAudienceTrendButton({
  channelId,
  channelTitle,
  channelPhotoUrl,
  trend,
  paybackPercent,
  estimatedAdsRemaining,
}: {
  channelId: string;
  channelTitle: string;
  channelPhotoUrl?: string | null;
  trend?: TelegramChannelAudienceTrend | null;
  paybackPercent?: number | null;
  estimatedAdsRemaining?: number | null;
}) {
  const [open, setOpen] = useState(false);
  if (!trend) return null;

  return (
    <>
      <button
        type="button"
        className="inline-flex items-center gap-1.5 rounded-md border border-neutral-700 bg-neutral-950/40 px-1.5 py-0.5 text-[11px] font-medium transition hover:border-neutral-500"
        aria-label={`Open ${trend.periodDays}-day channel dynamics`}
        onClick={() => setOpen(true)}
      >
        <CompactMetric label="Subs" metric={trend.metrics.subscribers} />
        <span className="text-neutral-700">·</span>
        <CompactMetric label="24h views" metric={trend.metrics.reach} />
      </button>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={`${channelTitle} · channel dynamics`}
        size="xl"
        leadingHeaderAction={
          <TelegramEntityAvatar
            imageUrl={channelPhotoUrl}
            kind="channel"
            alt={channelTitle}
            size="sm"
          />
        }
      >
        {open ? (
          <ChannelPerformanceHistoryPanel
            channelId={channelId}
            fallbackPaybackPercent={paybackPercent}
            fallbackAdsLeft={estimatedAdsRemaining}
          />
        ) : null}
      </Modal>
    </>
  );
}

function CompactMetric({
  label,
  metric,
}: {
  label: string;
  metric: TelegramChannelTrendMetric | null;
}) {
  const delta = metric?.percentChange;
  const presentation = deltaPresentation(delta);
  const Icon = presentation.Icon;
  return (
    <span className={`inline-flex items-center gap-0.5 ${presentation.tone}`}>
      <Icon size={11} aria-hidden="true" />
      <span className="text-neutral-400">{label}</span>
      <strong>{delta == null ? "—" : signedPercent(delta)}</strong>
    </span>
  );
}

function deltaPresentation(value?: number | null) {
  if (value == null || Math.abs(value) <= 1) {
    return { Icon: Minus, tone: "text-neutral-300" };
  }
  return value > 0
    ? { Icon: TrendingUp, tone: "text-emerald-300" }
    : { Icon: TrendingDown, tone: "text-rose-300" };
}

function signedPercent(value: number) {
  return `${value > 0 ? "+" : ""}${value.toFixed(1)}%`;
}
