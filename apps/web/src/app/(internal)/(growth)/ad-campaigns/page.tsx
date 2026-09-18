"use client";

import type { MouseEventHandler, ReactNode } from "react";
import { useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { resolveTitleTemplate } from "@telegram-system/shared";
import { AdCampaignsTable } from "@/components/features/growth/ad-campaigns/campaigns-table";
import { AdHypothesisAvatar } from "@/components/features/growth/ad-campaigns/ad-hypothesis-avatar";
import { AdHypothesisRowActions } from "@/components/features/growth/ad-campaigns/ad-hypothesis-row-actions";
import { PromoPreviewModal } from "@/components/features/growth/ad-campaigns/promo-preview-modal";
import { PromoFormModal } from "@/components/features/growth/ad-campaigns/promo-form-modal";
import { usePromoDeepLink } from "@/components/features/growth/ad-campaigns/use-promo-deep-link";
import {
  AdCampaignSortMenu,
  type AdCampaignSort,
} from "@/components/features/growth/ad-campaigns/ad-campaign-sort-menu";
import { IconAvatar } from "@/components/icons/icon-avatar";
import { AppShell } from "@/components/layout/app-shell";
import { InviteLinkHistoryPanel } from "@/components/features/telegram/telegram/invite-link-history-panel";
import { InviteLinkPreviewModal } from "@/components/features/telegram/telegram/invite-link-preview-modal";
import {
  adCampaignsApi,
  adHypothesesApi,
  promosApi,
  telegramChannelNetworksApi,
  telegramChannelsApi,
  workspacesApi,
  type AdCampaign,
  type AdCampaignKpiStatus,
  type AdHypothesis,
  type Promo,
  type TelegramChannel,
  type TelegramInviteLink,
} from "@/lib/api";
import { currenciesApi } from "@/lib/api";
import { adCampaignKeys, telegramChannelKeys } from "@/lib/query-keys";
import { MoneyStack } from "@/components/ui/money-stack";
import { useAdCampaignMutations } from "@/components/features/growth/ad-campaigns/use-ad-campaign-mutations";
import {
  Button,
  Card,
  ConfirmDeleteModal,
  DateRangeInput,
  EmptyState,
  FormField,
  Input,
  LoadingState,
  MasonryGrid,
  Modal,
  PageHeader,
} from "@/components/ui/primitives";
import { useAppToast } from "@/providers/toast-provider";
import { CircleHelp, EyeOff, Pencil, Trash2 } from "lucide-react";
import { NativeMoney } from "@/components/ui/native-money";
import {
  toAdCampaignInputDate as toInputDate,
  type AdCampaignsViewMode,
} from "@/components/features/growth/ad-campaigns/ad-campaign-route-state";
import {
  Pagination,
  THREE_COLUMN_GRID_PAGE_SIZES,
} from "@/components/ui/pagination";
import { usePagination } from "@/hooks/use-pagination";
import {
  AdsSectionTabs,
  resolveAdsSection,
  type AdsSection,
} from "@/components/features/growth/ad-campaigns/ads-section-tabs";
import { MutualPromotionFoldersPage } from "@/components/features/growth/ad-campaigns/mutual-promotion/mutual-promotion-folders-page";
import {
  CrossPromotionPlansPage,
  MutualPromotionModeTabs,
} from "@/components/features/growth/ad-campaigns/cross-promotion-plans-page";
import { adsSectionHeader } from "@/components/features/growth/ad-campaigns/ads-section-header";
import { PromoCard } from "@/components/features/growth/ad-campaigns/promo-card";
import { HypothesisFormModal } from "@/components/features/growth/ad-campaigns/hypothesis-form-modal";
import { CampaignModal } from "@/components/features/growth/ad-campaigns/campaign-form-modal";
import { AdsChannelScopeFilter } from "@/components/features/growth/ad-campaigns/ads-channel-scope-filter";
import {
  CardActionsMenu,
  CardMenuAction,
} from "@/components/ui/card-actions-menu";

function isOwnTelegramChannel(channel: any) {
  return Array.isArray(channel?.adminLinks) && channel.adminLinks.length > 0;
}

export default function AdsPage() {
  const searchParams = useSearchParams();
  const requestedSection = searchParams.get("section");
  const legacyView = searchParams.get("view");
  const section: AdsSection = resolveAdsSection(requestedSection, legacyView);
  const sectionTabs = <AdsSectionTabs value={section} />;
  const mutualMode =
    searchParams.get("mode") === "folders" ? "folders" : "direct";
  return section === "mutual-promotion" && mutualMode === "folders" ? (
    <MutualPromotionFoldersPage
      sectionTabs={
        <>
          {sectionTabs}
          <MutualPromotionModeTabs mode="folders" />
        </>
      }
    />
  ) : section === "mutual-promotion" ? (
    <CrossPromotionPlansPage
      kind="DIRECT_MUTUAL"
      sectionTabs={sectionTabs}
      mutualModeTabs={<MutualPromotionModeTabs mode="direct" />}
    />
  ) : section === "own-promotion" ? (
    <CrossPromotionPlansPage kind="OWN_CHANNELS" sectionTabs={sectionTabs} />
  ) : (
    <AdCampaignsPage sectionTabs={sectionTabs} topSection={section} />
  );
}

function AdCampaignsPage({
  sectionTabs,
  topSection,
}: {
  sectionTabs: ReactNode;
  topSection: "campaigns" | "hypotheses" | "promo";
}) {
  const qc = useQueryClient();
  const searchParams = useSearchParams();
  const { pushToast, startOperation } = useAppToast();
  const [createOpen, setCreateOpen] = useState(false);
  const [editing, setEditing] = useState<any | null>(null);
  const [editingCampaignLoading, setEditingCampaignLoading] = useState(false);
  const editingCampaignRequest = useRef(0);
  const [deleting, setDeleting] = useState<any | null>(null);
  const [channelScopeFilter, setChannelScopeFilter] = useState("");
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

  const financialViewVisible =
    viewMode !== "promos" ||
    createOpen ||
    Boolean(editing) ||
    hypothesisFormOpen;
  const { data: workspace } = useQuery({
    queryKey: ["workspace-selected"],
    queryFn: workspacesApi.selected,
    enabled: financialViewVisible,
  });
  const { data: currencySettings } = useQuery({
    queryKey: ["currency-settings"],
    queryFn: currenciesApi.getSettings,
    enabled: financialViewVisible,
  });
  const { data: rates } = useQuery({
    queryKey: ["currency-rates-latest"],
    queryFn: currenciesApi.listLatestRates,
    enabled: financialViewVisible,
  });
  const moneySettings = currencySettings ?? {
    primaryCurrency: workspace?.primaryCurrency || "",
    secondaryCurrency: workspace?.secondaryCurrency || "",
    currencyDisplayMode: workspace?.currencyDisplayMode || "code",
  };
  const { data: channels } = useQuery({
    queryKey: telegramChannelKeys.select(),
    queryFn: () => telegramChannelsApi.select(),
  });
  const { data: channelNetworks } = useQuery({
    queryKey: ["telegram-channel-networks"],
    queryFn: telegramChannelNetworksApi.list,
    staleTime: 60_000,
  });
  const { data, isLoading, error } = useQuery({
    queryKey: [
      "ad-campaigns",
      "list",
      {
        viewMode,
        page: campaignsPagination.page,
        pageSize: campaignsPagination.pageSize,
        search: deferredSearch,
        channelScopeFilter,
        dateFrom,
        dateTo,
        sort,
      },
    ],
    queryFn: () =>
      adCampaignsApi.listPage({
        page: campaignsPagination.page,
        pageSize: campaignsPagination.pageSize,
        search: deferredSearch || undefined,
        telegramChannelIds: channelScopeFilter || undefined,
        dateFrom: dateFrom || undefined,
        dateTo: dateTo || undefined,
        sort,
      }),
    enabled: viewMode === "campaigns",
  });
  const { data: performance } = useQuery({
    queryKey: ["ad-campaigns-performance", channelScopeFilter],
    queryFn: () =>
      adCampaignsApi.performanceSummary(
        channelScopeFilter
          ? { telegramChannelIds: channelScopeFilter }
          : undefined,
      ),
    enabled: viewMode === "campaigns",
  });
  const {
    data: hypothesesPage,
    isLoading: hypothesesLoading,
    error: hypothesesError,
  } = useQuery({
    queryKey: [
      "ad-hypotheses",
      "list",
      {
        viewMode,
        page: hypothesesPagination.page,
        pageSize: hypothesesPagination.pageSize,
        search: deferredSearch,
        channelScopeFilter,
      },
    ],
    queryFn: () =>
      adHypothesesApi.listPage({
        page: hypothesesPagination.page,
        pageSize: hypothesesPagination.pageSize,
        search: deferredSearch || undefined,
        telegramChannelIds: channelScopeFilter || undefined,
      }),
    enabled: viewMode === "hypotheses",
    placeholderData: keepPreviousData,
  });
  const {
    data: promosPage,
    isLoading: promosLoading,
    error: promosError,
  } = useQuery({
    queryKey: [
      "promos",
      "list",
      {
        viewMode,
        page: promosPagination.page,
        pageSize: promosPagination.pageSize,
        search: deferredSearch,
        channelScopeFilter,
      },
    ],
    queryFn: () =>
      promosApi.listPage({
        page: promosPagination.page,
        pageSize: promosPagination.pageSize,
        search: deferredSearch || undefined,
        telegramChannelIds: channelScopeFilter || undefined,
      }),
    enabled: viewMode === "promos",
    placeholderData: keepPreviousData,
  });

  const hypotheses = hypothesesPage?.items ?? [];
  const promos = promosPage?.items ?? [];
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
      qc.invalidateQueries({ queryKey: ["ad-campaigns-performance"] });
    },
    onError: (error) =>
      pushToast(
        getErrorMessage(error, "Failed to update analytics flag."),
        "error",
      ),
  });
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
      void qc.invalidateQueries({
        queryKey: telegramChannelKeys.trafficAttributions(),
      });
      qc.invalidateQueries({ queryKey: ["ad-hypotheses"] });
      qc.invalidateQueries({ queryKey: ["ad-campaigns-performance"] });
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
    viewMode === "campaigns" && isLoading && !data;
  const showHypothesesInitialLoading = hypothesesLoading && !hypotheses.length;
  const showPromosInitialLoading = promosLoading && !promos.length;
  const visibleCampaigns = campaigns;
  const visibleHypotheses = hypotheses;
  const visiblePromos = promos;
  const sectionHeader = adsSectionHeader(topSection);
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
          <div className="flex items-center gap-2">
            <Button onClick={openCreateForCurrentView}>
              {sectionHeader.actionLabel}
            </Button>
          </div>
        }
      />
      {sectionTabs}
      <Card className="mb-4">
        <div
          className={`grid min-w-0 gap-3 md:grid-cols-2 ${viewMode === "campaigns" ? "lg:grid-cols-[minmax(0,1fr)_minmax(0,1.35fr)_minmax(0,1fr)_auto] lg:items-end" : "lg:max-w-4xl"}`}
        >
          <AdsChannelScopeFilter
            networks={channelNetworks ?? []}
            channels={ownTelegramChannels}
            onChange={(channelIds) => {
              setChannelScopeFilter(channelIds.join(","));
              campaignsPagination.resetPage();
              hypothesesPagination.resetPage();
              promosPagination.resetPage();
            }}
          />
          <label className="min-w-0 space-y-1">
            <span className="flex min-h-7 items-center text-sm text-neutral-300">
              Search
            </span>
            <Input
              className="h-[42px]"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                campaignsPagination.resetPage();
                hypothesesPagination.resetPage();
                promosPagination.resetPage();
              }}
              placeholder={
                viewMode === "campaigns"
                  ? "Campaign, source, channel"
                  : viewMode === "promos"
                    ? "Promo, text, channel"
                    : "Hypothesis"
              }
            />
          </label>
          {viewMode === "campaigns" ? (
            <div className="min-w-0">
              <FormField label="Period">
                <DateRangeInput
                  from={dateFrom}
                  to={dateTo}
                  onChange={(range) => {
                    setDateFrom(range.from);
                    setDateTo(range.to);
                    campaignsPagination.resetPage();
                  }}
                />
              </FormField>
            </div>
          ) : null}
          {viewMode === "campaigns" ? (
            <div className="space-y-1 justify-self-start md:justify-self-end">
              <span
                className="flex min-h-7 items-center text-sm opacity-0"
                aria-hidden="true"
              >
                Sort
              </span>
              <AdCampaignSortMenu
                value={sort}
                onChange={(value) => {
                  setSort(value);
                  campaignsPagination.resetPage();
                }}
              />
            </div>
          ) : null}
        </div>
      </Card>

      {showCampaignsInitialLoading ? <LoadingState /> : null}
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
          loading={isLoading}
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
        <PromosSection
          promos={visiblePromos}
          loading={showPromosInitialLoading}
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

function formatMetric(value: unknown, decimals = 0) {
  if (value == null || !Number.isFinite(Number(value))) return "-";
  return Number(value).toLocaleString(undefined, {
    maximumFractionDigits: decimals,
    minimumFractionDigits: decimals,
  });
}

function formatPercent(value: unknown, decimals = 1) {
  if (value == null || !Number.isFinite(Number(value))) return "-";
  return `${formatMetric(value, decimals)}%`;
}

function numberOrNull(value: unknown) {
  if (value == null) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function isInRange(value: number, from: number | null, to: number | null) {
  if (from == null && to == null) return false;
  if (from != null && value < from) return false;
  if (to != null && value > to) return false;
  return true;
}

function calculatedKpiStatus(
  value: number | null,
  channel?: AdCampaign["telegramChannel"],
): AdCampaignKpiStatus {
  if (value == null || !channel) return "unknown";
  const targetFrom = numberOrNull(channel.targetCpaFrom);
  const target = numberOrNull(channel.targetCpa);
  const acceptableFrom = numberOrNull(channel.acceptableCpaFrom);
  const acceptable = numberOrNull(channel.acceptableCpa);
  const stopFrom =
    numberOrNull(channel.stopCpaFrom) ?? numberOrNull(channel.stopCpa);
  if (
    targetFrom == null &&
    target == null &&
    acceptableFrom == null &&
    acceptable == null &&
    stopFrom == null
  )
    return "unknown";
  if (target != null || stopFrom != null) {
    if (target != null && value <= target) return "good";
    if (stopFrom != null && value >= stopFrom) return "bad";
    if (target != null && stopFrom != null) return "acceptable";
  }
  if (isInRange(value, targetFrom, target)) return "good";
  if (isInRange(value, acceptableFrom, acceptable)) return "acceptable";
  if (isInRange(value, stopFrom, null)) return "bad";
  return "unknown";
}

function effectiveCampaignKpiStatus(
  campaign: AdCampaign,
  primaryCostPerJoined: number | null,
  costPerJoined: number | null,
): AdCampaignKpiStatus {
  return calculatedKpiStatus(
    primaryCostPerJoined ?? costPerJoined,
    campaign.telegramChannel,
  );
}

function campaignPendingCount(campaign: AdCampaign) {
  const inviteLinkAttributed = (campaign.inviteLinks || []).reduce(
    (sum, link) =>
      sum + Number(link.joinedCount ?? 0) + Number(link.requestedCount ?? 0),
    0,
  );
  const inviteLinkJoined = (campaign.inviteLinks || []).reduce(
    (sum, link) => sum + Number(link.joinedCount ?? 0),
    0,
  );
  const inviteLinkPending = Math.max(
    0,
    inviteLinkAttributed - inviteLinkJoined,
  );
  if (inviteLinkAttributed > 0) return inviteLinkPending;
  const analyticsPending = Number(campaign.analytics?.requestedCount ?? 0);
  if (analyticsPending > 0) return analyticsPending;
  return 0;
}

function campaignJoinedCount(campaign: AdCampaign) {
  const inviteLinkJoined = (campaign.inviteLinks || []).reduce(
    (sum, link) => sum + Number(link.joinedCount ?? 0),
    0,
  );
  if (inviteLinkJoined > 0) return inviteLinkJoined;
  return Number(campaign.analytics?.joinedCount ?? campaign.joinedCount ?? 0);
}

function campaignAttributedCount(campaign: AdCampaign) {
  const inviteLinkAttributed = (campaign.inviteLinks || []).reduce(
    (sum, link) =>
      sum + Number(link.joinedCount ?? 0) + Number(link.requestedCount ?? 0),
    0,
  );
  if (inviteLinkAttributed > 0) return inviteLinkAttributed;
  const analyticsAttributed = Number(campaign.analytics?.attributedCount ?? 0);
  if (analyticsAttributed > 0) return analyticsAttributed;
  return campaignJoinedCount(campaign) + campaignPendingCount(campaign);
}

function campaignDateInputValue(campaign: any) {
  return toInputDate(
    campaign?.placementDate || campaign?.startedAt || campaign?.createdAt,
  );
}

function displayCampaignTitle(campaign: any) {
  const date = toInputDate(
    campaign?.placementDate || campaign?.startedAt || campaign?.createdAt,
  );
  const customTitle = resolveTitleTemplate(campaign?.customTitleTemplate, {
    date,
  });
  if (customTitle) return customTitle;
  let title = String(campaign?.title || "").trim();
  title = title.replace(/^Telegram ad campaign:\s*/i, "").trim();
  if (date) {
    title = title
      .replace(new RegExp(`^${date}\\s*\\|\\s*`), "")
      .replace(new RegExp(`^${date}\\b\\s*[-|:]?\\s*`), "")
      .trim();
  }
  if (!title || /^Campaign\s+\d{4}-\d{2}-\d{2}$/i.test(title)) {
    return generatedCampaignDisplayTitle(campaign);
  }
  return title;
}

function displayCampaignTitleWithDate(campaign: any) {
  const date = campaignDateInputValue(campaign);
  if (String(campaign?.customTitleTemplate || "").trim()) {
    return displayCampaignTitle(campaign);
  }
  return date
    ? `${date} | ${displayCampaignTitle(campaign)}`
    : displayCampaignTitle(campaign);
}

function generatedCampaignDisplayTitle(campaign: any) {
  const sources = (campaign?.advertisingChannels || [])
    .map((source: any) => source.title || source.name)
    .filter(Boolean);
  const promo = campaign?.promo?.title;
  const parts = [...sources.slice(0, 2), promo].filter(Boolean);
  if (parts.length) return [...new Set(parts)].join(" | ");
  return campaign?.telegramChannel?.title || "Campaign";
}

function CampaignsTable({
  campaigns,
  moneySettings,
  rates,
  onEdit,
  onDelete,
  onToggleExclude,
  onOpenPromo,
}: {
  campaigns: any[];
  moneySettings: any;
  rates: any[] | undefined;
  onEdit: (campaign: any) => void;
  onDelete: (campaign: any) => void;
  onToggleExclude: (campaign: any, excludeFromAnalytics: boolean) => void;
  onOpenPromo: (promo: Promo) => void;
}) {
  const [kpiTooltip, setKpiTooltip] = useState<{
    channel: TelegramChannel;
    left: number;
    top: number;
  } | null>(null);

  const showKpiTooltip = (
    channel: TelegramChannel | undefined,
    element: HTMLElement,
  ) => {
    if (!channel) return;
    const rect = element.getBoundingClientRect();
    const width = 430;
    const left = Math.min(
      Math.max(16, rect.left),
      Math.max(16, window.innerWidth - width - 16),
    );
    const top = Math.min(
      rect.bottom + 10,
      Math.max(16, window.innerHeight - 96),
    );
    setKpiTooltip({ channel, left, top });
  };

  return (
    <>
      <div className="table-scroll mb-5 w-full rounded-lg border border-neutral-800">
        <table className="w-full min-w-[960px] table-fixed text-left text-sm">
          <colgroup>
            <col className="w-[420px]" />
            <col className="w-[360px]" />
            <col className="w-[80px]" />
          </colgroup>
          <thead className="bg-slate-950 text-xs uppercase text-neutral-400">
            <tr>
              <th className="px-4 py-3 font-medium">Campaign</th>
              <th
                className="px-4 py-3 font-medium"
                title="Hover a campaign performance card to see this channel's KPI ranges."
              >
                <span className="inline-flex items-center gap-1">
                  Performance
                  <CircleHelp size={13} className="text-slate-500" />
                </span>
              </th>
              <th className="px-4 py-3 text-right font-medium">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-800">
            {campaigns.map((campaign, index) => {
              const joined =
                campaign.analytics?.joinedCount ?? campaign.joinedCount ?? 0;
              const net =
                campaign.analytics?.netGrowth ??
                campaign.netGrowthCount ??
                joined;
              const left =
                campaign.analytics?.leftCount ?? campaign.leftCount ?? 0;
              const cost = Number(campaign.price || campaign.costAmount || 0);
              const primaryCost = Number(campaign.priceInPrimaryCurrency ?? 0);
              const costPerJoined = joined > 0 ? cost / joined : null;
              const primaryCostPerJoined =
                joined > 0 ? primaryCost / joined : null;
              const metrics = campaignMetrics(campaign);
              const kpiStatus = effectiveCampaignKpiStatus(
                campaign,
                primaryCostPerJoined,
                costPerJoined,
              );
              return (
                <tr
                  key={campaign.id}
                  className={`align-top text-slate-200 transition-colors hover:bg-neutral-900 ${index % 2 ? "bg-neutral-950" : "bg-black"}`}
                >
                  <td className="px-4 py-4">
                    <div className="min-w-0 space-y-3">
                      <div className="truncate font-semibold text-white">
                        {displayCampaignTitleWithDate(campaign)}
                      </div>
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500">
                        <SourceChip
                          source={campaign.telegramChannel}
                          fallback="-"
                          compact
                          href={
                            campaign.telegramChannel?.id
                              ? `/telegram/channels/${campaign.telegramChannel.id}`
                              : undefined
                          }
                          title={
                            campaign.telegramChannel?.title
                              ? `Own Telegram channel: ${campaign.telegramChannel.title}\nClick to open this channel.\nCtrl/Cmd + click opens it in a new tab.`
                              : undefined
                          }
                        />
                        {campaign.assignedMember ? (
                          <MemberChip member={campaign.assignedMember} />
                        ) : null}
                      </div>
                      <div className="flex max-w-full flex-wrap items-center gap-1.5">
                        <PromoList
                          promos={
                            campaign.promos ||
                            (campaign.promo ? [campaign.promo] : [])
                          }
                          onOpenPromo={onOpenPromo}
                          inline
                        />
                        <InviteLinkList
                          inviteLinks={campaign.inviteLinks || []}
                          inline
                        />
                      </div>
                      <SourceList
                        sources={campaign.advertisingChannels || []}
                      />
                    </div>
                  </td>
                  <td className="px-4 py-4">
                    <PerformanceCell
                      campaign={campaign}
                      cost={cost}
                      currency={campaign.currency}
                      primaryCost={primaryCost}
                      costPerJoined={costPerJoined}
                      primaryCostPerJoined={primaryCostPerJoined}
                      joined={joined}
                      net={net}
                      left={left}
                      moneySettings={moneySettings}
                      rates={rates}
                      kpiStatus={kpiStatus}
                      metrics={metrics}
                      onShowKpiTooltip={showKpiTooltip}
                      onHideKpiTooltip={() => setKpiTooltip(null)}
                    />
                  </td>
                  <td className="px-4 py-4">
                    <div className="flex justify-end">
                      <CardActionsMenu label={`Actions for ${campaign.title}`}>
                        <CardMenuAction
                          label="Edit campaign"
                          icon={<Pencil size={16} />}
                          onClick={() => onEdit(campaign)}
                        />
                        <CardMenuAction
                          label={
                            campaign.excludeFromAnalytics
                              ? "Include in analytics"
                              : "Exclude from analytics"
                          }
                          icon={<EyeOff size={16} />}
                          onClick={() =>
                            onToggleExclude(
                              campaign,
                              !campaign.excludeFromAnalytics,
                            )
                          }
                        />
                        <CardMenuAction
                          label="Delete campaign"
                          icon={<Trash2 size={16} />}
                          danger
                          onClick={() => onDelete(campaign)}
                        />
                      </CardActionsMenu>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {kpiTooltip ? (
        <KpiTooltip
          channel={kpiTooltip.channel}
          left={kpiTooltip.left}
          top={kpiTooltip.top}
        />
      ) : null}
    </>
  );
}

function PerformanceCell({
  campaign,
  cost,
  currency,
  primaryCost,
  costPerJoined,
  primaryCostPerJoined,
  joined,
  net,
  left,
  moneySettings,
  rates,
  kpiStatus,
  metrics,
  onShowKpiTooltip,
  onHideKpiTooltip,
}: {
  campaign: AdCampaign;
  cost: number;
  currency: string;
  primaryCost: number;
  costPerJoined: number | null;
  primaryCostPerJoined: number | null;
  joined: number;
  net: number;
  left: number;
  moneySettings: any;
  rates: any[] | undefined;
  kpiStatus: AdCampaignKpiStatus;
  metrics: Array<{ label: string; value: string }>;
  onShowKpiTooltip: (
    channel: TelegramChannel | undefined,
    element: HTMLElement,
  ) => void;
  onHideKpiTooltip: () => void;
}) {
  const kpiTextClass = kpiMetricTextClass(kpiStatus);
  const cardClass = performanceCardClass(kpiStatus);
  const shouldShowKpiTooltip =
    kpiStatus === "good" || kpiStatus === "acceptable" || kpiStatus === "bad";
  return (
    <div className={`rounded-xl border p-3 ${cardClass}`}>
      <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
        <KpiStatusBadge
          status={kpiStatus}
          onMouseEnter={(event) => {
            if (!shouldShowKpiTooltip) return;
            onShowKpiTooltip(campaign.telegramChannel, event.currentTarget);
          }}
          onMouseLeave={() => {
            if (!shouldShowKpiTooltip) return;
            onHideKpiTooltip();
          }}
        />
      </div>
      <div className="grid grid-cols-[minmax(90px,1fr)_minmax(70px,0.7fr)_minmax(80px,0.8fr)] gap-3">
        <div>
          <p className="mb-1 text-[10px] uppercase tracking-wide text-slate-500">
            Spend
          </p>
          <NativeMoney
            amount={cost}
            currency={currency}
            displayMode={moneySettings?.currencyDisplayMode}
            className="font-semibold leading-snug text-white"
          />
        </div>
        <div>
          <p className="mb-1 text-[10px] uppercase tracking-wide text-slate-500">
            Joined
          </p>
          <p className={`font-semibold leading-snug ${kpiTextClass}`}>
            {formatMetric(joined)}
          </p>
          <p className="text-xs leading-snug text-slate-500">
            Net {formatMetric(net)}
            {left > 0 ? ` / left ${formatMetric(left)}` : ""}
          </p>
        </div>
        <div>
          <p className="mb-1 text-[10px] uppercase tracking-wide text-slate-500">
            CPA
          </p>
          {costPerJoined !== null ? (
            <NativeMoney
              amount={costPerJoined}
              currency={currency}
              displayMode={moneySettings?.currencyDisplayMode}
              className={`font-semibold leading-snug ${kpiTextClass}`}
            />
          ) : (
            <p className="text-slate-500">-</p>
          )}
        </div>
      </div>
      {metrics.length ? (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {metrics.slice(0, 4).map((metric) => (
            <span
              key={metric.label}
              className="rounded border border-slate-700/80 bg-black/20 px-2 py-0.5 text-xs text-slate-200"
            >
              {metric.label}: {metric.value}
            </span>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function kpiMetricTextClass(status?: AdCampaignKpiStatus | null) {
  if (status === "good") return "text-emerald-300";
  if (status === "acceptable") return "text-yellow-200";
  if (status === "bad") return "text-rose-200";
  return "text-white";
}

function performanceCardClass(status?: AdCampaignKpiStatus | null) {
  if (status === "good") return "border-emerald-700/70 bg-emerald-950/20";
  if (status === "acceptable") return "border-yellow-700/70 bg-yellow-950/20";
  if (status === "bad") return "border-rose-700/70 bg-rose-950/20";
  return "border-slate-800 bg-slate-950/40";
}

function PromoList({
  promos,
  onOpenPromo,
  inline = false,
}: {
  promos: Promo[];
  onOpenPromo: (promo: Promo) => void;
  inline?: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  if (!promos.length) return null;
  const visible = expanded ? promos : promos.slice(0, 3);
  const hiddenCount = Math.max(0, promos.length - visible.length);
  const content = (
    <>
      {visible.map((promo) => (
        <button
          key={promo.id}
          type="button"
          onClick={(event) => {
            if (event.metaKey || event.ctrlKey) {
              window.open(
                `/ad-campaigns?section=promo&promoId=${promo.id}`,
                "_blank",
                "noopener,noreferrer",
              );
              return;
            }
            onOpenPromo(promo);
          }}
          title={`Promo: ${promo.title}\nClick to open its preview modal.\nCtrl/Cmd + click opens it in a new tab.`}
          className="inline-flex max-w-[240px] items-center gap-1.5 rounded-full border border-blue-800 bg-blue-950/30 px-2.5 py-1 text-xs text-blue-100 transition-colors hover:bg-blue-950/50"
        >
          <PromoVisual promo={promo} />
          <span className="truncate">{promo.title}</span>
        </button>
      ))}
      {hiddenCount ? (
        <button
          type="button"
          onClick={() => setExpanded(true)}
          className="rounded-full border border-slate-700 px-2 py-1 text-xs text-slate-300 transition-colors hover:border-slate-500 hover:text-white"
          title={`Show ${hiddenCount} more promos`}
        >
          +{hiddenCount}
        </button>
      ) : null}
    </>
  );
  if (inline) return content;
  return <div className="flex max-w-full flex-wrap gap-1.5">{content}</div>;
}

function PromoVisual({ promo }: { promo: Promo }) {
  return (
    <IconAvatar
      icon={promo.iconPresentation}
      label={promo.title}
      size="xs"
      bordered={false}
      className="!bg-transparent"
    />
  );
}

function InviteLinkList({
  inviteLinks,
  inline = false,
}: {
  inviteLinks: TelegramInviteLink[];
  inline?: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  if (!inviteLinks.length) return null;
  const visible = expanded ? inviteLinks : inviteLinks.slice(0, 3);
  const hiddenCount = Math.max(0, inviteLinks.length - visible.length);
  const content = (
    <>
      {visible.map((inviteLink) => (
        <a
          key={inviteLink.id}
          href={inviteLink.url}
          title={`Invite link: ${inviteLink.name}\nClick to open the invite link.\nCtrl/Cmd + click opens it in a new tab.`}
          className="inline-flex max-w-[240px] items-center gap-1 rounded-full border border-amber-800 bg-amber-950/20 px-2 py-1 text-xs text-amber-100 transition-colors hover:bg-amber-950/35"
        >
          <span className="truncate">{inviteLink.name}</span>
        </a>
      ))}
      {hiddenCount ? (
        <button
          type="button"
          onClick={() => setExpanded(true)}
          className="rounded-full border border-slate-700 px-2 py-1 text-xs text-slate-300 transition-colors hover:border-slate-500 hover:text-white"
          title={`Show ${hiddenCount} more invite links`}
        >
          +{hiddenCount}
        </button>
      ) : null}
    </>
  );
  if (inline) return content;
  return <div className="flex max-w-full flex-wrap gap-1.5">{content}</div>;
}

function SourceChip({
  source,
  fallback,
  compact = false,
  href,
  title,
}: {
  source: any;
  fallback?: string;
  compact?: boolean;
  href?: string;
  title?: string;
}) {
  const label = source?.title || source?.name || fallback || "-";
  const content = (
    <>
      {source?.photoUrl || source?.imageUrl ? (
        <img
          src={source.photoUrl || source.imageUrl}
          alt=""
          className={`${compact ? "h-4 w-4" : "h-5 w-5"} shrink-0 rounded-full object-cover`}
        />
      ) : (
        <span
          className={`${compact ? "h-4 w-4" : "h-5 w-5"} inline-flex shrink-0 items-center justify-center rounded-full border border-slate-700 text-[10px] text-slate-400`}
        >
          {String(label).slice(0, 1).toUpperCase()}
        </span>
      )}
      <span className="truncate">{label}</span>
    </>
  );
  if (!href) {
    return (
      <span
        className={`inline-flex items-center gap-2 ${compact ? "max-w-[200px]" : "max-w-[220px]"}`}
        title={title}
      >
        {content}
      </span>
    );
  }
  return (
    <a
      href={href}
      title={title}
      className={`inline-flex items-center gap-2 transition-colors hover:text-white ${compact ? "max-w-[200px]" : "max-w-[220px]"}`}
    >
      {content}
    </a>
  );
}

function SourceList({ sources }: { sources: any[] }) {
  const [expanded, setExpanded] = useState(false);
  if (!sources.length) return null;
  const visible = expanded ? sources : sources.slice(0, 3);
  const hiddenCount = Math.max(0, sources.length - visible.length);
  return (
    <div className="flex max-w-full flex-wrap gap-1.5">
      {visible.map((source) => (
        <a
          key={source.selectionId || source.id}
          href={
            source.selectionId?.startsWith("source:")
              ? "/advertising-channels"
              : source.id
                ? `/telegram/channels/${source.id}`
                : "/advertising-channels"
          }
          title={`${source.selectionId?.startsWith("source:") ? "Advertising source" : "Telegram channel source"}: ${source.title || source.name}\nClick to open it.\nCtrl/Cmd + click opens it in a new tab.`}
          className="inline-flex max-w-[260px] items-center gap-1.5 rounded-full bg-slate-900 px-2 py-1 text-xs text-slate-200 ring-1 ring-slate-800 transition-colors hover:bg-slate-800"
        >
          {source.photoUrl || source.imageUrl ? (
            <img
              src={source.photoUrl || source.imageUrl}
              alt=""
              className="h-4 w-4 rounded-full object-cover"
            />
          ) : null}
          <span className="truncate">{source.title || source.name}</span>
        </a>
      ))}
      {hiddenCount ? (
        <button
          type="button"
          onClick={() => setExpanded(true)}
          className="rounded-full border border-slate-700 px-2 py-1 text-xs text-slate-300 transition-colors hover:border-slate-500 hover:text-white"
          title={`Show ${hiddenCount} more sources`}
        >
          +{hiddenCount}
        </button>
      ) : null}
    </div>
  );
}

function MemberChip({
  member,
}: {
  member: NonNullable<AdCampaign["assignedMember"]>;
}) {
  const label = member.user?.name || "Member";
  const avatarImageUrl =
    member.avatarPresentation?.type === "image"
      ? member.avatarPresentation.url
      : undefined;
  const avatarEmoji =
    member.avatarPresentation?.type === "unicode"
      ? member.avatarPresentation.value
      : undefined;
  return (
    <a
      href="/workspace-members"
      title={`Assigned member: ${label}\nClick to open workspace members.\nCtrl/Cmd + click opens it in a new tab.`}
      className="inline-flex max-w-[220px] items-center gap-1.5 rounded-full border border-slate-700/80 bg-slate-900/70 px-2 py-1 text-xs text-slate-200 transition-colors hover:border-slate-500 hover:text-white"
    >
      {avatarImageUrl ? (
        <img
          src={avatarImageUrl}
          alt=""
          className="h-4 w-4 shrink-0 rounded-full object-cover"
        />
      ) : null}
      {!avatarImageUrl && avatarEmoji ? (
        <span className="inline-flex h-4 w-4 shrink-0 items-center justify-center text-[12px] leading-none">
          {avatarEmoji}
        </span>
      ) : null}
      {!avatarImageUrl && !avatarEmoji ? (
        <span className="inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full border border-slate-600 text-[10px] text-slate-400">
          {label.slice(0, 1).toUpperCase()}
        </span>
      ) : null}
      <span className="truncate">{label}</span>
    </a>
  );
}

function hasValue(value: unknown) {
  return value != null && Number.isFinite(Number(value));
}

function campaignMetrics(campaign: any) {
  const metrics = [
    {
      label: "New subs",
      value: campaign?.newSubscribers,
      format: (value: unknown) => formatMetric(value),
    },
    {
      label: "Active",
      value:
        campaign?.cappedActiveSubscribersFromAd ??
        campaign?.activeSubscribersFromAd,
      format: (value: unknown) => formatMetric(value),
    },
    {
      label: "Raw uplift",
      value: campaign?.rawActiveSubscribersFromAd,
      format: (value: unknown) => formatMetric(value),
    },
    {
      label: "Active CPA",
      value: campaign?.cappedActiveCpa ?? campaign?.activeCpa,
      format: (value: unknown) => formatMetric(value, 2),
    },
    {
      label: "Retention 7d",
      value: campaign?.retention7d,
      format: (value: unknown) => formatPercent(value),
    },
  ];

  return metrics
    .filter((metric) => hasValue(metric.value))
    .map((metric) => ({
      label: metric.label,
      value: metric.format(metric.value),
    }));
}

function kpiStatusClass(status?: AdCampaignKpiStatus | null) {
  if (status === "good")
    return "border-emerald-700 bg-emerald-950/20 text-emerald-200";
  if (status === "acceptable")
    return "border-yellow-700 bg-yellow-950/20 text-yellow-200";
  if (status === "bad") return "border-rose-700 bg-rose-950/20 text-rose-200";
  return "border-slate-700 bg-slate-950/30 text-slate-300";
}

function kpiStatusLabel(status?: AdCampaignKpiStatus | null) {
  if (status === "good") return "KPI hit";
  if (status === "acceptable") return "KPI ok";
  if (status === "bad") return "KPI missed";
  return "KPI unknown";
}

function kpiStatusTitle(status?: AdCampaignKpiStatus | null) {
  if (status === "good") return "CPA is inside target KPI range.";
  if (status === "acceptable") return "CPA is inside acceptable KPI range.";
  if (status === "bad") return "CPA is inside stop KPI range.";
  return "KPI range or enough CPA data is missing.";
}

function KpiStatusBadge({
  status,
  onMouseEnter,
  onMouseLeave,
}: {
  status?: AdCampaignKpiStatus | null;
  onMouseEnter?: MouseEventHandler<HTMLSpanElement>;
  onMouseLeave?: MouseEventHandler<HTMLSpanElement>;
}) {
  return (
    <span
      className={`inline-flex rounded border px-2 py-0.5 text-xs ${kpiStatusClass(status)} ${status && status !== "unknown" && onMouseEnter ? "cursor-help" : ""}`}
      title={kpiStatusTitle(status)}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
    >
      {kpiStatusLabel(status)}
    </span>
  );
}

function KpiTooltip({
  channel,
  left,
  top,
}: {
  channel: TelegramChannel;
  left: number;
  top: number;
}) {
  return (
    <div
      className="fixed z-[80] rounded-lg border border-slate-700 bg-neutral-950 px-3 py-2 shadow-2xl"
      style={{ left, top, width: 430 }}
    >
      <div className="flex flex-wrap items-center gap-2 text-sm font-semibold">
        <span className="text-white">KPI $:</span>
        <KpiRangeChip
          tone="target"
          label={`target ${formatKpiRange(channel.targetCpaFrom, channel.targetCpa)}`}
        />
        <KpiRangeChip
          tone="ok"
          label={`ok ${formatKpiRange(channel.acceptableCpaFrom, channel.acceptableCpa)}`}
        />
        <KpiRangeChip
          tone="stop"
          label={`stop ${formatKpiRange(channel.stopCpaFrom ?? channel.stopCpa, null, true)}`}
        />
      </div>
    </div>
  );
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
  return (
    <span className={`rounded border px-2 py-1 ${className}`}>{label}</span>
  );
}

function formatKpiRange(
  from?: number | string | null,
  to?: number | string | null,
  openEnded = false,
) {
  const fromValue = numberOrNull(from);
  const toValue = numberOrNull(to);
  if (openEnded && fromValue != null) return `${formatMetric(fromValue, 2)}+`;
  if (fromValue != null && toValue != null)
    return `${formatMetric(fromValue, 2)}-${formatMetric(toValue, 2)}`;
  if (fromValue != null) return `${formatMetric(fromValue, 2)}+`;
  if (toValue != null) return `≤${formatMetric(toValue, 2)}`;
  return "-";
}

function MiniPerformance({
  label,
  value,
}: {
  label: string;
  value: React.ReactNode;
}) {
  return (
    <div>
      <p className="text-[10px] uppercase tracking-wide text-slate-500">
        {label}
      </p>
      {typeof value === "string" ? (
        <p className="font-semibold leading-snug text-white">{value}</p>
      ) : (
        value
      )}
    </div>
  );
}

function PromosSection({
  promos,
  loading,
  error,
  onEdit,
  onDelete,
}: {
  promos: Promo[];
  loading: boolean;
  error: unknown;
  onEdit: (promo: Promo) => void;
  onDelete: (promo: Promo) => void;
}) {
  return (
    <>
      {loading ? <LoadingState /> : null}
      {error ? (
        <div className="mb-4 rounded-lg border border-rose-700 p-3 text-sm text-rose-200">
          Failed to load promos.
        </div>
      ) : null}
      {!loading && !error && !promos.length ? (
        <EmptyState text="No promos yet." />
      ) : null}
      {promos.length ? (
        <MasonryGrid>
          {promos.map((promo) => (
            <PromoCard
              key={promo.id}
              promo={promo}
              icon={
                <PromoIcon
                  iconId={promo.iconId}
                  icon={promo.iconPresentation}
                  title={promo.title}
                />
              }
              channel={
                promo.telegramChannel ? (
                  <SourceChip source={promo.telegramChannel} compact />
                ) : null
              }
              member={
                promo.assignedMember ? (
                  <PromoAssignedMemberChip member={promo.assignedMember} />
                ) : null
              }
              onEdit={() => onEdit(promo)}
              onDelete={() => onDelete(promo)}
            />
          ))}
        </MasonryGrid>
      ) : null}
    </>
  );
}

function PromoIcon({
  iconId,
  icon,
  title,
}: {
  iconId?: string | null;
  icon?: Promo["iconPresentation"];
  title: string;
}) {
  const resolvedIcon = icon;
  if (!resolvedIcon) return null;
  return (
    <IconAvatar
      icon={resolvedIcon}
      label={title}
      size="xs"
      bordered={false}
      className="!bg-transparent"
    />
  );
}

function PromoAssignedMemberChip({
  member,
}: {
  member: NonNullable<Promo["assignedMember"]>;
}) {
  const label = member.user?.name || "Member";
  const avatarImageUrl =
    member.avatarPresentation?.type === "image"
      ? member.avatarPresentation.url
      : undefined;
  const avatarEmoji =
    member.avatarPresentation?.type === "unicode"
      ? member.avatarPresentation.value
      : undefined;
  return (
    <a
      href="/workspace-members"
      title={`Assigned member: ${label}\nClick to open workspace members.\nCtrl/Cmd + click opens it in a new tab.`}
      className="inline-flex max-w-[220px] items-center gap-1.5 rounded-full border border-slate-700/80 bg-slate-900/70 px-2 py-1 text-xs text-slate-200 transition-colors hover:border-slate-500 hover:text-white"
    >
      {avatarImageUrl ? (
        <img
          src={avatarImageUrl}
          alt=""
          className="h-4 w-4 shrink-0 rounded-full object-cover"
        />
      ) : null}
      {!avatarImageUrl && avatarEmoji ? (
        <span className="inline-flex h-4 w-4 shrink-0 items-center justify-center text-[12px] leading-none">
          {avatarEmoji}
        </span>
      ) : null}
      {!avatarImageUrl && !avatarEmoji ? (
        <span className="inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full border border-slate-600 text-[10px] text-slate-400">
          {label.slice(0, 1).toUpperCase()}
        </span>
      ) : null}
      <span className="truncate">{label}</span>
    </a>
  );
}

function HypothesesSection({
  hypotheses,
  loading,
  error,
  moneySettings,
  rates,
  onEdit,
  onDelete,
  onOpenCampaigns,
  onOpenHistory,
  onToggleExclude,
}: {
  hypotheses: AdHypothesis[];
  loading: boolean;
  error: unknown;
  moneySettings: any;
  rates: any[] | undefined;
  onEdit: (hypothesis: AdHypothesis) => void;
  onDelete: (hypothesis: AdHypothesis) => void;
  onOpenCampaigns: (hypothesis: AdHypothesis) => void;
  onOpenHistory: (hypothesis: AdHypothesis) => void;
  onToggleExclude: (
    hypothesis: AdHypothesis,
    excludeFromAnalytics: boolean,
  ) => void;
}) {
  return (
    <>
      {loading ? <LoadingState /> : null}
      {error ? (
        <div className="mb-4 rounded-lg border border-rose-700 p-3 text-sm text-rose-200">
          Failed to load hypotheses.
        </div>
      ) : null}
      {!loading && !error && !hypotheses.length ? (
        <EmptyState text="No hypotheses yet." />
      ) : null}
      {hypotheses.length ? (
        <div className="table-scroll mb-5 w-full rounded-lg border border-neutral-800">
          <table className="w-full min-w-[880px] table-fixed text-left text-sm">
            <thead className="bg-slate-950 text-xs uppercase text-neutral-400">
              <tr>
                <th className="w-[52%] px-4 py-3 font-medium">Hypothesis</th>
                <th className="w-[38%] px-4 py-3 font-medium">Performance</th>
                <th className="w-[10%] px-4 py-3 text-right font-medium">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-800">
              {hypotheses.map((hypothesis, index) => (
                <tr
                  key={hypothesis.id}
                  className={`align-top text-slate-200 transition-colors hover:bg-neutral-900 ${index % 2 ? "bg-neutral-950" : "bg-black"}`}
                >
                  <td className="px-4 py-4">
                    <div className="space-y-3">
                      <div className="flex items-start gap-3">
                        <AdHypothesisAvatar hypothesis={hypothesis} />
                        <div className="min-w-0">
                          <p className="font-semibold text-white">
                            {hypothesis.name}
                          </p>
                          <div className="mt-1 flex flex-wrap items-center gap-2">
                            {hypothesis.isSystem ? (
                              <span className="rounded-full border border-cyan-700/80 bg-cyan-950/40 px-2 py-0.5 text-xs font-medium text-cyan-200">
                                System
                              </span>
                            ) : null}
                            {hypothesis.assignedMember ? (
                              <MemberChip member={hypothesis.assignedMember} />
                            ) : null}
                            {hypothesis.telegramChannel ? (
                              <SourceChip
                                source={hypothesis.telegramChannel}
                                compact
                              />
                            ) : null}
                            {hypothesis.isSystem ? (
                              <span className="inline-flex items-center rounded-full border border-slate-700 px-2 py-0.5 text-xs text-slate-300">
                                Campaigns{" "}
                                {formatMetric(
                                  hypothesis.summary?.campaignsCount ??
                                    hypothesis.campaignsCount,
                                )}
                              </span>
                            ) : (
                              <button
                                type="button"
                                onClick={() => onOpenCampaigns(hypothesis)}
                                className="inline-flex items-center rounded-full border border-blue-700 px-2 py-0.5 text-xs text-blue-200 transition-colors hover:border-blue-500 hover:text-white"
                              >
                                Campaigns{" "}
                                {formatMetric(
                                  hypothesis.summary?.campaignsCount ??
                                    hypothesis.campaignsCount,
                                )}
                              </button>
                            )}
                          </div>
                          {hypothesis.description ? (
                            <p className="mt-2 line-clamp-2 text-xs text-slate-500">
                              {hypothesis.description}
                            </p>
                          ) : null}
                        </div>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-4">
                    <div
                      className={`rounded-xl border p-3 ${performanceCardClass(hypothesis.summary?.kpiStatus)}`}
                    >
                      <div className="mb-3 flex items-start justify-between gap-2">
                        <KpiStatusBadge
                          status={hypothesis.summary?.kpiStatus}
                        />
                      </div>
                      <div className="grid grid-cols-[minmax(90px,1fr)_minmax(80px,0.75fr)_minmax(80px,0.85fr)] gap-3">
                        <div>
                          <p className="mb-1 text-[10px] uppercase tracking-wide text-slate-500">
                            Spend
                          </p>
                          <NativeMoney
                            amount={
                              hypothesis.summary?.totalSpendDisplay ??
                              hypothesis.summary?.totalSpend
                            }
                            currency={
                              hypothesis.summary?.displayCurrency ??
                              moneySettings.primaryCurrency
                            }
                            displayMode={moneySettings.currencyDisplayMode}
                            className="font-semibold leading-snug text-white"
                          />
                        </div>
                        <div>
                          <p className="mb-1 text-[10px] uppercase tracking-wide text-slate-500">
                            Attributed
                          </p>
                          <p
                            className={`font-semibold leading-snug ${kpiMetricTextClass(hypothesis.summary?.kpiStatus)}`}
                          >
                            {formatMetric(
                              hypothesis.summary?.totalAttributedSubscribers,
                            )}
                          </p>
                          <div className="mt-1 space-y-0.5 text-xs leading-snug text-slate-500">
                            <p>
                              Joined{" "}
                              {formatMetric(
                                hypothesis.summary?.totalJoinedSubscribers,
                              )}
                            </p>
                            {Number(
                              hypothesis.summary?.totalPendingSubscribers ?? 0,
                            ) > 0 ? (
                              <p>
                                Pending{" "}
                                {formatMetric(
                                  hypothesis.summary?.totalPendingSubscribers,
                                )}
                              </p>
                            ) : null}
                          </div>
                        </div>
                        <div>
                          <p className="mb-1 text-[10px] uppercase tracking-wide text-slate-500">
                            CPA
                          </p>
                          <NativeMoney
                            amount={
                              hypothesis.summary?.avgCpaDisplay ??
                              hypothesis.summary?.avgCpa
                            }
                            currency={
                              hypothesis.summary?.displayCurrency ??
                              moneySettings.primaryCurrency
                            }
                            displayMode={moneySettings.currencyDisplayMode}
                            className={`font-semibold leading-snug ${kpiMetricTextClass(hypothesis.summary?.kpiStatus)}`}
                          />
                        </div>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-4">
                    <div className="flex justify-end">
                      <AdHypothesisRowActions
                        hypothesis={hypothesis}
                        onOpenHistory={onOpenHistory}
                        onEdit={onEdit}
                        onToggleExclude={onToggleExclude}
                        onDelete={onDelete}
                      />
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </>
  );
}

function HypothesisCampaignsModal({
  hypothesis,
  moneySettings,
  rates,
  onClose,
}: {
  hypothesis: AdHypothesis | null;
  moneySettings: any;
  rates: any[] | undefined;
  onClose: () => void;
}) {
  const detailQuery = useQuery({
    queryKey: ["ad-hypothesis-detail", hypothesis?.id],
    queryFn: () => adHypothesesApi.get(hypothesis!.id),
    enabled: Boolean(hypothesis?.id),
  });

  return (
    <Modal
      open={Boolean(hypothesis)}
      onClose={onClose}
      title={
        hypothesis ? `${hypothesis.name} campaigns` : "Hypothesis campaigns"
      }
      size="xl"
    >
      {detailQuery.isLoading ? <LoadingState /> : null}
      {detailQuery.error ? (
        <div className="rounded-lg border border-rose-700 p-3 text-sm text-rose-200">
          Failed to load hypothesis campaigns.
        </div>
      ) : null}
      {detailQuery.data?.campaigns?.length ? (
        <AdCampaignsTable
          campaigns={detailQuery.data.campaigns}
          moneySettings={moneySettings}
          rates={rates}
          showActions={false}
          showHypotheses={false}
        />
      ) : null}
      {!detailQuery.isLoading &&
      !detailQuery.error &&
      !detailQuery.data?.campaigns?.length ? (
        <EmptyState text="No campaigns in this hypothesis." />
      ) : null}
    </Modal>
  );
}

function HypothesisInviteLinkHistoryModal({
  hypothesis,
  onClose,
}: {
  hypothesis: AdHypothesis | null;
  onClose: () => void;
}) {
  const [previewLink, setPreviewLink] = useState<TelegramInviteLink | null>(
    null,
  );
  const historyQuery = useQuery({
    queryKey: ["ad-hypothesis-history", hypothesis?.id],
    queryFn: () => adHypothesesApi.inviteLinkHistory(hypothesis!.id),
    enabled: Boolean(hypothesis?.id),
  });
  const history = historyQuery.data;

  return (
    <Modal
      open={Boolean(hypothesis)}
      onClose={onClose}
      title={hypothesis ? `${hypothesis.name} trend` : "Hypothesis trend"}
      size="xl"
    >
      {historyQuery.isLoading ? <LoadingState /> : null}
      {historyQuery.error ? (
        <div className="rounded-lg border border-rose-700 p-3 text-sm text-rose-200">
          Failed to load hypothesis trend.
        </div>
      ) : null}
      {history ? (
        <div className="space-y-4">
          <InviteLinkHistoryPanel
            title="Hypothesis invite-link trend"
            subtitle="Aggregate joined and pending requests across all linked campaigns after each sync."
            points={history.points}
            summary={history.summary}
          />
          <div className="rounded-lg border border-slate-800 bg-slate-900/20 p-4">
            <div className="mb-3 flex items-center justify-between gap-2">
              <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-300">
                Invite links breakdown
              </h3>
              <span className="text-xs text-slate-500">
                {formatMetric(history.summary.campaignsCount)} campaigns ·{" "}
                {formatMetric(history.summary.inviteLinksCount)} links
              </span>
            </div>
            <div className="space-y-2">
              {history.inviteLinks.map((link) => (
                <button
                  key={link.id}
                  type="button"
                  onClick={() => setPreviewLink(link as TelegramInviteLink)}
                  className="flex w-full items-center justify-between gap-3 rounded-lg border border-slate-800 bg-slate-950/40 px-3 py-2 text-left transition-colors hover:border-slate-700 hover:bg-slate-950/60"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-white">
                      {link.name}
                    </p>
                    <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500">
                      <p>
                        current {formatMetric(link.summary.currentJoinedCount)}{" "}
                        / peak {formatMetric(link.summary.peakJoinedCount)}
                      </p>
                      <p>
                        pending{" "}
                        {formatMetric(link.summary.currentRequestedCount)}
                      </p>
                    </div>
                  </div>
                  <span className="rounded-full border border-slate-700 px-2.5 py-1 text-xs font-medium text-slate-200">
                    drop {formatMetric(link.summary.drawdownPercent, 1)}%
                  </span>
                </button>
              ))}
            </div>
          </div>
          <InviteLinkPreviewModal
            inviteLink={previewLink}
            onClose={() => setPreviewLink(null)}
          />
        </div>
      ) : null}
    </Modal>
  );
}

function CampaignSelectRow({
  campaign,
  checked,
  moneySettings,
  rates,
  onToggle,
}: {
  campaign: AdCampaign;
  checked: boolean;
  moneySettings: any;
  rates: any[] | undefined;
  onToggle: () => void;
}) {
  const joined = campaign.analytics?.joinedCount ?? campaign.joinedCount ?? 0;
  const pending = campaignPendingCount(campaign);
  const attributed = campaignAttributedCount(campaign);
  const price = Number(campaign.price ?? campaign.costAmount ?? 0);
  const primaryPrice = Number(campaign.priceInPrimaryCurrency ?? 0);
  return (
    <label
      className={`flex cursor-pointer items-start gap-3 rounded-xl border p-3 text-sm ${checked ? "border-blue-700 bg-slate-900" : "border-slate-800 bg-slate-900/30 hover:border-slate-700"}`}
    >
      <input
        type="checkbox"
        checked={checked}
        onChange={onToggle}
        className="h-4 w-4 shrink-0"
      />
      <div className="min-w-0 flex-1">
        <p className="truncate font-semibold text-slate-100">
          {displayCampaignTitleWithDate(campaign)}
        </p>
        <div className="mt-1 flex flex-wrap items-center gap-2">
          {campaign.telegramChannel ? (
            <SourceChip source={campaign.telegramChannel} compact />
          ) : null}
          {campaign.assignedMember ? (
            <MemberChip member={campaign.assignedMember} />
          ) : null}
        </div>
        <MoneyStack
          amount={price}
          currency={campaign.currency}
          settings={moneySettings}
          rates={rates}
          amountInPrimary={primaryPrice}
          mainClassName="mt-2 truncate text-xs text-slate-300"
          subClassName="text-xs text-slate-500"
        />
        <div className="mt-2 flex flex-wrap gap-3 text-xs text-slate-400">
          <span>Attributed {formatMetric(attributed)}</span>
          <span>Joined {formatMetric(joined)}</span>
          {pending > 0 ? <span>Pending {formatMetric(pending)}</span> : null}
        </div>
      </div>
    </label>
  );
}

function getErrorMessage(error: unknown, fallback: string) {
  const responseMessage = (error as any)?.response?.data?.message;
  if (Array.isArray(responseMessage)) return responseMessage.join(", ");
  if (typeof responseMessage === "string" && responseMessage.trim())
    return responseMessage;
  return fallback;
}
