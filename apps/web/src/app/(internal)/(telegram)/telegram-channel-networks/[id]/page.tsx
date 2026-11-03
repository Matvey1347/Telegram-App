"use client";

import Link from "next/link";
import dynamic from "next/dynamic";
import { useParams, useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { AppShell } from "@/components/layout/app-shell";
import { PageTabHead } from "@/components/layout/page-tab-head";
import {
  Button,
  EmptyState,
  EntityCard,
  LoadingState,
  PageHeader,
} from "@/components/ui/primitives";
import { telegramChannelNetworksApi, telegramChannelsApi } from "@/lib/api";
import { telegramChannelKeys } from "@/lib/query-keys";
import { useAppToast } from "@/providers/toast-provider";
import { NativeMoney } from "@/components/ui/native-money";
import { TelegramNetworkEconomicsPanel } from "@/components/features/telegram/telegram/telegram-network-economics-panel";
import { networkKeys } from "@/lib/query-keys";
import {
  decisionText,
  formatNumber,
  formatPercent,
  kpiBadgeClass,
  NetworkMetricCard,
  TelegramNetworkChannelsTable,
} from "@/components/features/telegram/telegram/telegram-network-detail-presentation";
const TelegramNetworkFormModal = dynamic(() =>
  import("@/components/features/telegram/telegram/telegram-network-form-modal").then(
    (module) => module.TelegramNetworkFormModal,
  ),
);

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
    enabled: formOpen,
  });
  const updateMutation = useMutation({
    mutationFn: (payload: {
      name: string;
      description?: string | null;
      telegramChannelIds: string[];
    }) => telegramChannelNetworksApi.update(id, payload),
    onSuccess: (updated) => {
      queryClient.setQueryData(networkKeys.detail(id), updated);
      queryClient.invalidateQueries({ queryKey: networkKeys.list() });
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
  const ownChannels = useMemo(
    () => channels.filter((channel) => channel.canPostMessages),
    [channels],
  );

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
            <NetworkMetricCard
              title="Channels count"
              value={formatNumber(summary.channelsCount)}
            />
            <NetworkMetricCard
              title="Total subscribers"
              value={formatNumber(summary.totalSubscribers)}
            />
            <NetworkMetricCard
              title="Active subscribers"
              value={formatNumber(summary.activeSubscribersEstimate)}
            />
            <NetworkMetricCard
              title="View rate"
              value={formatPercent(summary.viewRate)}
            />
            <NetworkMetricCard
              title="Total ad spend"
              value={
                <NativeMoney
                  amount={summary.totalAdSpend}
                  currency={summary.currency}
                />
              }
            />
            <NetworkMetricCard
              title="Avg CPA"
              value={
                <NativeMoney
                  amount={summary.avgCpa}
                  currency={summary.currency}
                />
              }
            />
            <NetworkMetricCard
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
              <TelegramNetworkChannelsTable
                channels={network.channelSummaries}
              />
            ) : (
              <EmptyState text="No channels in this network." />
            )}
          </section>
        </>
      ) : null}
      {formOpen && network ? (
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
