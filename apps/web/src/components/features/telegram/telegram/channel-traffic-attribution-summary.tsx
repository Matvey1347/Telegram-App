"use client";

import dynamic from "next/dynamic";
import { useState } from "react";
import { UsersRound, UserMinus } from "lucide-react";
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
      <button
        type="button"
        className="mt-2 w-full rounded-md border border-neutral-800/80 bg-neutral-950/55 px-2.5 py-2 text-left transition hover:border-neutral-600"
        onClick={() => setOpen(true)}
        onPointerEnter={() => void loadTrafficAttributionModal()}
        onFocus={() => void loadTrafficAttributionModal()}
        aria-label={`Open traffic attribution for ${channel.title}`}
      >
        <span className="flex items-center justify-between gap-2 text-xs">
          <span className="inline-flex items-center gap-1.5 font-medium text-neutral-300">
            <UsersRound size={14} className="text-violet-300" />
            Traffic sources
          </span>
        </span>
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
            <strong
              className={
                meetsKpi === true
                  ? "text-emerald-300"
                  : meetsKpi === false
                    ? "text-rose-300"
                    : "text-white"
              }
            >
              {money(paidCpa, summary.currency)}
            </strong>
            {meetsKpi != null ? (
              <span className="block text-[10px] text-neutral-500">
                KPI ≤{" "}
                {money(targetCpa, channel.kpiCurrency ?? summary.currency)}
              </span>
            ) : null}
          </span>
        </span>
        <span className="mt-1.5 block truncate text-[11px] text-neutral-500">
          {summary.sources
            .slice(0, 4)
            .map((source) => `${source.label} +${number(source.acquired)}`)
            .join(" · ")}
        </span>
      </button>
      {open ? (
        <ChannelTrafficAttributionModal
          channel={channel}
          onClose={() => setOpen(false)}
        />
      ) : null}
    </>
  );
}
