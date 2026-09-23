"use client";

import dynamic from "next/dynamic";
import { useState } from "react";
import { UsersRound, UserMinus } from "lucide-react";
import { Tooltip } from "@/components/ui/primitives";
import type { TelegramChannel } from "@/lib/api";

const loadTrafficAttributionModal = () =>
  import("./channel-traffic-attribution-modal").then(
    (module) => module.ChannelTrafficAttributionModal,
  );

const ChannelTrafficAttributionModal = dynamic(loadTrafficAttributionModal, {
  ssr: false,
  // Do not momentarily render a block-level skeleton inside the channel card
  // while the dialog chunk is loading. The dialog itself owns its data state.
  loading: () => null,
});

function money(value: number | null, currency: string) {
  return value == null
    ? "—"
    : `${number(value, value < 10 ? 2 : 1)} ${currency}`;
}

function number(value: unknown, digits = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed)
    ? parsed.toLocaleString(undefined, { maximumFractionDigits: digits })
    : "—";
}

function numberOrNull(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function formatKpi(value: number | null, currency: string, prefix: string) {
  return value == null ? "—" : `${prefix} ${number(value, 2)} ${currency}`;
}

function KpiRangeChip({
  tone,
  label,
}: {
  tone: "target" | "ok" | "stop";
  label: string;
}) {
  const className = {
    target: "border-emerald-700 bg-emerald-950/50 text-emerald-200",
    ok: "border-yellow-700 bg-yellow-950/50 text-yellow-200",
    stop: "border-rose-700 bg-rose-950/50 text-rose-200",
  }[tone];

  return <span className={`rounded border px-2 py-1 ${className}`}>{label}</span>;
}

function PaidCpaKpiTooltip({ channel }: { channel: TelegramChannel }) {
  const currency = channel.kpiCurrency || channel.adBaseCurrency || "USD";
  const targetTo = numberOrNull(channel.targetCpa);
  const stopFrom =
    numberOrNull(channel.stopCpaFrom) ?? numberOrNull(channel.stopCpa);

  return (
    <div className="w-72 space-y-2">
      <div className="font-semibold text-white">KPI ({currency})</div>
      <div className="flex flex-wrap gap-1.5">
        <KpiRangeChip
          tone="target"
          label={`target ${formatKpi(targetTo, currency, "to")}`}
        />
        <KpiRangeChip
          tone="ok"
          label={`ok ${targetTo != null && stopFrom != null ? `${number(targetTo, 2)}–${number(stopFrom, 2)} ${currency}` : "—"}`}
        />
        <KpiRangeChip
          tone="stop"
          label={`stop ${formatKpi(stopFrom, currency, "from")}`}
        />
      </div>
    </div>
  );
}

export function ChannelTrafficAttributionSummary({
  channel,
}: {
  channel: TelegramChannel;
}) {
  const [open, setOpen] = useState(false);
  const summary = channel.preview?.trafficAttribution;
  if (!summary?.sources.length) return null;
  const paidCpa = summary.retainedSubscriberCost;
  const targetCpa = Number(channel.targetCpa);
  const meetsKpi =
    paidCpa != null && Number.isFinite(targetCpa) && targetCpa > 0
      ? paidCpa <= targetCpa
      : null;

  return (
    <>
      <section
        className="mt-2 w-full cursor-pointer rounded-md border border-neutral-800/80 bg-neutral-950/55 px-2.5 py-2 text-left transition hover:border-neutral-600"
        onClick={() => setOpen(true)}
        onPointerEnter={() => void loadTrafficAttributionModal()}
      >
        <button
          type="button"
          className="inline-flex items-center gap-1.5 text-xs font-medium text-neutral-300 transition hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
          onFocus={() => void loadTrafficAttributionModal()}
          aria-label={`Open traffic attribution for ${channel.title}`}
        >
            <UsersRound size={14} className="text-violet-300" />
            Traffic sources
        </button>
        <span className="mt-1.5 grid grid-cols-3 gap-2 text-xs tabular-nums">
          <span>
            <span className="block text-neutral-500">Acquired</span>
            <strong className="text-emerald-300">
              +{number(summary.acquired)}
            </strong>
          </span>
          <span>
            <span className="block text-neutral-500">Lost / drop</span>
            <strong className="inline-flex items-center gap-1 text-rose-300">
              <UserMinus size={12} /> {number(summary.unsubscribed)} ·{" "}
              {number(summary.unsubscribePercent, 1)}%
            </strong>
          </span>
          <span>
            <span className="block text-neutral-500">Paid CPA</span>
            <Tooltip content={<PaidCpaKpiTooltip channel={channel} />}>
              <button
                type="button"
                className={`cursor-help font-semibold tabular-nums underline decoration-dotted underline-offset-2 ${
                  meetsKpi === true
                    ? "text-emerald-300"
                    : meetsKpi === false
                      ? "text-rose-300"
                      : "text-white"
                }`}
                aria-label={`Paid CPA ${money(paidCpa, summary.currency)}. Show KPI ranges.`}
                onClick={(event) => event.stopPropagation()}
              >
                {money(paidCpa, summary.currency)}
              </button>
            </Tooltip>
          </span>
        </span>
      </section>
      {open ? (
        <ChannelTrafficAttributionModal
          channel={channel}
          onClose={() => setOpen(false)}
        />
      ) : null}
    </>
  );
}
