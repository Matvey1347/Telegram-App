import Link from "next/link";
import type { ReactNode } from "react";
import { EntityCard } from "@/components/ui/primitives";
import { NativeMoney } from "@/components/ui/native-money";
import type {
  TelegramChannelNetworkChannelSummary,
  TelegramChannelNetworkKpiStatus,
} from "@/lib/api";

export function formatNumber(value: unknown, decimals = 0) {
  if (value == null || !Number.isFinite(Number(value))) return "-";
  return Number(value).toLocaleString(undefined, {
    maximumFractionDigits: decimals,
    minimumFractionDigits: decimals,
  });
}

export function formatPercent(value: unknown, decimals = 1) {
  if (value == null || !Number.isFinite(Number(value))) return "-";
  return `${formatNumber(value, decimals)}%`;
}

export function kpiBadgeClass(status?: TelegramChannelNetworkKpiStatus) {
  if (status === "good") return "border-emerald-700 text-emerald-200";
  if (status === "acceptable") return "border-yellow-700 text-yellow-200";
  if (status === "bad") return "border-rose-700 text-rose-200";
  return "border-slate-700 text-slate-300";
}

export function decisionText(status?: TelegramChannelNetworkKpiStatus) {
  if (status === "good") return "Network performs well. Candidate for scaling.";
  if (status === "acceptable")
    return "Network is acceptable. Continue testing carefully.";
  if (status === "bad")
    return "Network has weak KPI. Do not scale before fixing traffic/source/content.";
  return "Not enough data yet.";
}

export function NetworkMetricCard({
  title,
  value,
}: {
  title: string;
  value: ReactNode;
}) {
  return (
    <EntityCard title={title} actions={null}>
      <p className="text-2xl font-semibold">{value}</p>
    </EntityCard>
  );
}

export function TelegramNetworkChannelsTable({
  channels,
}: {
  channels: TelegramChannelNetworkChannelSummary[];
}) {
  return (
    <div className="table-scroll w-full rounded-lg border border-slate-700">
      <table className="w-max min-w-[1120px] text-sm">
        <thead className="bg-slate-900/60 text-slate-300">
          <tr>
            <th className="w-56 px-3 py-2 text-left">Channel</th>
            <th className="w-40 px-3 py-2 text-left">Username</th>
            <th className="w-28 px-3 py-2 text-right">Subscribers</th>
            <th className="w-32 px-3 py-2 text-right">Active estimate</th>
            <th className="w-36 px-3 py-2 text-right">Paid active estimate</th>
            <th className="w-28 px-3 py-2 text-right">View rate</th>
            <th className="w-28 px-3 py-2 text-right">Spend</th>
            <th className="w-28 px-3 py-2 text-right">Avg CPA</th>
            <th className="w-28 px-3 py-2 text-right">Active CPA</th>
            <th className="w-28 px-3 py-2 text-left">KPI status</th>
          </tr>
        </thead>
        <tbody>
          {channels.map((channel) => (
            <tr key={channel.channelId} className="border-t border-slate-800">
              <td className="px-3 py-2">
                <Link
                  href={`/telegram/channels/${channel.channelId}`}
                  className="block truncate text-blue-300 hover:underline"
                >
                  {channel.title || "-"}
                </Link>
              </td>
              <td className="px-3 py-2 text-slate-300">
                {channel.username ? `@${channel.username}` : "-"}
              </td>
              <td className="px-3 py-2 text-right">
                {formatNumber(channel.subscribersCount)}
              </td>
              <td className="px-3 py-2 text-right">
                {formatNumber(channel.activeSubscribersEstimate)}
              </td>
              <td className="px-3 py-2 text-right">
                {formatNumber(channel.paidActiveSubscribersEstimate)}
              </td>
              <td className="px-3 py-2 text-right">
                {formatPercent(channel.viewRate)}
              </td>
              <td className="px-3 py-2 text-right">
                <NativeMoney
                  amount={channel.totalAdSpend}
                  currency={channel.currency}
                />
              </td>
              <td className="px-3 py-2 text-right">
                <NativeMoney
                  amount={channel.avgCpa}
                  currency={channel.currency}
                />
              </td>
              <td className="px-3 py-2 text-right">
                <NativeMoney
                  amount={channel.activeCpa}
                  currency={channel.currency}
                />
              </td>
              <td className="px-3 py-2">
                <span
                  className={`inline-flex rounded border px-2 py-0.5 text-xs ${kpiBadgeClass(channel.kpiStatus)}`}
                >
                  {channel.kpiLabel || "-"}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
