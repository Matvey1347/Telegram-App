"use client";

import { Bot } from "lucide-react";
import { Modal } from "@/components/ui/primitives";
import { IconAvatar } from "@/components/icons/icon-avatar";
import { InviteLinkHistoryPanel } from "@/components/features/telegram/telegram/invite-link-history-panel";
import type { AdCampaign } from "@/lib/api";

function number(value: number) {
  return value.toLocaleString();
}

export function CampaignBotRequestsModal({
  campaign,
  onClose,
}: {
  campaign: AdCampaign | null;
  onClose: () => void;
}) {
  const performance = campaign?.botRequestPerformance;
  if (!campaign || !performance) return null;

  return (
    <Modal
      open
      onClose={onClose}
      title="Bot requests by channel"
      titleIcon={<Bot size={18} />}
      size="xl"
    >
      <div className="space-y-5">
        <p className="text-sm text-slate-400">
          {campaign.title} · {number(performance.total)} request
          {performance.total === 1 ? "" : "s"}
        </p>

        <CampaignTrend performance={performance} />

        {performance.channels.length ? (
          <section>
            <div className="mb-2 flex items-center justify-between gap-3">
              <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-300">
                Channel breakdown
              </h3>
              <span className="text-xs text-slate-500">
                {performance.channels.length} channel
                {performance.channels.length === 1 ? "" : "s"}
              </span>
            </div>
            <div className="divide-y divide-neutral-800 overflow-hidden rounded-lg border border-neutral-800">
              {performance.channels.map((channel) => (
                <div
                  key={channel.telegramChannelId}
                  className="grid gap-3 px-3 py-3 sm:grid-cols-[minmax(0,1fr)_auto_auto_auto] sm:items-center"
                >
                  <span className="flex min-w-0 items-center gap-2 text-sm text-slate-100">
                    <IconAvatar
                      icon={
                        channel.photoUrl
                          ? {
                              type: "image",
                              id: channel.telegramChannelId,
                              url: channel.photoUrl,
                              name: channel.title,
                            }
                          : null
                      }
                      label={channel.title}
                      size="sm"
                    />
                    <span className="truncate">{channel.title}</span>
                  </span>
                  <Metric
                    label="Current"
                    value={`+${number(channel.requests)}`}
                    tone="text-cyan-200"
                  />
                  <Metric label="Peak" value={number(channel.peak)} />
                  <Metric
                    label="Drop from peak"
                    value={
                      channel.dropFromPeak > 0
                        ? `${number(channel.dropFromPeak)} · ${channel.dropPercent.toFixed(1)}%`
                        : "0 · 0.0%"
                    }
                    tone={
                      channel.dropFromPeak > 0
                        ? "text-rose-200"
                        : "text-emerald-200"
                    }
                  />
                </div>
              ))}
            </div>
          </section>
        ) : (
          <p className="text-sm text-slate-400">
            No bot requests were recorded for this campaign period.
          </p>
        )}
      </div>
    </Modal>
  );
}

function CampaignTrend({
  performance,
}: {
  performance: NonNullable<AdCampaign["botRequestPerformance"]>;
}) {
  const points = performance.points;
  const current = points.at(-1);
  const peak = Math.max(0, ...points.map((point) => point.totalAttributed));
  const peakJoined = Math.max(0, ...points.map((point) => point.joinedCount));
  const peakPending = Math.max(
    0,
    ...points.map((point) => point.requestedCount),
  );
  const dropFromPeak = Math.max(0, peak - performance.total);

  return (
    <InviteLinkHistoryPanel
      title="Campaign bot-request trend"
      subtitle="Aggregate joined and pending people across all bot links in this campaign."
      points={points}
      summary={{
        currentJoinedCount: current?.joinedCount ?? 0,
        currentRequestedCount: current?.requestedCount ?? 0,
        currentTotalAttributed: performance.total,
        peakJoinedCount: peakJoined,
        peakRequestedCount: peakPending,
        peakTotalAttributed: peak,
        drawdownFromPeak: dropFromPeak,
        drawdownPercent: peak > 0 ? (dropFromPeak / peak) * 100 : 0,
        hasHighDropoff: peak > 0 && (dropFromPeak / peak) * 100 >= 15,
      }}
    />
  );
}

function Metric({
  label,
  value,
  tone = "text-white",
}: {
  label: string;
  value: string;
  tone?: string;
}) {
  return (
    <span className="block text-left sm:text-right">
      <span className="block text-xs text-slate-500">{label}</span>
      <strong className={`block text-sm tabular-nums ${tone}`}>{value}</strong>
    </span>
  );
}
