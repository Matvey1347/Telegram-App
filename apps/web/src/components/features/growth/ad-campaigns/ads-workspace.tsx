"use client";

import type { ReactNode } from "react";
import { useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { AdCampaignsTable } from "@/components/features/growth/ad-campaigns/campaigns-table";
import { CampaignsTableSkeleton } from "@/components/features/growth/ad-campaigns/campaigns-table-skeleton";
import { AdsFiltersPanel } from "@/components/features/growth/ad-campaigns/ads-filters-panel";
import { AdsFilterSurface, useAdsFilterPresentation } from "@/components/features/growth/ad-campaigns/ads-filter-presentation";
import { useAdsChannelScopeState } from "@/components/features/growth/ad-campaigns/ads-channel-scope-filter";
import { PromoPreviewModal } from "@/components/features/growth/ad-campaigns/promo-preview-modal";
import { PromoFormModal } from "@/components/features/growth/ad-campaigns/promo-form-modal";
import { usePromoDeepLink } from "@/components/features/growth/ad-campaigns/use-promo-deep-link";
import { type AdCampaignSort } from "@/components/features/growth/ad-campaigns/ad-campaign-sort-menu";
import { AppShell } from "@/components/layout/app-shell";
import { adCampaignsApi, adHypothesesApi, promosApi, type AdHypothesis, type Promo } from "@/lib/api";
import { adCampaignKeys, telegramChannelKeys } from "@/lib/query-keys";
import { useAdCampaignMutations } from "@/components/features/growth/ad-campaigns/use-ad-campaign-mutations";
import { useCampaignInviteLinkRefresh } from "@/components/features/growth/ad-campaigns/use-campaign-invite-link-refresh";
import { Button, ConfirmDeleteModal, EmptyState, PageHeader } from "@/components/ui/primitives";
import { useAppToast } from "@/providers/toast-provider";
import { useI18n } from "@/providers/i18n-provider";
import type { TranslationKey } from "@/i18n/catalog";
import { Archive, CheckCircle2 } from "lucide-react";
import { type AdCampaignsViewMode } from "@/components/features/growth/ad-campaigns/ad-campaign-route-state";
import { Pagination, THREE_COLUMN_GRID_PAGE_SIZES } from "@/components/ui/pagination";
import { usePagination } from "@/hooks/use-pagination";
import { adsSectionHeader } from "@/components/features/growth/ad-campaigns/ads-section-header";
import { HypothesisFormModal } from "@/components/features/growth/ad-campaigns/hypothesis-form-modal";
import { CampaignModal } from "@/components/features/growth/ad-campaigns/campaign-form-modal";
import { useAdsWorkspaceReads } from "./use-ads-workspace-reads";
import { AdsHeaderActions } from "./ads-header-actions";
import { PromosSection } from "./ads-workspace-promos";
import { CampaignSelectRow, HypothesesSection, HypothesisCampaignsModal, HypothesisInviteLinkHistoryModal } from "./ads-workspace-hypotheses";

function isOwnTelegramChannel(channel: any) {
  return Array.isArray(channel?.adminLinks) && channel.adminLinks.length > 0;
}
export function AdCampaignsPage({
  sectionTabs,
  topSection,
  filtersOpen, filterPresentation,
}: {
  sectionTabs: ReactNode;
  topSection: "campaigns" | "hypotheses" | "promo";
  filtersOpen: boolean; filterPresentation: ReturnType<typeof useAdsFilterPresentation>;
}) {
  const { t } = useI18n();
  const qc = useQueryClient();
  const searchParams = useSearchParams();
  const { pushToast, startOperation } = useAppToast();
  const [createOpen, setCreateOpen] = useState(false);
  const [editing, setEditing] = useState<any | null>(null);
  const [editingCampaignLoading, setEditingCampaignLoading] = useState(false);
  const editingCampaignRequest = useRef(0);
  const [deleting, setDeleting] = useState<any | null>(null);
  const [channelScopeFilter, setChannelScopeFilter] = useState("");
  const channelScopeState = useAdsChannelScopeState();
  const [showArchivedPromos, setShowArchivedPromos] = useState(false);
  const viewMode: AdCampaignsViewMode =
    topSection === "promo"
      ? "promos"
      : topSection === "hypotheses"
        ? "hypotheses"
        : "campaigns";
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<AdCampaignSort>("date_desc");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [hypothesisFormOpen, setHypothesisFormOpen] = useState(false);
  const [editingHypothesis, setEditingHypothesis] =
    useState<AdHypothesis | null>(null);
  const [editingHypothesisLoading, setEditingHypothesisLoading] =
    useState(false);
  const editingHypothesisRequest = useRef(0);
  const [deletingHypothesis, setDeletingHypothesis] =
    useState<AdHypothesis | null>(null);
  const [previewHypothesis, setPreviewHypothesis] =
    useState<AdHypothesis | null>(null);
  const [historyHypothesis, setHistoryHypothesis] =
    useState<AdHypothesis | null>(null);
  const [promoFormOpen, setPromoFormOpen] = useState(false);
  const [editingPromo, setEditingPromo] = useState<Promo | null>(null);
  const [deletingPromo, setDeletingPromo] = useState<Promo | null>(null);
  const [previewPromo, setPreviewPromo] = useState<Promo | null>(null);
  const deferredSearch = useDeferredValue(search.trim());
  const campaignsPagination = usePagination({ initialPageSize: 5 });
  const hypothesesPagination = usePagination({ initialPageSize: 50 });
  const promosPagination = usePagination({ initialPageSize: 48 });

  const { moneySettings, rates, channels, channelNetworks, data, isLoading, isFetching, error, hypothesesPage, hypothesesLoading, hypothesesError, promosPage, promosLoading, promosFetching, promosError, hypotheses, promos } = useAdsWorkspaceReads({
    viewMode, createOpen, editing, hypothesisFormOpen,
    campaignsPagination, hypothesesPagination, promosPagination,
    deferredSearch, channelScopeFilter, showArchivedPromos, dateFrom, dateTo, sort,
  });
const requestedPromoId = searchParams.get("promoId") || "";
  const promoDeepLink = usePromoDeepLink(
    requestedPromoId,
    viewMode === "promos",
  );

  useEffect(() => {
    if (viewMode !== "promos" || !requestedPromoId) return;
    const requestedPromo = promoDeepLink.data;
    if (!requestedPromo) return;
    setEditingPromo((current) =>
      current?.id === requestedPromo.id ? current : requestedPromo,
    );
    setPromoFormOpen(true);
  }, [promoDeepLink.data, requestedPromoId, viewMode]);

  const { createMutation, updateMutation, deleteMutation } =
    useAdCampaignMutations();
  const excludeMutation = useMutation({
    mutationFn: ({
      id,
      excludeFromAnalytics,
    }: {
      id: string;
      excludeFromAnalytics: boolean;
    }) => adCampaignsApi.updateAnalyticsInput(id, { excludeFromAnalytics }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["ad-campaigns"] });
    },
    onError: (error) =>
      pushToast(
        getErrorMessage(error, "Failed to update analytics flag."),
        "error",
      ),
  });
  const campaignInviteLinkRefresh = useCampaignInviteLinkRefresh();
  const createHypothesisMutation = useMutation({
    mutationFn: adHypothesesApi.create,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["ad-hypotheses"] });
      qc.invalidateQueries({ queryKey: ["ad-campaigns"] });
    },
  });
  const updateHypothesisMutation = useMutation({
    mutationFn: ({ id, payload }: any) => adHypothesesApi.update(id, payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["ad-hypotheses"] });
      qc.invalidateQueries({ queryKey: ["ad-campaigns"] });
    },
  });
  const deleteHypothesisMutation = useMutation({
    mutationFn: (id: string) => adHypothesesApi.remove(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["ad-hypotheses"] });
      qc.invalidateQueries({ queryKey: ["ad-campaigns"] });
    },
  });
  const excludeHypothesisMutation = useMutation({
    mutationFn: ({
      id,
      excludeFromAnalytics,
    }: {
      id: string;
      excludeFromAnalytics: boolean;
    }) =>
      adHypothesesApi.updateCampaignAnalyticsInput(id, excludeFromAnalytics),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: adCampaignKeys.list() });
      void qc.invalidateQueries({ queryKey: telegramChannelKeys.lists() });
      void qc.invalidateQueries({ queryKey: telegramChannelKeys.cardLists() });
      void qc.invalidateQueries({
        queryKey: telegramChannelKeys.trafficAttributions(),
      });
      qc.invalidateQueries({ queryKey: ["ad-hypotheses"] });
      pushToast(
        "Hypothesis analytics flag updated for all linked campaigns.",
        "success",
      );
    },
    onError: (error) =>
      pushToast(
        getErrorMessage(error, "Failed to update hypothesis analytics flag."),
        "error",
      ),
  });
  const createPromoMutation = useMutation({
    mutationFn: promosApi.create,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["promos"] });
      qc.invalidateQueries({ queryKey: ["channel-promos"] });
    },
  });
  const updatePromoMutation = useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: Partial<Promo> }) =>
      promosApi.update(id, payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["promos"] });
      qc.invalidateQueries({ queryKey: ["channel-promos"] });
    },
  });
  const deletePromoMutation = useMutation({
    mutationFn: (id: string) => promosApi.remove(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["promos"] });
      qc.invalidateQueries({ queryKey: ["channel-promos"] });
    },
  });

  const campaigns = data?.items ?? [];
  const ownTelegramChannels = useMemo(
    () => (channels ?? []).filter(isOwnTelegramChannel),
    [channels],
  );
  const showCampaignsInitialLoading =
    viewMode === "campaigns" && (isLoading || isFetching);
  const showHypothesesInitialLoading = hypothesesLoading && !hypotheses.length;
  const showPromosLoading = promosLoading || promosFetching;
  const visibleCampaigns = campaigns;
  const visibleHypotheses = hypotheses;
  const visiblePromos = promos;
  const sectionHeaderKeys: Record<typeof topSection, { title: TranslationKey; subtitle: TranslationKey; action: TranslationKey }> = {
    campaigns: { title: "ads.campaigns_title", subtitle: "ads.campaigns_subtitle", action: "ads.create_campaign" },
    hypotheses: { title: "ads.hypotheses_title", subtitle: "ads.hypotheses_subtitle", action: "ads.create_hypothesis" },
    promo: { title: "ads.promo_title", subtitle: "ads.promo_subtitle", action: "ads.create_promo" },
  };
  const headerKeys = sectionHeaderKeys[topSection];
  const sectionHeader = {
    ...adsSectionHeader(topSection),
    title: t(headerKeys.title),
    subtitle: t(headerKeys.subtitle),
    actionLabel: t(headerKeys.action),
  };
  const openCreateForCurrentView = () => {
    if (viewMode === "hypotheses") {
      setEditingHypothesis(null);
      setHypothesisFormOpen(true);
      return;
    }
    if (viewMode === "promos") {
      setEditingPromo(null);
      setPromoFormOpen(true);
      return;
    }
    setCreateOpen(true);
  };

  return (
    <AppShell>
      <PageHeader
        title={sectionHeader.title}
        subtitle={sectionHeader.subtitle}
        action={
          <AdsHeaderActions>
            <Button onClick={openCreateForCurrentView}>
              {sectionHeader.actionLabel}
            </Button>
          </AdsHeaderActions>
        }
      />
      {sectionTabs}
      <AdsFilterSurface presentation={filterPresentation} desktopOpen={filtersOpen}>
          <AdsFiltersPanel
            viewMode={viewMode}
            networks={channelNetworks ?? []}
            channels={ownTelegramChannels}
            channelScopeState={channelScopeState}
            onChannelScopeChange={(channelIds) => setChannelScopeFilter(channelIds.join(","))}
            search={search}
            setSearch={setSearch}
            resetPage={() => {
              campaignsPagination.resetPage();
              hypothesesPagination.resetPage();
              promosPagination.resetPage();
            }}
            dateFrom={dateFrom}
            dateTo={dateTo}
            setDateFrom={setDateFrom}
            setDateTo={setDateTo}
            sort={sort}
            setSort={setSort}
          />
      </AdsFilterSurface>

      {showCampaignsInitialLoading ? <CampaignsTableSkeleton /> : null}
      {viewMode === "campaigns" && error ? (
        <div className="mb-4 rounded-lg border border-rose-700 p-3 text-sm text-rose-200">
          Failed to load campaigns.
        </div>
      ) : null}
      {viewMode === "campaigns" &&
      !showCampaignsInitialLoading &&
      visibleCampaigns.length ? (
        <AdCampaignsTable
          campaigns={visibleCampaigns}
          showHypotheses={false}
          moneySettings={moneySettings}
          rates={rates}
          onEdit={async (campaign) => {
            const requestId = ++editingCampaignRequest.current;
            setEditing(campaign);
            setEditingCampaignLoading(true);
            try {
              const detail = await adCampaignsApi.get(campaign.id);
              if (editingCampaignRequest.current === requestId) {
                setEditing(detail);
              }
            } catch (error) {
              if (editingCampaignRequest.current === requestId) {
                setEditing(null);
              }
              pushToast(
                getErrorMessage(error, "Failed to load campaign."),
                "error",
              );
            } finally {
              if (editingCampaignRequest.current === requestId) {
                setEditingCampaignLoading(false);
              }
            }
          }}
          onDelete={setDeleting}
          onToggleExclude={(campaign, excludeFromAnalytics) =>
            excludeMutation.mutate({ id: campaign.id, excludeFromAnalytics })
          }
          onRefreshInviteLinks={(campaign) =>
            campaignInviteLinkRefresh.refreshInviteLinks(campaign)
          }
          refreshingInviteLinkCampaignId={
            campaignInviteLinkRefresh.refreshingCampaignId ?? null
          }
          inviteLinkRefreshProgress={campaignInviteLinkRefresh.progress}
          onOpenPromo={async (promo) => {
            try {
              setPreviewPromo(await promosApi.get(promo.id));
            } catch (error) {
              pushToast(
                getErrorMessage(error, "Failed to load promo."),
                "error",
              );
            }
          }}
        />
      ) : null}
      {viewMode === "campaigns" &&
      !showCampaignsInitialLoading &&
      !error &&
      !visibleCampaigns.length ? (
        <EmptyState text="No campaigns" />
      ) : null}
      {viewMode === "campaigns" && data ? (
        <Pagination
          {...data.pagination}
          pageSizeOptions={[5]}
          onPageChange={campaignsPagination.setPage}
          onPageSizeChange={campaignsPagination.setPageSize}
          loading={isFetching}
        />
      ) : null}

      {viewMode === "hypotheses" ? (
        <HypothesesSection
          hypotheses={visibleHypotheses}
          loading={showHypothesesInitialLoading}
          error={hypothesesError}
          moneySettings={moneySettings}
          rates={rates}
          onEdit={async (hypothesis) => {
            const requestId = ++editingHypothesisRequest.current;
            setEditingHypothesis(hypothesis);
            setHypothesisFormOpen(true);
            setEditingHypothesisLoading(true);
            try {
              const detail = await adHypothesesApi.get(hypothesis.id);
              if (editingHypothesisRequest.current === requestId) {
                setEditingHypothesis(detail);
              }
            } catch (error) {
              if (editingHypothesisRequest.current === requestId) {
                setHypothesisFormOpen(false);
                setEditingHypothesis(null);
              }
              pushToast(
                getErrorMessage(error, "Failed to load hypothesis."),
                "error",
              );
            } finally {
              if (editingHypothesisRequest.current === requestId) {
                setEditingHypothesisLoading(false);
              }
            }
          }}
          onDelete={setDeletingHypothesis}
          onOpenCampaigns={async (hypothesis) => {
            try {
              setPreviewHypothesis(await adHypothesesApi.get(hypothesis.id));
            } catch (error) {
              pushToast(
                getErrorMessage(error, "Failed to load hypothesis."),
                "error",
              );
            }
          }}
          onOpenHistory={setHistoryHypothesis}
          onToggleExclude={(hypothesis, excludeFromAnalytics) =>
            excludeHypothesisMutation.mutate({
              id: hypothesis.id,
              excludeFromAnalytics,
            })
          }
        />
      ) : null}
      {viewMode === "hypotheses" && hypothesesPage ? (
        <Pagination
          {...hypothesesPage.pagination}
          onPageChange={hypothesesPagination.setPage}
          onPageSizeChange={hypothesesPagination.setPageSize}
          loading={hypothesesLoading}
        />
      ) : null}
      {viewMode === "promos" ? (
        <div className="mb-4 flex gap-2" role="tablist" aria-label="Promo archive">
          {([false, true] as const).map((archived) => (
            <button
              key={String(archived)}
              type="button"
              role="tab"
              aria-selected={showArchivedPromos === archived}
              onClick={() => {
                setShowArchivedPromos(archived);
                promosPagination.resetPage();
              }}
              className={`inline-flex shrink-0 items-center gap-2 whitespace-nowrap rounded-lg px-4 py-2 text-sm ${showArchivedPromos === archived ? "bg-blue-600 text-white" : "border border-neutral-700 text-neutral-300"}`}
            >
              <span className="inline-flex shrink-0" aria-hidden="true">
                {archived ? <Archive size={16} /> : <CheckCircle2 size={16} />}
              </span>
              {archived ? "Archive" : "Active"}
            </button>
          ))}
        </div>
      ) : null}
      {viewMode === "promos" ? (
        <PromosSection
          promos={showPromosLoading ? [] : visiblePromos}
          loading={showPromosLoading}
          error={promosError}
          onEdit={async (promo) => {
            try {
              setEditingPromo(await promosApi.get(promo.id));
              setPromoFormOpen(true);
            } catch (error) {
              pushToast(
                getErrorMessage(error, "Failed to load promo."),
                "error",
              );
            }
          }}
          onDelete={setDeletingPromo}
          onToggleArchive={(promo) => {
            void promosApi.setArchived(promo.id, !promo.archivedAt).then(() => {
              void qc.invalidateQueries({ queryKey: ["promos"] });
              void qc.invalidateQueries({ queryKey: ["channel-promos"] });
              pushToast(promo.archivedAt ? "Promo restored." : "Promo archived.", "success");
            }).catch((error) => pushToast(getErrorMessage(error, "Failed to update promo archive."), "error"));
          }}
        />
      ) : null}
      {viewMode === "promos" && promosPage ? (
        <Pagination
          {...promosPage.pagination}
          pageSizeOptions={THREE_COLUMN_GRID_PAGE_SIZES}
          onPageChange={promosPagination.setPage}
          onPageSizeChange={promosPagination.setPageSize}
          loading={promosLoading}
        />
      ) : null}

      <CampaignModal
        open={createOpen}
        title="Create Campaign"
        channels={channels ?? []}
        onClose={() => setCreateOpen(false)}
        onSubmit={async (v: any) => {
          const operation = startOperation({
            id: `campaign-create:${Date.now()}`,
            title: "Processing",
            message: "Creating campaign...",
          });
          try {
            await createMutation.mutateAsync(v);
            operation.succeed({
              title: "Success",
              message: "Campaign created.",
            });
            setCreateOpen(false);
          } catch (error) {
            operation.fail({
              title: "Error",
              message: getErrorMessage(error, "Failed to create campaign."),
            });
            throw error;
          }
        }}
      />
      <CampaignModal
        open={!!editing}
        title="Edit Campaign"
        loading={editingCampaignLoading}
        channels={channels ?? []}
        initial={editing ?? undefined}
        onClose={() => {
          editingCampaignRequest.current += 1;
          setEditingCampaignLoading(false);
          setEditing(null);
        }}
        onSubmit={async (v: any) => {
          if (!editing) return;
          const campaignId = editing.id;
          setEditing(null);
          const operation = startOperation({
            id: `campaign-update:${campaignId}:${Date.now()}`,
            title: "Processing",
            message: "Saving campaign...",
          });
          try {
            await updateMutation.mutateAsync({ id: campaignId, payload: v });
            operation.succeed({
              title: "Success",
              message: "Campaign updated.",
            });
          } catch (error) {
            operation.fail({
              title: "Error",
              message: getErrorMessage(error, "Failed to update campaign."),
            });
          }
        }}
      />
      <PromoFormModal
        open={promoFormOpen}
        title={editingPromo ? "Edit Promo" : "Create Promo"}
        initial={editingPromo ?? undefined}
        onClose={() => {
          setPromoFormOpen(false);
          setEditingPromo(null);
        }}
        onSubmit={async (payload) => {
          const currentPromo = editingPromo;
          const operation = startOperation({
            id: `promo-${currentPromo ? `update:${currentPromo.id}` : "create"}:${Date.now()}`,
            title: "Processing",
            message: currentPromo ? "Saving promo..." : "Creating promo...",
          });
          try {
            if (currentPromo) {
              await updatePromoMutation.mutateAsync({
                id: currentPromo.id,
                payload,
              });
              operation.succeed({
                title: "Success",
                message: "Promo updated.",
              });
            } else {
              await createPromoMutation.mutateAsync(payload);
              operation.succeed({
                title: "Success",
                message: "Promo created.",
              });
            }
            setPromoFormOpen(false);
            setEditingPromo(null);
          } catch (error) {
            operation.fail({
              title: "Error",
              message: getErrorMessage(
                error,
                currentPromo
                  ? "Failed to update promo."
                  : "Failed to create promo.",
              ),
            });
            throw error;
          }
        }}
        channels={ownTelegramChannels}
      />
      <PromoPreviewModal
        promo={previewPromo}
        onClose={() => setPreviewPromo(null)}
      />
      <HypothesisFormModal
        open={hypothesisFormOpen}
        hypothesis={editingHypothesis}
        loading={editingHypothesisLoading}
        channels={ownTelegramChannels}
        renderCampaign={(campaign, checked, onToggle) => (
          <CampaignSelectRow
            campaign={campaign}
            checked={checked}
            moneySettings={moneySettings}
            rates={rates}
            onToggle={onToggle}
          />
        )}
        isSubmitting={
          createHypothesisMutation.isPending ||
          updateHypothesisMutation.isPending
        }
        onClose={() => {
          editingHypothesisRequest.current += 1;
          setEditingHypothesisLoading(false);
          setHypothesisFormOpen(false);
          setEditingHypothesis(null);
        }}
        onSubmit={async (payload) => {
          const currentHypothesis = editingHypothesis;
          const operation = startOperation({
            id: `hypothesis-${currentHypothesis ? `update:${currentHypothesis.id}` : "create"}:${Date.now()}`,
            title: "Processing",
            message: currentHypothesis
              ? "Saving hypothesis..."
              : "Creating hypothesis...",
          });
          try {
            if (currentHypothesis) {
              await updateHypothesisMutation.mutateAsync({
                id: currentHypothesis.id,
                payload,
              });
              operation.succeed({
                title: "Success",
                message: "Hypothesis updated.",
              });
            } else {
              await createHypothesisMutation.mutateAsync(payload);
              operation.succeed({
                title: "Success",
                message: "Hypothesis created.",
              });
            }
            setHypothesisFormOpen(false);
            setEditingHypothesis(null);
          } catch (error) {
            operation.fail({
              title: "Error",
              message: getErrorMessage(
                error,
                currentHypothesis
                  ? "Failed to update hypothesis."
                  : "Failed to create hypothesis.",
              ),
            });
            throw error;
          }
        }}
      />
      <HypothesisCampaignsModal
        hypothesis={previewHypothesis}
        moneySettings={moneySettings}
        rates={rates}
        onClose={() => setPreviewHypothesis(null)}
      />
      <HypothesisInviteLinkHistoryModal
        hypothesis={historyHypothesis}
        onClose={() => setHistoryHypothesis(null)}
      />
      <ConfirmDeleteModal
        open={!!deleting}
        entityName={deleting?.title ?? "campaign"}
        onClose={() => setDeleting(null)}
        onConfirm={async () => {
          if (!deleting) return;
          const deletingId = deleting.id;
          setDeleting(null);
          const operation = startOperation({
            id: `campaign-delete:${deletingId}:${Date.now()}`,
            title: "Processing",
            message: "Deleting campaign...",
          });
          try {
            await deleteMutation.mutateAsync(deletingId);
            operation.succeed({
              title: "Success",
              message: "Campaign deleted.",
            });
          } catch (error) {
            operation.fail({
              title: "Error",
              message: getErrorMessage(error, "Failed to delete campaign."),
            });
          }
        }}
        label="Delete"
      />
      <ConfirmDeleteModal
        open={!!deletingHypothesis}
        entityName={deletingHypothesis?.name ?? "hypothesis"}
        description="This deletes only the hypothesis. Campaigns remain untouched."
        onClose={() => setDeletingHypothesis(null)}
        onConfirm={async () => {
          if (!deletingHypothesis) return;
          const hypothesisId = deletingHypothesis.id;
          setDeletingHypothesis(null);
          const operation = startOperation({
            id: `hypothesis-delete:${hypothesisId}:${Date.now()}`,
            title: "Processing",
            message: "Deleting hypothesis...",
          });
          try {
            await deleteHypothesisMutation.mutateAsync(hypothesisId);
            operation.succeed({
              title: "Success",
              message: "Hypothesis deleted.",
            });
          } catch (error) {
            operation.fail({
              title: "Error",
              message: getErrorMessage(error, "Failed to delete hypothesis."),
            });
          }
        }}
        label="Delete"
      />
      <ConfirmDeleteModal
        open={!!deletingPromo}
        entityName={deletingPromo?.title ?? "promo"}
        onClose={() => setDeletingPromo(null)}
        onConfirm={async () => {
          if (!deletingPromo) return;
          const promoId = deletingPromo.id;
          setDeletingPromo(null);
          const operation = startOperation({
            id: `promo-delete:${promoId}:${Date.now()}`,
            title: "Processing",
            message: "Deleting promo...",
          });
          try {
            await deletePromoMutation.mutateAsync(promoId);
            operation.succeed({ title: "Success", message: "Promo deleted." });
          } catch (error) {
            operation.fail({
              title: "Error",
              message: getErrorMessage(error, "Failed to delete promo."),
            });
          }
        }}
        label="Delete"
      />
    </AppShell>
  );
}
function getErrorMessage(error: unknown, fallback: string) {
  const responseMessage = (error as any)?.response?.data?.message;
  if (Array.isArray(responseMessage)) return responseMessage.join(", ");
  if (typeof responseMessage === "string" && responseMessage.trim())
    return responseMessage;
  return fallback;
}
