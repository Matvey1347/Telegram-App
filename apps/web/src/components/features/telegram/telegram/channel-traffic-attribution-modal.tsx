"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip as ChartTooltip,
  XAxis,
  YAxis,
} from "recharts";
import type {
  TelegramChannelTrafficAttributionPoint,
  TelegramChannelTrafficSourceKind,
} from "@telegram-system/shared";
import type { TelegramChannel } from "@/lib/api";
import { telegramChannelsApi } from "@/lib/api";
import { telegramChannelKeys } from "@/lib/query-keys";
import { Button, Modal, Skeleton, Table } from "@/components/ui/primitives";
import { TelegramEntityAvatar } from "./telegram-entity-avatar";

const sourceColors: Record<TelegramChannelTrafficSourceKind, string> = {
  MUTUAL_PROMOTION: "#60a5fa",
  FOLDERS: "#a78bfa",
  AD_CAMPAIGNS: "#34d399",
  AUDIENCE_TRANSFER: "#f59e0b",
  BOT: "#22d3ee",
  BROADCAST: "#f472b6",
  OTHER: "#a3a3a3",
};

const sourceLabels: Record<TelegramChannelTrafficSourceKind, string> = {
  MUTUAL_PROMOTION: "Mutual promotion",
  FOLDERS: "Folders",
  AD_CAMPAIGNS: "Ad campaigns",
  AUDIENCE_TRANSFER: "Audience transfer",
  BOT: "Bot",
  BROADCAST: "Broadcasts",
  OTHER: "Other links",
};

function number(value: unknown, digits = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed)
    ? parsed.toLocaleString(undefined, { maximumFractionDigits: digits })
    : "—";
}

function money(value: number | null, currency: string) {
  return value == null
    ? "—"
    : `${number(value, value < 10 ? 2 : 1)} ${currency}`;
}

function cpaTone(value: number | null, target: unknown) {
  const targetCpa = Number(target);
  if (value == null || !Number.isFinite(targetCpa) || targetCpa <= 0)
    return "text-white";
  return value <= targetCpa ? "text-emerald-300" : "text-rose-300";
}

function cpaHint(
  value: number | null,
  channel: TelegramChannel,
  currency: string,
) {
  const targetCpa = Number(channel.targetCpa);
  if (value == null || !Number.isFinite(targetCpa) || targetCpa <= 0)
    return "Paid placement spend divided by retained new subscribers.";
  return `Paid placement spend / retained new subscribers. KPI ≤ ${money(targetCpa, channel.kpiCurrency ?? currency)}.`;
}

export function pivotTrafficAttributionPoints(
  points: TelegramChannelTrafficAttributionPoint[],
  selectedInviteLinkId?: string | null,
) {
  const rows = new Map<string, Record<string, string | number>>();
  const latestByLink = new Map<
    string,
    TelegramChannelTrafficAttributionPoint
  >();
  for (const point of [...points]
    .filter(
      (candidate) =>
        !selectedInviteLinkId ||
        candidate.inviteLinkId === selectedInviteLinkId,
    )
    .sort((a, b) => a.at.localeCompare(b.at))) {
    const date = point.at.slice(0, 10);
    latestByLink.set(point.inviteLinkId, point);
    const totals = new Map<TelegramChannelTrafficSourceKind, number>();
    for (const current of latestByLink.values()) {
      totals.set(
        current.kind,
        (totals.get(current.kind) ?? 0) + current.retained,
      );
    }
    rows.set(date, { date, ...Object.fromEntries(totals) });
  }
  return [...rows.values()];
}

export function ChannelTrafficAttributionModal({
  channel,
  onClose,
}: {
  channel: TelegramChannel;
  onClose: () => void;
}) {
  const query = useQuery({
    queryKey: telegramChannelKeys.trafficAttribution(channel.id),
    queryFn: () => telegramChannelsApi.trafficAttribution(channel.id),
    staleTime: 60_000,
  });
  const [activeKind, setActiveKind] =
    useState<TelegramChannelTrafficSourceKind | null>(null);
  const [selectedInviteLinkId, setSelectedInviteLinkId] = useState<
    string | null
  >(null);
  const chartData = useMemo(
    () =>
      pivotTrafficAttributionPoints(
        query.data?.points ?? [],
        selectedInviteLinkId,
      ),
    [query.data?.points, selectedInviteLinkId],
  );
  const selectedLinkKind = query.data?.points.find(
    (point) => point.inviteLinkId === selectedInviteLinkId,
  )?.kind;
  const visibleKinds = selectedLinkKind
    ? [selectedLinkKind]
    : (query.data?.sources.map((source) => source.kind) ?? []);
  const selectedLink = query.data?.items
    .flatMap((item) => item.inviteLinks ?? [])
    .find((link) => link.id === selectedInviteLinkId);
  const selectedSource =
    query.data?.sources.find((source) => source.kind === activeKind) ??
    query.data?.sources[0] ??
    null;

  return (
    <Modal
      open
      onClose={onClose}
      title={`${channel.title} · traffic attribution`}
      size="xl"
      leadingHeaderAction={
        <TelegramEntityAvatar
          imageUrl={channel.photoUrl}
          kind="channel"
          alt={channel.title}
          size="sm"
        />
      }
    >
      {query.isLoading ? (
        <div className="space-y-3" aria-label="Loading traffic attribution">
          <Skeleton className="h-20 w-full" />
          <Skeleton className="h-72 w-full" />
          <Skeleton className="h-40 w-full" />
        </div>
      ) : query.isError ? (
        <div className="flex items-center justify-between gap-3 rounded-lg border border-rose-900/60 bg-rose-950/20 p-4 text-sm text-rose-200">
          <span>Could not load traffic attribution.</span>
          <Button variant="secondary" onClick={() => void query.refetch()}>
            Retry
          </Button>
        </div>
      ) : query.data ? (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <Metric
              label="Acquired"
              value={`+${number(query.data.acquired)}`}
              tone="text-emerald-300"
            />
            <Metric label="Retained" value={number(query.data.retained)} />
            <Metric
              label="Unsubscribed / drop"
              value={`${number(query.data.unsubscribed)} · ${number(query.data.unsubscribePercent, 1)}%`}
              tone="text-rose-300"
            />
            <Metric
              label="Paid CPA"
              value={money(
                query.data.retainedSubscriberCost,
                query.data.currency,
              )}
              tone={cpaTone(
                query.data.retainedSubscriberCost,
                channel.targetCpa,
              )}
              hint={cpaHint(
                query.data.retainedSubscriberCost,
                channel,
                query.data.currency,
              )}
            />
          </div>

          {chartData.length > 1 ? (
            <section className="rounded-lg border border-neutral-800 bg-neutral-950/50 p-3">
              <div className="mb-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h3 className="text-sm font-semibold text-white">
                    {selectedLink
                      ? `Invite link: ${selectedLink.name}`
                      : "Attributed invite counters by source"}
                  </h3>
                  {selectedLink ? (
                    <Button
                      variant="secondary"
                      className="h-7 px-2 text-xs"
                      onClick={() => setSelectedInviteLinkId(null)}
                    >
                      Show all links
                    </Button>
                  ) : null}
                </div>
                <p className="text-xs text-neutral-500">
                  Stored invite-link counters grouped by their current source.
                </p>
              </div>
              <div className="h-72 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart
                    data={chartData}
                    margin={{ top: 8, right: 12, left: -12, bottom: 0 }}
                  >
                    <CartesianGrid stroke="#262626" strokeDasharray="3 3" />
                    <XAxis
                      dataKey="date"
                      tick={{ fill: "#a3a3a3", fontSize: 11 }}
                      minTickGap={24}
                    />
                    <YAxis
                      tick={{ fill: "#a3a3a3", fontSize: 11 }}
                      allowDecimals={false}
                    />
                    <ChartTooltip
                      contentStyle={{
                        background: "#0a0a0a",
                        border: "1px solid #404040",
                        borderRadius: 8,
                      }}
                      labelStyle={{ color: "#d4d4d4" }}
                    />
                    <Legend />
                    {visibleKinds.map((kind) => (
                      <Line
                        key={kind}
                        type="monotone"
                        dataKey={kind}
                        name={sourceLabels[kind]}
                        stroke={sourceColors[kind]}
                        strokeWidth={2}
                        dot={false}
                        connectNulls
                      />
                    ))}
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </section>
          ) : (
            <p className="rounded-lg border border-neutral-800 bg-neutral-950/50 p-4 text-sm text-neutral-400">
              A chart will appear after at least two invite-link snapshots are
              collected.
            </p>
          )}

          {query.data.sources.length && selectedSource ? (
            <div className="space-y-3">
              <div
                className="flex gap-1 overflow-x-auto border-b border-neutral-800 pb-2"
                role="tablist"
                aria-label="Traffic sources"
              >
                {query.data.sources.map((source) => {
                  const active = source.kind === selectedSource.kind;
                  return (
                    <button
                      key={source.kind}
                      type="button"
                      role="tab"
                      aria-selected={active}
                      className={`shrink-0 rounded-md px-3 py-1.5 text-xs font-medium ${
                        active
                          ? "bg-blue-950/70 text-blue-200"
                          : "text-neutral-400 hover:bg-neutral-900 hover:text-neutral-200"
                      }`}
                      onClick={() => setActiveKind(source.kind)}
                    >
                      {source.label} · {number(source.acquired)}
                    </button>
                  );
                })}
              </div>
              <section className="overflow-hidden rounded-lg border border-neutral-800">
                <div className="flex flex-wrap items-center justify-between gap-2 bg-neutral-900/70 px-3 py-2">
                  <div>
                    <h3 className="text-sm font-semibold text-white">
                      {selectedSource.label}
                    </h3>
                    <p className="text-xs text-neutral-500">
                      {selectedSource.sourceCount} sources ·{" "}
                      {selectedSource.linkCount} links
                    </p>
                  </div>
                  <div className="flex gap-3 text-xs tabular-nums">
                    <span className="text-emerald-300">
                      +{number(selectedSource.acquired)}
                    </span>
                    <span className="text-rose-300">
                      −{number(selectedSource.unsubscribed)} (
                      {number(selectedSource.unsubscribePercent, 1)}%)
                    </span>
                    <span
                      className={cpaTone(
                        selectedSource.retainedSubscriberCost,
                        channel.targetCpa,
                      )}
                    >
                      CPA{" "}
                      {money(
                        selectedSource.retainedSubscriberCost,
                        selectedSource.currency,
                      )}
                    </span>
                  </div>
                </div>
                <Table>
                  <thead className="border-y border-neutral-800 text-neutral-500">
                    <tr>
                      <th className="px-3 py-2 font-medium">Source</th>
                      <th className="px-3 py-2 text-right font-medium">Peak</th>
                      <th className="px-3 py-2 text-right font-medium">
                        Retained
                      </th>
                      <th className="px-3 py-2 text-right font-medium">Lost</th>
                      <th className="px-3 py-2 text-right font-medium">
                        Spend
                      </th>
                      <th className="px-3 py-2 text-right font-medium">CPA</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-neutral-800/80">
                    {query.data.items
                      .filter((item) => item.kind === selectedSource.kind)
                      .map((item) => (
                        <tr key={item.id}>
                          <td className="max-w-72 px-3 py-2">
                            <div className="flex min-w-0 items-center gap-2">
                              <TelegramEntityAvatar
                                imageUrl={item.avatarUrl}
                                kind="channel"
                                alt={item.title}
                                size="xs"
                              />
                              <p className="truncate font-medium text-neutral-200">
                                {item.title}
                              </p>
                            </div>
                            {item.subtitle ? (
                              <p className="truncate text-neutral-500">
                                {item.subtitle}
                              </p>
                            ) : null}
                            {(item.inviteLinks ?? []).length ? (
                              <div className="mt-1 flex flex-wrap gap-1">
                                {(item.inviteLinks ?? []).map((link) => (
                                  <button
                                    key={link.id}
                                    type="button"
                                    className={`max-w-40 truncate rounded border px-1.5 py-0.5 text-[11px] ${
                                      selectedInviteLinkId === link.id
                                        ? "border-blue-500 bg-blue-950/50 text-blue-200"
                                        : "border-neutral-700 text-neutral-400 hover:border-neutral-500 hover:text-neutral-200"
                                    }`}
                                    title={link.url}
                                    onClick={() =>
                                      setSelectedInviteLinkId(link.id)
                                    }
                                  >
                                    {link.name}
                                  </button>
                                ))}
                              </div>
                            ) : null}
                          </td>
                          <td className="px-3 py-2 text-right text-emerald-300">
                            +{number(item.acquired)}
                          </td>
                          <td className="px-3 py-2 text-right text-neutral-200">
                            {number(item.retained)}
                          </td>
                          <td className="px-3 py-2 text-right text-rose-300">
                            {number(item.unsubscribed)} ·{" "}
                            {number(item.unsubscribePercent, 1)}%
                          </td>
                          <td className="px-3 py-2 text-right text-neutral-300">
                            {money(item.spend, item.currency)}
                          </td>
                          <td
                            className={`px-3 py-2 text-right ${cpaTone(
                              item.retainedSubscriberCost,
                              channel.targetCpa,
                            )}`}
                          >
                            {money(item.retainedSubscriberCost, item.currency)}
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </Table>
              </section>
            </div>
          ) : (
            <p className="rounded-lg border border-neutral-800 bg-neutral-950/50 p-4 text-sm text-neutral-400">
              No attributed traffic sources are available for this channel yet.
            </p>
          )}
          <p className="text-xs text-neutral-500">
            {query.data.dataQualityNote}
            {query.data.historyTruncated
              ? " The chart is limited to the latest 5,000 snapshots."
              : ""}
          </p>
        </div>
      ) : null}
    </Modal>
  );
}

function Metric({
  label,
  value,
  tone = "text-white",
  hint,
}: {
  label: string;
  value: string;
  tone?: string;
  hint?: string;
}) {
  return (
    <div className="rounded-lg border border-neutral-800 bg-neutral-950/55 p-3">
      <p className="text-xs text-neutral-500" title={hint}>
        {label}
      </p>
      <p className={`mt-1 text-base font-semibold tabular-nums ${tone}`}>
        {value}
      </p>
    </div>
  );
}
