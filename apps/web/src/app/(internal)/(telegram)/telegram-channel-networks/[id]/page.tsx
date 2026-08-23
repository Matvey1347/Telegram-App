"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { type ReactNode, useMemo, useState } from "react";
import { AppShell } from "@/components/layout/app-shell";
import { PageTabHead } from "@/components/layout/page-tab-head";
import {
  Button,
  EmptyState,
  EntityCard,
  LoadingState,
  PageHeader,
} from "@/components/ui/primitives";
import {
  telegramChannelNetworksApi,
  telegramChannelsApi,
  type TelegramChannelSelectOption as TelegramChannel,
  type TelegramChannelNetworkChannelSummary,
  type TelegramChannelNetworkKpiStatus,
} from "@/lib/api";
import { telegramChannelKeys } from "@/lib/query-keys";
import { useAppToast } from "@/providers/toast-provider";
import { NativeMoney } from "@/components/ui/native-money";
import { TelegramNetworkEconomicsPanel } from "@/components/features/telegram/telegram/telegram-network-economics-panel";
import { TelegramNetworkFormModal } from "@/components/features/telegram/telegram/telegram-network-form-modal";
import { networkKeys } from "@/lib/query-keys";

function toNumber(value: unknown) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function formatNumber(value: unknown, decimals = 0) {
  if (value == null || !Number.isFinite(Number(value))) return "-";
  return toNumber(value).toLocaleString(undefined, {
    maximumFractionDigits: decimals,
    minimumFractionDigits: decimals,
  });
}

function formatPercent(value: unknown, decimals = 1) {
  if (value == null || !Number.isFinite(Number(value))) return "-";
  return `${formatNumber(value, decimals)}%`;
}
function kpiBadgeClass(status?: TelegramChannelNetworkKpiStatus) {
  if (status === "good") return "border-emerald-700 text-emerald-200";
  if (status === "acceptable") return "border-yellow-700 text-yellow-200";
  if (status === "bad") return "border-rose-700 text-rose-200";
  return "border-slate-700 text-slate-300";
}

function decisionText(status?: TelegramChannelNetworkKpiStatus) {
  if (status === "good") return "Network performs well. Candidate for scaling.";
  if (status === "acceptable")
    return "Network is acceptable. Continue testing carefully.";
  if (status === "bad")
    return "Network has weak KPI. Do not scale before fixing traffic/source/content.";
  return "Not enough data yet.";
}

function isOwnChannel(channel: TelegramChannel) {
  return channel.canPostMessages;
}

export default function TelegramChannelNetworkDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const queryClient = useQueryClient();
  const id = params.id;
  const [formOpen, setFormOpen] = useState(false);
  const { pushToast } = useAppToast();

  const {
    data: network,
    isLoading,
    error,
  } = useQuery({
    queryKey: networkKeys.detail(id),
    queryFn: () => telegramChannelNetworksApi.get(id),
  });
  const { data: channels = [] } = useQuery({
    queryKey: telegramChannelKeys.select(),
    queryFn: () => telegramChannelsApi.select(),
  });
  const updateMutation = useMutation({
    mutationFn: (payload: {
      name: string;
      description?: string | null;
      telegramChannelIds: string[];
    }) => telegramChannelNetworksApi.update(id, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: networkKeys.list() });
      queryClient.invalidateQueries({ queryKey: networkKeys.detail(id) });
      setFormOpen(false);
      pushToast("Network updated.", "success");
    },
    onError: () => pushToast("Failed to update network.", "error"),
  });
  const deleteMutation = useMutation({
    mutationFn: () => telegramChannelNetworksApi.remove(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: networkKeys.list() });
      router.push("/telegram-channel-networks");
    },
    onError: () => pushToast("Failed to delete network.", "error"),
  });

  const summary = network?.summary;
  const ownChannels = useMemo(() => channels.filter(isOwnChannel), [channels]);

  return (
    <AppShell>
      {network ? (
        <PageTabHead title={`Network · ${network.name} · Telegram System`} />
      ) : null}
      <PageHeader
        title={network?.name || "Telegram Channel Network"}
        subtitle={network?.description || "Network analytics"}
        action={
          <div className="flex gap-2">
            <Link
              href="/telegram-channel-networks"
              className="rounded-lg border border-slate-700 px-4 py-2 text-sm text-slate-200 hover:bg-slate-800"
            >
              Back
            </Link>
            {network && !network.isSystem ? (
              <>
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => setFormOpen(true)}
                >
                  Edit
                </Button>
                <Button
                  type="button"
                  variant="danger"
                  disabled={deleteMutation.isPending}
                  onClick={() => deleteMutation.mutate()}
                >
                  Delete
                </Button>
              </>
            ) : null}
          </div>
        }
      />
      {isLoading ? <LoadingState /> : null}
      {error ? (
        <div className="rounded-lg border border-rose-700 p-3 text-sm text-rose-200">
          Failed to load network.
        </div>
      ) : null}
      {summary ? (
        <>
          <section className="grid grid-cols-[repeat(auto-fit,minmax(min(220px,100%),1fr))] gap-4">
            <MetricCard
              title="Channels count"
              value={formatNumber(summary.channelsCount)}
            />
            <MetricCard
              title="Total subscribers"
              value={formatNumber(summary.totalSubscribers)}
            />
            <MetricCard
              title="Active subscribers"
              value={formatNumber(summary.activeSubscribersEstimate)}
            />
            <MetricCard
              title="View rate"
              value={formatPercent(summary.viewRate)}
            />
            <MetricCard
              title="Total ad spend"
              value={
                <NativeMoney
                  amount={summary.totalAdSpend}
                  currency={summary.currency}
                />
              }
            />
            <MetricCard
              title="Avg CPA"
              value={
                <NativeMoney
                  amount={summary.avgCpa}
                  currency={summary.currency}
                />
              }
            />
            <MetricCard
              title="Active CPA"
              value={
                <NativeMoney
                  amount={summary.activeCpa}
                  currency={summary.currency}
                />
              }
            />
            <EntityCard title="KPI status" actions={null}>
              <span
                className={`inline-flex rounded border px-2 py-0.5 text-xs ${kpiBadgeClass(summary.kpiStatus)}`}
              >
                {summary.kpiLabel || "-"}
              </span>
            </EntityCard>
          </section>
          <TelegramNetworkEconomicsPanel summary={summary} />
          <section className="mt-6">
            <EntityCard title="Decision" actions={null}>
              <p className="text-sm text-slate-300">
                {decisionText(summary.kpiStatus)}
              </p>
            </EntityCard>
          </section>
          <section className="mt-6">
            <h3 className="mb-3 text-lg font-semibold">Channels</h3>
            {network?.channelSummaries?.length ? (
              <ChannelsTable channels={network.channelSummaries} />
            ) : (
              <EmptyState text="No channels in this network." />
            )}
          </section>
        </>
      ) : null}
      {formOpen ? (
        <TelegramNetworkFormModal
          network={network ?? null}
          channels={ownChannels}
          isSubmitting={updateMutation.isPending}
          onClose={() => setFormOpen(false)}
          onSubmit={(payload) => updateMutation.mutate(payload)}
        />
      ) : null}
    </AppShell>
  );
}

function MetricCard({ title, value }: { title: string; value: ReactNode }) {
  return (
    <EntityCard title={title} actions={null}>
      <p className="text-2xl font-semibold">{value}</p>
    </EntityCard>
  );
}

function ChannelsTable({
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
