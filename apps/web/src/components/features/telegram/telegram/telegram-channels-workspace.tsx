"use client";

import { useMemo, useState } from "react";
import dynamic from "next/dynamic";
import { useSearchParams } from "next/navigation";
import { AppShell } from "@/components/layout/app-shell";
import { sortChannelsByScale } from "@/components/features/telegram/telegram/channel-economics-summary";
import { TelegramChannelCatalogCard } from "@/components/features/telegram/telegram/telegram-channel-catalog-card";
import {
  ChannelSyncScopeModal,
  DEFAULT_CHANNEL_SYNC_SELECTION,
  WorkspaceChannelSyncModal,
  syncSelectionFromChannel,
} from "@/components/features/telegram/telegram/channel-sync-scope-modal";
import { TelegramChannelsHeaderActions } from "@/components/features/telegram/telegram/telegram-channels-header-actions";
import type { TelegramChannelExportSelection } from "@/components/features/telegram/telegram/telegram-channel-export-modal";
import { TelegramPeopleCards } from "@/components/features/telegram/telegram/telegram-overview-cards";
import {
  telegramChannelsApi,
  type AdvertisingChannel,
  type TelegramChannel,
  type TelegramChannelAdAnalysis,
  type TelegramChannelNetwork,
  type TelegramChannelSyncSelection,
} from "@/lib/api";
import {
  ConfirmDeleteModal,
  EmptyState,
  LoadingState,
  PageHeader,
} from "@/components/ui/primitives";
import { useAppToast } from "@/providers/toast-provider";
import {
  parseTelegramAccountFilter as parseAccountFilter,
  parseTelegramChannelLifecycle as parseChannelLifecycleTab,
  parseTelegramChannelOwnership as parseChannelFilter,
  TELEGRAM_CHANNEL_TAB_LABELS,
  TELEGRAM_CHANNEL_TAB_OPTIONS,
  type TelegramAccountFilter as AccountFilter,
  type TelegramChannelLifecycleFilter as ChannelLifecycleTab,
  type TelegramChannelOwnershipFilter as ChannelFilter,
  type TelegramChannelsTab as TelegramTab,
} from "@/components/features/telegram/telegram/telegram-channels-route-state";
import { usePersistedRouteTab } from "@/hooks/use-persisted-route-tab";
import {
  downloadTelegramChannelExport,
  safeTelegramChannelExportName,
} from "@/components/features/telegram/telegram/telegram-channel-export";

import { AdAnalysisModal } from "./telegram-channels-analysis-modal";
import {
  TelegramNetworksSection,
  NetworkFormModal,
} from "./telegram-channels-networks-panel";
import { ImportChannelModal } from "./telegram-channels-import-modal";
import {
  requestErrorMessage,
  isOwnChannel,
} from "./telegram-channels-workspace-utils";
import { useTelegramChannelsWorkspaceReads } from "./use-telegram-channels-workspace-reads";
import { useTelegramChannelsWorkspaceMutations } from "./use-telegram-channels-workspace-mutations";

const MtprotoAccountsPanel = dynamic(
  () =>
    import("@/components/features/telegram/telegram/telegram-account-panels").then(
      (module) => module.MtprotoAccountsPanel,
    ),
  { loading: () => null },
);
const TelegramChannelExportModal = dynamic(
  () =>
    import("@/components/features/telegram/telegram/telegram-channel-export-modal").then(
      (module) => module.TelegramChannelExportModal,
    ),
  { loading: () => null },
);
const TelegramChannelMessageTemplatesModal = dynamic(
  () =>
    import("@/components/features/telegram/telegram/telegram-channel-message-templates-modal").then(
      (module) => module.TelegramChannelMessageTemplatesModal,
    ),
  { loading: () => null },
);

const TELEGRAM_TAB_STORAGE_KEY = "telegram-channels:last-tab";
export function TelegramChannelsWorkspace() {
  const searchParams = useSearchParams();
  const { pushToast } = useAppToast();
  const [importOpen, setImportOpen] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [messageTemplatesOpen, setMessageTemplatesOpen] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [mtprotoCreateOpen, setMtprotoCreateOpen] = useState(false);
  const [tab, setPersistedTab] = usePersistedRouteTab({
    param: "tab",
    storageKey: TELEGRAM_TAB_STORAGE_KEY,
    allowedValues: TELEGRAM_CHANNEL_TAB_OPTIONS.all,
    defaultValue: "channels",
  });
  const channelFilter = parseChannelFilter(searchParams.get("channelTab"));
  const lifecycleTab = parseChannelLifecycleTab(searchParams.get("lifecycle"));
  const accountFilter = parseAccountFilter(searchParams.get("accountTab"));
  const [deleting, setDeleting] = useState<TelegramChannel | null>(null);
  const [deletingPerson, setDeletingPerson] =
    useState<AdvertisingChannel | null>(null);
  const [networkFormOpen, setNetworkFormOpen] = useState(false);
  const [editingNetwork, setEditingNetwork] =
    useState<TelegramChannelNetwork | null>(null);
  const [deletingNetwork, setDeletingNetwork] =
    useState<TelegramChannelNetwork | null>(null);
  const [analysisEditor, setAnalysisEditor] = useState<{
    channel: TelegramChannel;
    analysis?: TelegramChannelAdAnalysis;
  } | null>(null);
  const [syncTargetChannel, setSyncTargetChannel] =
    useState<TelegramChannel | null>(null);
  const [syncSelection, setSyncSelection] =
    useState<TelegramChannelSyncSelection>(DEFAULT_CHANNEL_SYNC_SELECTION);
  const [syncPostLimit, setSyncPostLimit] = useState(50);
  const [workspaceSyncOpen, setWorkspaceSyncOpen] = useState(false);
  const [deletingAnalysis, setDeletingAnalysis] = useState<{
    channel: TelegramChannel;
    analysis: TelegramChannelAdAnalysis;
  } | null>(null);
  const updateTabs = (next: {
    tab?: TelegramTab;
    channelFilter?: ChannelFilter;
    lifecycle?: ChannelLifecycleTab;
    accountFilter?: AccountFilter;
  }) => {
    const nextTab = next.tab || tab;
    setPersistedTab(nextTab, (params) => {
      if (next.channelFilter) params.set("channelTab", next.channelFilter);
      if (next.lifecycle) params.set("lifecycle", next.lifecycle);
      if (next.accountFilter) params.set("accountTab", next.accountFilter);
    });
  };

  const {
    channels,
    channelCounts,
    channelsLoading,
    channelsError,
    networks,
    networksLoading,
    networksError,
    currencySettings,
    rates,
    people,
    peopleLoading,
    peopleError,
  } = useTelegramChannelsWorkspaceReads({
    tab,
    lifecycleTab,
    channelFilter,
    accountFilter,
    networkFormOpen,
    editingNetwork,
    messageTemplatesOpen,
    exportOpen,
  });
  const {
    importMutation,
    saveAnalysisMutation,
    deleteAnalysisMutation,
    deleteMutation,
    archiveMutation,
    restoreMutation,
    moveToTestMutation,
    moveToActiveMutation,
    deletePersonMutation,
    createNetworkMutation,
    updateNetworkMutation,
    deleteNetworkMutation,
    syncNowMutation,
  } = useTelegramChannelsWorkspaceMutations({
    setImportOpen,
    setAnalysisEditor,
    setDeletingAnalysis,
    setDeleting,
    setDeletingPerson,
    setNetworkFormOpen,
    setEditingNetwork,
    setDeletingNetwork,
    setSyncTargetChannel,
    updateTabs,
  });
  const filteredChannels = useMemo(
    () => sortChannelsByScale(channels || []),
    [channels],
  );
  const ownChannels = useMemo(
    () => (channels || []).filter(isOwnChannel),
    [channels],
  );
  const hasLoadedChannels = Boolean(channels?.[0]);
  const hasLoadedPeople = Boolean(people?.[0]);
  const channelsInitialLoading = channelsLoading && !hasLoadedChannels;
  const channelsInitialError = Boolean(channelsError) && !hasLoadedChannels;
  const peopleInitialLoading = peopleLoading && !hasLoadedPeople;
  const peopleInitialError = Boolean(peopleError) && !hasLoadedPeople;
  const emptyText =
    channelFilter === "own" ? "No own channels" : "No external channels";
  const handleExport = async (selection: TelegramChannelExportSelection) => {
    const { channelIds, sections } = selection;
    const selectedChannels = (channels || []).filter((channel) =>
      channelIds.includes(channel.id),
    );
    if (!selectedChannels.length) {
      pushToast("Select at least one channel.", "error");
      return;
    }
    setExporting(true);
    try {
      for (const channel of selectedChannels) {
        const blob = await telegramChannelsApi.export(channel.id, sections);
        const baseName = safeTelegramChannelExportName(
          channel.username || channel.title,
        );
        downloadTelegramChannelExport(
          blob,
          `${baseName}_export_${new Date().toISOString().slice(0, 10)}.xlsx`,
        );
      }
      setExportOpen(false);
      pushToast(
        selectedChannels.length === 1
          ? "Export downloaded."
          : `Downloaded ${selectedChannels.length} export files.`,
        "success",
      );
    } catch (requestError) {
      pushToast(requestErrorMessage(requestError, "Export failed."), "error");
    } finally {
      setExporting(false);
    }
  };
  const headerAction = (
    <TelegramChannelsHeaderActions
      tab={tab}
      accountFilter={accountFilter}
      hasChannels={Boolean(channels?.length)}
      onCreateNetwork={() => {
        setEditingNetwork(null);
        setNetworkFormOpen(true);
      }}
      onConnectAccount={() => setMtprotoCreateOpen(true)}
      onOpenTemplates={() => setMessageTemplatesOpen(true)}
      onSyncAll={() => setWorkspaceSyncOpen(true)}
      onExport={() => setExportOpen(true)}
      onImport={() => setImportOpen(true)}
    />
  );
  return (
    <AppShell>
      <PageHeader
        title="Telegram"
        subtitle="Channels, networks and Telegram accounts"
        action={headerAction}
      />
      <div className="mb-5 inline-flex rounded-lg border border-neutral-700 bg-neutral-900 p-1">
        {TELEGRAM_CHANNEL_TAB_OPTIONS.primary.map((item) => (
          <button
            key={item}
            type="button"
            className={`rounded-md px-4 py-2 text-sm ${tab === item ? "bg-blue-600 text-white" : "text-neutral-300 hover:bg-neutral-800"}`}
            onClick={() => updateTabs({ tab: item })}
          >
            {TELEGRAM_CHANNEL_TAB_LABELS[item]}
          </button>
        ))}
      </div>
      {tab === "channels" ? (
        <>
          <div className="mb-5 flex gap-1 border-b border-neutral-800">
            {(["own", "external"] as ChannelFilter[]).map((item) => (
              <button
                key={item}
                type="button"
                className={`border-b-2 px-3 py-2 text-sm ${channelFilter === item ? "border-blue-500 text-white" : "border-transparent text-neutral-400 hover:text-white"}`}
                onClick={() =>
                  updateTabs({ tab: "channels", channelFilter: item })
                }
              >
                {item === "own" ? "Our channels" : "External channels"}
              </button>
            ))}
          </div>
          {channelFilter === "own" ? (
            <div className="mb-3 flex gap-1 border-b border-neutral-800">
              {(["active", "test", "archive"] as ChannelLifecycleTab[]).map(
                (item) => (
                  <button
                    key={item}
                    type="button"
                    className={`border-b-2 px-3 py-2 text-sm ${lifecycleTab === item ? "border-blue-500 text-white" : "border-transparent text-neutral-400 hover:text-white"}`}
                    onClick={() =>
                      updateTabs({ tab: "channels", lifecycle: item })
                    }
                  >
                    {item === "active"
                      ? `Active (${channelCounts?.active ?? 0})`
                      : item === "test"
                        ? `For Test (${channelCounts?.test ?? 0})`
                        : `Archive (${channelCounts?.archived ?? 0})`}
                  </button>
                ),
              )}
            </div>
          ) : null}
          {channelsInitialLoading ? <LoadingState /> : null}
          {channelsInitialError ? (
            <div className="text-red-300">Failed to load channels</div>
          ) : null}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {filteredChannels.map((channel: TelegramChannel) => (
              <TelegramChannelCatalogCard
                key={channel.id}
                channel={channel}
                currencySettings={currencySettings}
                onRestore={(channelId) => restoreMutation.mutate(channelId)}
                onArchive={(channelId) => archiveMutation.mutate(channelId)}
                onMoveToTest={(channelId) =>
                  moveToTestMutation.mutate(channelId)
                }
                onMoveToActive={(channelId) =>
                  moveToActiveMutation.mutate(channelId)
                }
                onDelete={setDeleting}
                onSync={(target) => {
                  setSyncTargetChannel(target);
                  setSyncSelection(syncSelectionFromChannel(target));
                  setSyncPostLimit(target.postSyncLimit ?? 50);
                }}
                onRefreshPublicData={(username) =>
                  importMutation.mutate({
                    input: `@${username}`,
                    mode: "refresh",
                  })
                }
                onEditAnalysis={(target, analysis) =>
                  setAnalysisEditor({ channel: target, analysis })
                }
                onDeleteAnalysis={(target, analysis) =>
                  setDeletingAnalysis({ channel: target, analysis })
                }
              />
            ))}
          </div>
          {!channelsInitialLoading &&
          !channelsInitialError &&
          !filteredChannels.length ? (
            <EmptyState text={emptyText} />
          ) : null}
        </>
      ) : tab === "networks" ? (
        <TelegramNetworksSection
          networks={networks}
          loading={networksLoading}
          error={networksError}
          moneySettings={currencySettings}
          rates={rates}
          onEdit={(network) => {
            setEditingNetwork(network);
            setNetworkFormOpen(true);
          }}
          onDelete={setDeletingNetwork}
        />
      ) : tab === "accounts" ? (
        <>
          <div className="mb-5 flex gap-1 border-b border-neutral-800">
            {(["mtproto", "people"] as AccountFilter[]).map((item) => (
              <button
                key={item}
                type="button"
                className={`border-b-2 px-3 py-2 text-sm ${accountFilter === item ? "border-blue-500 text-white" : "border-transparent text-neutral-400 hover:text-white"}`}
                onClick={() =>
                  updateTabs({ tab: "accounts", accountFilter: item })
                }
              >
                {item === "mtproto" ? "MTProto" : "People"}
              </button>
            ))}
          </div>
          {accountFilter === "mtproto" ? (
            <MtprotoAccountsPanel
              createOpen={mtprotoCreateOpen}
              onCreateClose={() => setMtprotoCreateOpen(false)}
            />
          ) : null}
          {accountFilter === "people" ? (
            <>
              {peopleInitialLoading ? <LoadingState /> : null}
              {peopleInitialError ? (
                <div className="text-red-300">Failed to load people</div>
              ) : null}
              <TelegramPeopleCards
                people={people || []}
                onDelete={(person) =>
                  setDeletingPerson(person as AdvertisingChannel)
                }
              />
              {!peopleInitialLoading &&
              !peopleInitialError &&
              !(people || []).length ? (
                <EmptyState text="No people" />
              ) : null}
            </>
          ) : null}
        </>
      ) : null}
      <ImportChannelModal
        open={importOpen}
        onClose={() => setImportOpen(false)}
        onSubmit={(input) => importMutation.mutate({ input, mode: "import" })}
        isSubmitting={importMutation.isPending}
      />
      {exportOpen ? (
        <TelegramChannelExportModal
          open={exportOpen}
          channels={channels || []}
          networks={networks}
          defaultChannelIds={filteredChannels.map((channel) => channel.id)}
          isSubmitting={exporting}
          onClose={() => setExportOpen(false)}
          onSubmit={handleExport}
        />
      ) : null}
      {messageTemplatesOpen ? (
        <TelegramChannelMessageTemplatesModal
          channels={channels || []}
          networks={networks}
          onClose={() => setMessageTemplatesOpen(false)}
        />
      ) : null}
      <ChannelSyncScopeModal
        open={!!syncTargetChannel}
        title={
          syncTargetChannel ? `Sync ${syncTargetChannel.title}` : "Sync channel"
        }
        description="Choose what to sync for this channel."
        helperText="Sync selected saves this scope to the channel. Sync all runs the full sync without changing the saved scope."
        selection={syncSelection}
        postLimit={syncPostLimit}
        isSyncing={syncNowMutation.isPending}
        submitLabel="Sync selected"
        onClose={() => setSyncTargetChannel(null)}
        onSelectionChange={setSyncSelection}
        onPostLimitChange={setSyncPostLimit}
        onSyncAll={() =>
          syncTargetChannel
            ? syncNowMutation.mutate({
                channel: syncTargetChannel,
                payload: {
                  ...DEFAULT_CHANNEL_SYNC_SELECTION,
                  postLimit: syncPostLimit,
                },
              })
            : undefined
        }
        onSubmit={() =>
          syncTargetChannel
            ? syncNowMutation.mutate({
                channel: syncTargetChannel,
                payload: {
                  ...syncSelection,
                  postLimit: syncPostLimit,
                  saveSelection: true,
                },
              })
            : undefined
        }
      />
      <WorkspaceChannelSyncModal
        open={workspaceSyncOpen}
        onClose={() => setWorkspaceSyncOpen(false)}
      />
      <ConfirmDeleteModal
        open={!!deleting}
        entityName={deleting?.title ?? ""}
        description="This deletes the channel and related campaigns, promos, invite links, and stats."
        onClose={() => setDeleting(null)}
        onConfirm={() =>
          deleting ? deleteMutation.mutateAsync(deleting.id) : undefined
        }
        label="Delete"
      />
      <ConfirmDeleteModal
        open={!!deletingPerson}
        entityName={deletingPerson?.title ?? ""}
        description="This deletes the person from advertising sources."
        onClose={() => setDeletingPerson(null)}
        onConfirm={() =>
          deletingPerson
            ? deletePersonMutation.mutateAsync(deletingPerson.id)
            : undefined
        }
        label="Delete"
      />
      <NetworkFormModal
        open={networkFormOpen}
        network={editingNetwork}
        channels={ownChannels}
        isSubmitting={
          createNetworkMutation.isPending || updateNetworkMutation.isPending
        }
        onClose={() => {
          setNetworkFormOpen(false);
          setEditingNetwork(null);
        }}
        onSubmit={(payload) => {
          if (editingNetwork) {
            const networkId = editingNetwork.id;
            setNetworkFormOpen(false);
            setEditingNetwork(null);
            updateNetworkMutation.mutate({ id: networkId, payload });
          } else {
            setNetworkFormOpen(false);
            createNetworkMutation.mutate({
              name: payload.name!,
              description: payload.description,
              iconId: payload.iconId,
              telegramChannelIds: payload.telegramChannelIds!,
            });
          }
        }}
      />
      <ConfirmDeleteModal
        open={!!deletingNetwork}
        entityName={deletingNetwork?.name ?? ""}
        description="This deletes only the network. Telegram channels remain untouched."
        onClose={() => setDeletingNetwork(null)}
        onConfirm={() =>
          deletingNetwork
            ? deleteNetworkMutation.mutateAsync(deletingNetwork.id)
            : undefined
        }
        label="Delete"
      />
      <AdAnalysisModal
        open={!!analysisEditor}
        channel={analysisEditor?.channel}
        analysis={analysisEditor?.analysis}
        currencies={currencySettings?.supportedCurrencies ?? []}
        isSubmitting={saveAnalysisMutation.isPending}
        onClose={() => setAnalysisEditor(null)}
        onSubmit={(payload) => {
          if (!analysisEditor) return;
          saveAnalysisMutation.mutate({
            channelId: analysisEditor.channel.id,
            analysisId: analysisEditor.analysis?.id,
            payload,
          });
        }}
      />
      <ConfirmDeleteModal
        open={!!deletingAnalysis}
        entityName={deletingAnalysis?.channel.title ?? ""}
        description="This deletes only this ad analysis. The Telegram channel and its data remain untouched."
        onClose={() => setDeletingAnalysis(null)}
        onConfirm={() => {
          if (!deletingAnalysis) return;
          return deleteAnalysisMutation.mutateAsync({
            channelId: deletingAnalysis.channel.id,
            analysisId: deletingAnalysis.analysis.id,
          });
        }}
        label="Delete analysis"
      />
    </AppShell>
  );
}
