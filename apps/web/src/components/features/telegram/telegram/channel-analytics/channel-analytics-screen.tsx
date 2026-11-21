"use client";

import { formatDateTime } from "@/lib/date-format";
import dynamic from "next/dynamic";
import { CircleHelp, RefreshCw, Settings } from "lucide-react";
import { TelegramChannelAdSalesSection } from "@/components/features/growth/ad-sales/telegram-channel-ad-sales-section";
import { AppShell } from "@/components/layout/app-shell";
import { PageTabHead } from "@/components/layout/page-tab-head";
import { ChannelPreview } from "@/components/features/telegram/telegram/channel-preview";
import { ChannelAccessBadge } from "@/components/features/telegram/telegram/channel-access-badge";
import {
  ChannelSyncScopeModal,
  DEFAULT_CHANNEL_SYNC_SELECTION,
} from "@/components/features/telegram/telegram/channel-sync-scope-modal";
import { Button, PageHeader, Skeleton } from "@/components/ui/primitives";
import { hasKpiSettings, channelSubtitle } from "./channel-analytics-format";
import {
  SimplePanel,
  InfoTooltip,
  SectionToggle,
} from "./channel-analytics-primitives";
import { useChannelAnalyticsQueries } from "./use-channel-analytics-queries";
import { useChannelAnalyticsReport } from "./use-channel-analytics-report";
import {
  useChannelAnalyticsMutations,
  summarizeSync,
} from "./use-channel-analytics-mutations";
import {
  AudienceOverview,
  FinancialOverview,
  OverviewPanelSkeleton,
} from "./channel-analytics-overview";
import {
  RangePicker,
  ChannelMetricsDeck,
  ChannelAnalyticsHeroSkeleton,
} from "./channel-analytics-hero";
import { SyncStatusModal } from "./channel-analytics-sync-status";
import {
  CampaignAttributionSection,
  ChannelPostMetricsSection,
  RawInviteLinksSection,
} from "./channel-analytics-lists";

const TelegramChannelAudienceChart = dynamic(
  () =>
    import("@/components/features/telegram/telegram/telegram-channel-graph-charts").then(
      (module) => module.TelegramChannelAudienceChart,
    ),
  {
    loading: () => (
      <div className="h-64 animate-pulse rounded-lg bg-slate-900/40" />
    ),
  },
);
const MtprotoGraphChart = dynamic(
  () =>
    import("@/components/features/telegram/telegram/telegram-channel-graph-charts").then(
      (module) => module.MtprotoGraphChart,
    ),
  {
    loading: () => (
      <div className="h-64 animate-pulse rounded-lg bg-slate-900/40" />
    ),
  },
);

const ChannelSettingsModal = dynamic(
  () =>
    import("@/components/features/telegram/telegram/channel-settings-modal").then(
      (module) => module.ChannelSettingsModal,
    ),
  { loading: () => null },
);

export function TelegramChannelAnalyticsScreen({ id }: { id: string }) {
  const queries = useChannelAnalyticsQueries(id);
  const report = useChannelAnalyticsReport(id, queries);
  const { syncMutation, manualMetricsMutation } = useChannelAnalyticsMutations(
    id,
    queries,
  );
  const {
    rangeMode,
    setRangeMode,
    customFrom,
    customTo,
    setCustomFrom,
    setCustomTo,
    openSections,
    setOpenSections,
    syncScopeOpen,
    setSyncScopeOpen,
    syncStatusOpen,
    setSyncStatusOpen,
    channelSettingsOpen,
    setChannelSettingsOpen,
    syncSelection,
    setSyncSelection,
    syncPostLimit,
    setSyncPostLimit,
    lastSyncResult,
    audience,
    audienceSnapshots,
    settings,
    financialSummary,
    currencySettings,
    isAudienceSnapshotsLoading,
  } = queries;
  const {
    activeChannel,
    computed,
    latestSnapshot,
    mtprotoStats,
    mtprotoGraphs,
    isInitialPageLoading,
    showAudiencePanelSkeleton,
    showFinancialPanelSkeleton,
    statCards,
    hasAudienceChart,
  } = report;
  return (
    <AppShell>
      <PageTabHead
        title={`Analytics · ${
          isInitialPageLoading
            ? "Telegram channel"
            : activeChannel?.title || "Telegram channel"
        } · Telegram System`}
        iconUrl={activeChannel?.photoUrl || null}
        emoji="📊"
        color="#0f766e"
      />
      <PageHeader
        title={
          isInitialPageLoading
            ? "Channel Analytics"
            : activeChannel?.title || "Channel Analytics"
        }
        subtitle={
          isInitialPageLoading
            ? undefined
            : `${activeChannel?.archivedAt ? "Archived · " : ""}${channelSubtitle(activeChannel)}`
        }
        action={
          <div className="flex flex-wrap items-center justify-end gap-2">
            <Button
              type="button"
              variant="secondary"
              onClick={() => setChannelSettingsOpen(true)}
              className="inline-flex h-11 items-center justify-center gap-2"
            >
              <Settings size={16} /> Settings
            </Button>
            <InfoTooltip
              tip={
                latestSnapshot
                  ? `Last sync: ${formatDateTime(String(latestSnapshot.syncedAt))}`
                  : "No Telegram snapshot yet."
              }
            >
              <button
                type="button"
                onClick={() => setSyncStatusOpen(true)}
                className="flex h-11 w-11 items-center justify-center rounded-lg border border-slate-600/80 bg-slate-900 text-slate-200 transition hover:border-blue-400/70 hover:bg-slate-800 hover:text-white"
              >
                <RefreshCw size={18} />
              </button>
            </InfoTooltip>
            <Button
              variant="primary"
              disabled={syncMutation.isPending}
              onClick={() => setSyncScopeOpen(true)}
              className="inline-flex h-11 items-center justify-center gap-2 border border-blue-500/40 bg-blue-600/95 px-5 text-white shadow-[0_10px_24px_rgba(37,99,235,0.18)] transition hover:border-blue-400 hover:bg-blue-500"
            >
              <RefreshCw
                size={16}
                className={syncMutation.isPending ? "animate-spin" : ""}
              />
              {syncMutation.isPending ? "Syncing..." : "Sync"}
            </Button>
            <InfoTooltip tip="Sync uses the best connected source available for each data type and records attribution.">
              <button
                type="button"
                onClick={() => setSyncScopeOpen(true)}
                className="flex h-11 w-11 items-center justify-center rounded-lg border border-slate-600/80 bg-slate-900 text-slate-200 transition hover:border-blue-400/70 hover:bg-slate-800 hover:text-white"
              >
                <CircleHelp size={18} />
              </button>
            </InfoTooltip>
          </div>
        }
      />
      {isInitialPageLoading ? (
        <ChannelAnalyticsHeroSkeleton />
      ) : (
        <>
          <div className="mt-3">
            <div className="flex flex-wrap items-center gap-2">
              <ChannelAccessBadge accessMode={activeChannel?.accessMode} />
              {activeChannel?.acquisitionType === "PURCHASED" ? (
                <span className="inline-flex rounded border border-cyan-700/70 bg-cyan-950/25 px-2 py-0.5 text-xs text-cyan-200">
                  Purchased
                </span>
              ) : null}
            </div>
          </div>
          <section className="mt-5 grid gap-4 xl:grid-cols-[minmax(320px,0.85fr)_minmax(0,1.4fr)]">
            <div className="min-w-0 space-y-3">
              {activeChannel ? (
                <ChannelPreview
                  channel={{
                    ...activeChannel,
                    currentSubscribersCount: computed.subscribers,
                  }}
                  className="!mb-0"
                />
              ) : null}
              <RangePicker
                rangeMode={rangeMode}
                setRangeMode={setRangeMode}
                customFrom={customFrom}
                customTo={customTo}
                setCustomFrom={setCustomFrom}
                setCustomTo={setCustomTo}
              />
            </div>
            <ChannelMetricsDeck metrics={statCards} />
          </section>
        </>
      )}

      <section className="mt-4 grid grid-cols-[repeat(auto-fit,minmax(min(460px,100%),1fr))] gap-4">
        {showAudiencePanelSkeleton ? (
          <OverviewPanelSkeleton title="Audience overview" />
        ) : (
          <AudienceOverview audience={audience} />
        )}
        {showFinancialPanelSkeleton ? (
          <OverviewPanelSkeleton title="KPI / Financial overview" />
        ) : (
          <FinancialOverview
            summary={financialSummary}
            channel={activeChannel}
            hasKpi={hasKpiSettings(activeChannel)}
            settings={settings}
          />
        )}
      </section>

      <section className="mt-6">
        <TelegramChannelAdSalesSection channelId={id} />
      </section>

      <section className="mt-6">
        <SectionToggle
          title="Charts"
          open={openSections.charts}
          onToggle={() =>
            setOpenSections((prev) => ({ ...prev, charts: !prev.charts }))
          }
        />
        {openSections.charts ? (
          <div className="grid grid-cols-[repeat(auto-fit,minmax(min(420px,100%),1fr))] gap-4">
            {!hasAudienceChart &&
            !mtprotoGraphs.length &&
            isAudienceSnapshotsLoading ? (
              <SimplePanel title="Charts">
                <div className="h-64 rounded-lg bg-slate-900/40 p-2">
                  <div className="space-y-3 p-3">
                    <Skeleton className="h-4 w-28" />
                    <Skeleton className="h-48 w-full" />
                  </div>
                </div>
              </SimplePanel>
            ) : null}
            {hasAudienceChart ? (
              <TelegramChannelAudienceChart snapshots={audienceSnapshots} />
            ) : null}
            {mtprotoGraphs.map(({ key, title, chart }) => (
              <SimplePanel key={key} title={title}>
                <MtprotoGraphChart chart={chart} />
              </SimplePanel>
            ))}
          </div>
        ) : null}
      </section>

      <CampaignAttributionSection queries={queries} report={report} />
      <ChannelPostMetricsSection
        id={id}
        queries={queries}
        report={report}
        manualMetricsMutation={manualMetricsMutation}
      />
      <RawInviteLinksSection queries={queries} report={report} />
      <SyncStatusModal
        open={syncStatusOpen}
        onClose={() => setSyncStatusOpen(false)}
        latestSnapshot={latestSnapshot}
        mtprotoStats={mtprotoStats}
      />
      {channelSettingsOpen && activeChannel ? (
        <ChannelSettingsModal
          channel={activeChannel}
          currencySettings={currencySettings}
          onClose={() => setChannelSettingsOpen(false)}
        />
      ) : null}
      <ChannelSyncScopeModal
        open={syncScopeOpen}
        title="Sync sources and scope"
        description="Choose what to sync for this channel."
        helperText="Sync selected saves this scope and post count to the channel. Sync all runs the full sync without changing the saved settings."
        onClose={() => setSyncScopeOpen(false)}
        isSyncing={syncMutation.isPending}
        selection={syncSelection}
        postLimit={syncPostLimit}
        submitLabel="Sync selected"
        onSelectionChange={setSyncSelection}
        onPostLimitChange={setSyncPostLimit}
        statusContent={
          <div className="rounded-md border border-slate-800 bg-slate-900/40 p-3 text-sm text-slate-300">
            <p>
              Now syncing:{" "}
              {syncMutation.isPending
                ? "data from available connected sources"
                : "idle"}
            </p>
            <p>
              Last sync payload:{" "}
              {lastSyncResult
                ? summarizeSync(lastSyncResult)
                : "Run sync to capture detailed result in UI"}
            </p>
          </div>
        }
        onSyncAll={() => {
          setSyncScopeOpen(false);
          syncMutation.mutate({
            ...DEFAULT_CHANNEL_SYNC_SELECTION,
            postLimit: syncPostLimit,
          });
        }}
        onSubmit={() => {
          setSyncScopeOpen(false);
          syncMutation.mutate({
            ...syncSelection,
            postLimit: syncPostLimit,
            saveSelection: true,
          });
        }}
      />
    </AppShell>
  );
}
