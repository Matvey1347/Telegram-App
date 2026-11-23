"use client";

import { useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Plus } from "lucide-react";
import { formatDate } from "@/lib/date-format";
import { type TelegramAdAvailabilitySlot } from "@telegram-system/shared";
import { AppShell } from "@/components/layout/app-shell";
import { networkKeys, telegramSystemBotKeys } from "@/lib/query-keys";
import { PageTabHead } from "@/components/layout/page-tab-head";
import { Button, PageHeader } from "@/components/ui/primitives";
import { AdSaleModal } from "@/components/features/growth/ad-sales/ad-sale-modal";
import { AdSalesWorkspaceHero } from "@/components/features/growth/ad-sales/ad-sales-workspace-hero";
import { CalendarTab } from "@/components/features/growth/ad-sales/ad-sales-calendar-tab";
import { SalesTab } from "@/components/features/growth/ad-sales/ad-sales-sales-tab";
import { useAdSalesLifecycleRefresh } from "@/components/features/growth/ad-sales/use-ad-sales-publication-refresh";
import { AdSalesPostLinkDialogs } from "@/components/features/growth/ad-sales/ad-sales-post-link-dialogs";
import { AdSalesCheckoutDialogs } from "@/components/features/growth/ad-sales/ad-sales-checkout-dialogs";
import { AdSalesSaleDetailsDialog } from "@/components/features/growth/ad-sales/ad-sales-sale-details-dialog";
import { routeTabFromPathname, sameStringArray, tabRouteMap } from "@/components/features/growth/ad-sales/ad-sales-calendar-range";
import { accountsApi, authApi, currenciesApi, getTelegramChannelPosts, telegramAdSalesApi, telegramSystemBotApi, telegramChannelNetworksApi, type Account, type TelegramChannelNetwork } from "@/lib/api";
import { buildAdCalendarSlots, channelLocalDateKey, expandNetworkChannelIds } from "@/lib/features/growth/telegram-ad-sales";
import { invalidateTelegramAdSaleReads, invalidateTelegramAdSalesDerivedQueries, reconcileTelegramAdSaleCache, shouldLoadAdSalesWorkspaceTimezone, telegramAdSalesKeys } from "@/lib/features/growth/telegram-ad-sales-query";
import { revealCreatedPlacementChannels } from "@/lib/features/growth/ad-sales-preferences-hydration";
import { useAppToast } from "@/providers/toast-provider";
import { CrmWorkspace } from "./crm/crm-workspace";
import { CrmNavigation } from "./crm/crm-navigation";
import { resolveAdSalesSurface } from "./crm/crm-routes";
import { useCrmDealDeepLink } from "./use-crm-deal-deep-link";
import { useAdSalesChannels } from "./use-ad-sales-channels";
import { useAdSalesCalendarPreferences, useAdSalesCalendarRange } from "./use-ad-sales-calendar-state";

const adSalesDataCacheOptions = {
  staleTime: 2 * 60 * 1000,
  gcTime: 15 * 60 * 1000,
  placeholderData: keepPreviousData,
  refetchOnWindowFocus: false,
} as const;

export function AdSalesPage() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const surface = resolveAdSalesSurface(pathname, searchParams);
  if (surface.kind !== "legacy") return <CrmWorkspace surface={surface} />;
  return <LegacyAdSalesPage />;
}

function LegacyAdSalesPage() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const requestedChannelId = searchParams.get("channelId")?.trim() || null;
  const requestedSaleId = searchParams.get("saleId")?.trim() || null;
  const router = useRouter();
  const queryClient = useQueryClient();
  const { pushToast, startOperation } = useAppToast();
  const tab = routeTabFromPathname(pathname);

  const { calendarRangeMode, setCalendarRangeMode, calendarCursor, calendarRangeSelection, from, to, calendarDays, calendarAvailabilityRange, handleCalendarRangeChange, shiftCalendarRange, goToToday } = useAdSalesCalendarRange();
const [selectedNetworkId, setSelectedNetworkId] = useState("");
  const [selectedChannelIds, setSelectedChannelIds] = useState<string[]>([]);
  const [salesPage, setSalesPage] = useState(1);
  const [salesPageSize, setSalesPageSize] = useState(25);
  const [saleSearch, setSaleSearch] = useState("");
  const deferredSaleSearch = useDeferredValue(saleSearch.trim());
  const [selectedSaleId, setSelectedSaleId] = useState<string | null>(
    requestedSaleId,
  );
  const [adSaleModalOpen, setAdSaleModalOpen] = useState(
    () => searchParams.get("open") === "sell",
  );
  const initialAdvertiser = useCrmDealDeepLink(
    searchParams,
    setAdSaleModalOpen,
  );
  const adSaleCheckoutIdempotencyKeyRef = useRef<string | null>(null);
  const [adSaleSeedSlot, setAdSaleSeedSlot] =
    useState<TelegramAdAvailabilitySlot | null>(null);
  const [postEditorPlacement, setPostEditorPlacement] = useState<{
    saleId: string;
    placementId: string;
  } | null>(null);
  const [pastSlotAssignment, setPastSlotAssignment] = useState<{
    saleId: string;
    placementId: string;
    channelTitle: string;
    slotDateLabel: string;
    posts: Array<{
      id: string;
      title: string;
      kind: "managed" | "telegram";
      status: string;
      dateValue: string;
    }>;
  } | null>(null);
  const [selectedPastPostId, setSelectedPastPostId] = useState("");
  const [postTitle, setPostTitle] = useState("");
  const [postText, setPostText] = useState("");
  const [postImages, setPostImages] = useState("");
useEffect(() => {
    if (
      pathname.startsWith("/ad-sales/settings") ||
      pathname.startsWith("/ad-sales/pricing") ||
      pathname.startsWith("/ad-sales/analytics")
    ) {
      router.replace(tabRouteMap.calendar);
    }
  }, [pathname, router]);
const { data: settings } = useQuery({
    queryKey: ["currency-settings"],
    queryFn: currenciesApi.getSettings,
  });
  const { data: me } = useQuery({
    queryKey: ["auth", "me"],
    queryFn: authApi.me,
    staleTime: 5 * 60 * 1000,
    enabled: shouldLoadAdSalesWorkspaceTimezone(
      tab,
      adSaleModalOpen,
      Boolean(selectedSaleId),
    ),
  });
  const { data: rates } = useQuery({
    queryKey: ["currency-rates-latest"],
    queryFn: currenciesApi.listLatestRates,
  });
  const {
    query: channelsQuery,
    channels,
    saleableChannels,
  } = useAdSalesChannels(tab !== "clients" || adSaleModalOpen);
  const networksQuery = useQuery({
    queryKey: networkKeys.list(),
    queryFn: telegramChannelNetworksApi.list,
    enabled: tab === "calendar" || adSaleModalOpen,
  });
  const networks = useMemo(
    () => networksQuery.data ?? [],
    [networksQuery.data],
  );
  const { data: accounts = [] } = useQuery({
    queryKey: ["accounts"],
    queryFn: accountsApi.list,
    enabled: adSaleModalOpen || Boolean(selectedSaleId),
    staleTime: 60 * 1000,
  });
  const systemBotConnectionQuery = useQuery({
    queryKey: telegramSystemBotKeys.connection(),
    queryFn: telegramSystemBotApi.connection,
    enabled: adSaleModalOpen || Boolean(selectedSaleId),
    staleTime: 60 * 1000,
    refetchOnWindowFocus: "always",
  });
  const workspaceTimezone = me?.workspace.timezone || "Europe/Warsaw";
  const preferencesQuery = useQuery({
    queryKey: telegramAdSalesKeys.preferences(),
    queryFn: telegramAdSalesApi.getPreferences,
    enabled: tab === "calendar" || adSaleModalOpen,
    staleTime: 60 * 1000,
  });
  // Wait for saved range/channel preferences before starting the expensive
  // calendar read. Deriving readiness avoids an extra state update/render and
  // prevents a transient default-range request on every page open.
  const calendarPreferencesReady =
    preferencesQuery.isSuccess || preferencesQuery.isError;
  const { mutate: savePreferences } = useMutation({
    mutationFn: (payload: Record<string, unknown>) =>
      telegramAdSalesApi.updatePreferences(payload),
    onSuccess: (preferences) => {
      queryClient.setQueryData(telegramAdSalesKeys.preferences(), preferences);
    },
  });
  const salesQuery = useQuery({
    queryKey: telegramAdSalesKeys.list({
      page: salesPage,
      pageSize: salesPageSize,
      search: deferredSaleSearch,
    }),
    queryFn: ({ signal }) =>
      telegramAdSalesApi.listSalesPage(
        {
          page: salesPage,
          pageSize: salesPageSize,
          search: deferredSaleSearch || undefined,
        },
        signal,
      ),
    enabled: tab === "sales",
    ...adSalesDataCacheOptions,
    // Sale mutations reconcile or invalidate cached list pages. A longer
    // in-session freshness window makes returning to Sales avoid a list GET
    // while the active-page lifecycle refresh still handles due publications.
    staleTime: 5 * 60 * 1000,
  });
  useAdSalesLifecycleRefresh({
    active: tab === "sales",
    sales: salesQuery.data?.items ?? [],
    refetch: salesQuery.refetch,
  });
  const selectedSaleQuery = useQuery({
    queryKey: selectedSaleId
      ? telegramAdSalesKeys.detail(selectedSaleId)
      : ["telegram-ad-sale", "none"],
    queryFn: () => telegramAdSalesApi.getSale(selectedSaleId!),
    enabled: Boolean(selectedSaleId),
    retry: false,
  });
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (selectedSaleQuery.isError) setSelectedSaleId(null);
  }, [selectedSaleQuery.isError]);

  const saleableChannelIdsList = useMemo(
    () => saleableChannels.map((channel) => channel.id),
    [saleableChannels],
  );
  const allCalendarChannelIds = useMemo(
    () => channels.map((channel) => channel.id),
    [channels],
  );
  const saleableChannelIds = useMemo(
    () => new Set(saleableChannelIdsList),
    [saleableChannelIdsList],
  );
  const saleableNetworks = useMemo(
    () =>
      networks
        .map((network) => ({
          ...network,
          channels: network.channels.filter((channel) =>
            saleableChannelIds.has(channel.id),
          ),
        }))
        .filter((network) => network.channels.length > 0),
    [networks, saleableChannelIds],
  );

  const effectiveChannelIds = useMemo(
    () =>
      expandNetworkChannelIds({
        selectedChannelIds,
        allChannelIds: saleableChannelIdsList,
        selectedNetworkId: selectedNetworkId || null,
        networks: saleableNetworks as TelegramChannelNetwork[],
      }),
    [
      saleableChannelIdsList,
      saleableNetworks,
      selectedChannelIds,
      selectedNetworkId,
    ],
  );
  // Calendar is an operational overview: a saved sales-filter must never hide
  // an existing placement from it. The selection still applies to sales forms.
  const calendarChannelIds =
    tab === "calendar" ? allCalendarChannelIds : effectiveChannelIds;

  const handleCalendarRangeModeChange = useAdSalesCalendarPreferences({
    preferences: preferencesQuery.data,
    channelsReady: channelsQuery.isSuccess,
    networksReady: networksQuery.isSuccess,
    requestedChannelId,
    saleableChannelIds: saleableChannelIdsList,
    networks: saleableNetworks,
    selectedChannelIds,
    selectedNetworkId,
    setSelectedChannelIds,
    setSelectedNetworkId,
    calendarRangeMode,
    setCalendarRangeMode,
    savePreferences,
  });
const seedProductChannelId = adSaleSeedSlot?.channelId;
  const productQueryChannelIds = useMemo(
    () => [
      ...new Set([
        ...effectiveChannelIds,
        ...(adSaleModalOpen && seedProductChannelId
          ? [seedProductChannelId]
          : []),
        ...(selectedSaleQuery.data?.placements.map(
          (placement) => placement.telegramChannelId,
        ) ?? []),
      ]),
    ],
    [
      adSaleModalOpen,
      seedProductChannelId,
      effectiveChannelIds,
      selectedSaleQuery.data?.placements,
    ],
  );
  const channelProductsQuery = useQuery({
    queryKey: telegramAdSalesKeys.productsByChannels(productQueryChannelIds),
    queryFn: () =>
      telegramAdSalesApi.listProductsByChannels(productQueryChannelIds),
    enabled:
      (adSaleModalOpen || Boolean(selectedSaleId)) &&
      productQueryChannelIds.length > 0,
    staleTime: 60 * 1000,
  });
  const productsByChannelId = channelProductsQuery.data ?? {};

  const filteredSales = salesQuery.data?.items ?? [];
  const calendarAvailabilityParams = useMemo(
    () => ({
      from: calendarAvailabilityRange.from.toISOString(),
      to: calendarAvailabilityRange.to.toISOString(),
      channelIds: [...calendarChannelIds].sort(),
      // Availability is cached server-side. Bump the calendar read contract so
      // open clients cannot retain the pre-Received-total placement response.
      cacheBust: "calendar-received-totals-v3",
    }),
    [calendarAvailabilityRange, calendarChannelIds],
  );
  const calendarAvailabilityQuery = useQuery({
    queryKey: telegramAdSalesKeys.availability(calendarAvailabilityParams),
    queryFn: () => telegramAdSalesApi.availability(calendarAvailabilityParams),
    enabled:
      tab === "calendar" &&
      calendarPreferencesReady &&
      calendarChannelIds.length > 0,
    ...adSalesDataCacheOptions,
  });
  const filteredSlots = useMemo(
    () => buildAdCalendarSlots(calendarAvailabilityQuery.data?.slots ?? []),
    [calendarAvailabilityQuery.data?.slots],
  );

  async function handleCreateSale(
    payload: Parameters<
      NonNullable<React.ComponentProps<typeof AdSaleModal>["onSubmit"]>
    >[0],
    onProgress?: (
      item: { operation: string; message: string },
      current: number,
      total: number,
    ) => void,
  ) {
    const seedSlot = adSaleSeedSlot;
    const idempotencyKey =
      adSaleCheckoutIdempotencyKeyRef.current ?? crypto.randomUUID();
    adSaleCheckoutIdempotencyKeyRef.current = idempotencyKey;
    const workflow = await telegramAdSalesApi.checkoutSaleWorkflow(
      {
        externalChannelOwner: payload.externalChannelOwner,
        advertiserId: payload.advertiserId,
        createAdvertiser: payload.createAdvertiser,
        advertiserName: payload.advertiserName,
        advertiserTelegram: payload.advertiserTelegram,
        advertiserContact: payload.advertiserContact,
        origin: payload.origin,
        settlementCurrency: payload.paymentCurrency,
        assignedMemberId: payload.assignedMemberId,
        financeSkipped: payload.financeSkipped,
        idempotencyKey: payload.financeSkipped ? idempotencyKey : undefined,
        priceAllocation: payload.priceAllocation,
        placements: payload.placements.map((placement) => ({
          telegramChannelId: placement.channelId,
          telegramAdProductId: placement.productId,
          inventoryOpportunityKey: placement.inventoryOpportunityKey,
          scheduledAt: placement.scheduledAt,
          timezone: placement.timezone,
          agreedPrice: placement.agreedPrice,
          recommendedPrice: placement.recommendedPrice,
          minimumPrice: placement.minimumPrice,
          expectedViews: placement.expectedViews,
          pricingMode: placement.pricingMode,
          currency: payload.paymentCurrency,
          manualPriceReason: placement.manualPriceReason,
          telegramPostId: placement.telegramPostId,
          managedPostDraft: placement.managedPostDraft,
        })),
        payment: payload.financeSkipped
          ? undefined
          : {
              accountId: payload.accountId!,
              amount: payload.paymentAmount!,
              currency: payload.paymentCurrency,
              paidAt: new Date().toISOString(),
              idempotencyKey,
            },
      },
      onProgress ?? (() => undefined),
    );
    const reserved = workflow.sale;
    try {
      if (workflow.failures.length) {
        const firstFailure = workflow.failures[0];
        throw new Error(
          `${workflow.summary.successful} successful · ${workflow.summary.failed} failed · ${workflow.summary.skipped} skipped. ${firstFailure.operation}: ${firstFailure.message}. Retry to continue the unfinished operations.`,
        );
      }
      adSaleCheckoutIdempotencyKeyRef.current = null;
      reconcileTelegramAdSaleCache(queryClient, {
        type: "create",
        sale: reserved,
      });
      const calendarSelection = revealCreatedPlacementChannels({
        selectedChannelIds,
        selectedNetworkId,
        activeChannelIds: effectiveChannelIds,
        saleableChannelIds: saleableChannelIdsList,
        createdChannelIds: reserved.placements.map(
          (placement) => placement.telegramChannelId,
        ),
      });
      if (
        !sameStringArray(
          selectedChannelIds,
          calendarSelection.selectedChannelIds,
        ) ||
        selectedNetworkId !== calendarSelection.selectedNetworkId
      ) {
        setSelectedChannelIds(calendarSelection.selectedChannelIds);
        setSelectedNetworkId(calendarSelection.selectedNetworkId);
        savePreferences({
          selectedChannelIds: calendarSelection.selectedChannelIds,
          selectedNetworkId: calendarSelection.selectedNetworkId || null,
          calendarView:
            calendarRangeMode === "threeMonths" ? "month" : calendarRangeMode,
          initialized: true,
        });
      }
      await invalidateTelegramAdSalesDerivedQueries(queryClient, {
        availability: reserved.placements.length > 0,
        analytics: true,
        finance: true,
        dashboard: true,
        managedPosts: reserved.placements.length > 0,
        channelSummaries: reserved.placements.length > 0,
        crmContacts: true,
        publicationCalendar: reserved.placements.length > 0,
        channelIds: reserved.placements.map(
          (placement) => placement.telegramChannelId,
        ),
      });
      if (
        reserved.placements.length > 0 && seedSlot?.state === "PAST" &&
        !payload.placements.some((placement) => placement.telegramPostId)
      ) {
        const placement =
          reserved.placements.find((item) =>
            seedSlot.inventoryOpportunityKey
              ? item.inventoryOpportunityKey ===
                seedSlot.inventoryOpportunityKey
              : item.telegramChannelId === seedSlot.channelId &&
                item.scheduledAt === seedSlot.scheduledAt,
          ) ??
          reserved.placements.find(
            (item) => item.telegramChannelId === seedSlot.channelId,
          );
        const slotTime = new Date(seedSlot.scheduledAt).getTime();
        const publishedPosts = await getTelegramChannelPosts(
          seedSlot.channelId,
          {
            page: 1,
            pageSize: 100,
            from: new Date(slotTime - 36 * 60 * 60 * 1000).toISOString(),
            to: new Date(slotTime + 36 * 60 * 60 * 1000).toISOString(),
          },
        );
        const candidates = publishedPosts.items
          .filter(
            (item) =>
              channelLocalDateKey(item.postDate, seedSlot.timezone) ===
              channelLocalDateKey(seedSlot.scheduledAt, seedSlot.timezone),
          )
          .map((item) => ({
            id: item.id,
            title:
              item.text?.trim()?.split("\n").find(Boolean)?.slice(0, 80) ||
              "Telegram post",
            kind: "telegram" as const,
            status: "PUBLISHED",
            dateValue: item.postDate,
          }));
        if (placement && candidates.length) {
          setPastSlotAssignment({
            saleId: reserved.id,
            placementId: placement.id,
            channelTitle:
              saleableChannels.find(
                (channel) => channel.id === seedSlot.channelId,
              )?.title || "Channel",
            slotDateLabel: formatDate(seedSlot.scheduledAt),
            posts: candidates,
          });
          setSelectedPastPostId(candidates[0]?.id ?? "");
        } else {
          pushToast(
            "Sale was created, but no post from that day was found to link to the past slot.",
            "error",
          );
        }
      }
      return { sale: reserved, workflowSummary: workflow.summary };
    } catch (error) {
      await invalidateTelegramAdSaleReads(queryClient, {
        saleId: reserved.id,
        lists: true,
      });
      await invalidateTelegramAdSalesDerivedQueries(queryClient, {
        availability: true,
        analytics: true,
        finance: true,
        dashboard: true,
        managedPosts: true,
        channelSummaries: true,
        publicationCalendar: true,
        channelIds: reserved.placements.map(
          (placement) => placement.telegramChannelId,
        ),
      });
      throw error;
    }
  }

  async function submitAdSale(
    payload: Parameters<
      NonNullable<React.ComponentProps<typeof AdSaleModal>["onSubmit"]>
    >[0],
  ) {
    const totalOperations =
      1 +
      payload.placements.filter((placement) => placement.managedPostDraft)
        .length *
        2;
    const operation = startOperation({
      id: `ad-sale-create:${Date.now()}`,
      title: "Creating ad sale",
      message: payload.externalChannelOwner
        ? "Saving the sale and recording the payment..."
        : "Saving the sale and reserving its placements...",
      current: 0,
      total: totalOperations,
    });
    try {
      const result = await handleCreateSale(payload, (item, current, total) =>
        operation.update({
          message: item.message,
          current,
          total,
        }),
      );
      operation.update({
        message: "All checkout operations finished.",
        current: totalOperations,
        total: totalOperations,
        progressSummary: {
          successful: result.workflowSummary.successful,
          failed: result.workflowSummary.failed,
        },
      });
      operation.succeed({
        title: "Ad sale created",
        message: `${result.workflowSummary.successful} successful · ${result.workflowSummary.failed} failed · ${result.workflowSummary.skipped} skipped.`,
      });
      return result;
    } catch (error) {
      operation.fail({
        title: "Ad sale creation failed",
        message:
          error instanceof Error
            ? error.message
            : "Could not create the ad sale.",
      });
      throw error;
    }
  }

  async function refreshSaleAfterMutation(
    saleId: string,
    channelIds: string[],
  ) {
    const uniqueChannelIds = [...new Set(channelIds)];
    await invalidateTelegramAdSaleReads(queryClient, {
      saleId,
      lists: true,
    });
    await invalidateTelegramAdSalesDerivedQueries(queryClient, {
      availability: true,
      analytics: true,
      channelSummaries: true,
      channelIds: uniqueChannelIds,
    });
  }

  const selectedSale =
    selectedSaleQuery.data?.id === selectedSaleId
      ? selectedSaleQuery.data
      : null;
  return (
    <AppShell>
      <PageTabHead title="Selling" emoji="💼" color="#0f766e" />
      <PageHeader
        title="Selling"
        subtitle="See every available and booked advertising slot across your Telegram channels."
        action={
          <div className="flex flex-wrap items-center gap-2">
            <Button
              className="inline-flex h-11 shrink-0 items-center justify-center gap-2 rounded-xl px-5 whitespace-nowrap"
              onClick={() => {
                setAdSaleSeedSlot(null);
                setAdSaleModalOpen(true);
              }}
            >
              <Plus size={18} />
              Sell ad
            </Button>
          </div>
        }
      />

      <CrmNavigation />
      {tab === "calendar" ? (
        <AdSalesWorkspaceHero
          from={from}
          to={to}
          rangeMode={calendarRangeMode}
          rangeSelection={calendarRangeSelection}
          onRangeModeChange={handleCalendarRangeModeChange}
          onRangeChange={handleCalendarRangeChange}
          onShiftRange={shiftCalendarRange}
          onToday={goToToday}
        />
      ) : null}

      {tab === "calendar" ? (
        <CalendarTab
          loadingChannelIds={
            calendarAvailabilityQuery.isLoading ? calendarChannelIds : []
          }
          failedChannelIds={
            calendarAvailabilityQuery.isError ? calendarChannelIds : []
          }
          calendarRangeMode={calendarRangeMode}
          calendarCursor={calendarCursor}
          calendarFrom={from}
          calendarTo={to}
          calendarDays={calendarDays}
          channels={channels}
          selectedChannelIds={calendarChannelIds}
          filteredSlots={filteredSlots}
          daySummaries={calendarAvailabilityQuery.data?.summaries ?? []}
          settings={settings}
          workspaceTimezone={workspaceTimezone}
          onCreateFromSlot={(slot) => {
            setAdSaleSeedSlot(slot);
            setAdSaleModalOpen(true);
          }}
          onOpenSale={setSelectedSaleId}
        />
      ) : null}

      {tab === "sales" ? (
        <SalesTab
          sales={filteredSales}
          loading={salesQuery.isLoading || salesQuery.isPlaceholderData}
          error={salesQuery.error}
          page={salesQuery.data?.pagination.page ?? salesPage}
          pageSize={salesQuery.data?.pagination.pageSize ?? salesPageSize}
          pagination={salesQuery.data?.pagination}
          onPageChange={setSalesPage}
          onPageSizeChange={setSalesPageSize}
          search={saleSearch}
          onSearchChange={(value) => {
            setSaleSearch(value);
            setSalesPage(1);
          }}
          channels={channels}
          settings={settings}
          rates={rates}
          onOpenSale={setSelectedSaleId}
          onDeleteSale={async (sale) => {
            const result = await telegramAdSalesApi.deleteSale(sale.id);
            if (selectedSaleId === sale.id) setSelectedSaleId(null);
            reconcileTelegramAdSaleCache(queryClient, {
              type: "delete",
              saleId: sale.id,
            });
            await invalidateTelegramAdSalesDerivedQueries(queryClient, {
              availability: true,
              analytics: true,
              channelSummaries: true,
              publicationCalendar: true,
              channelIds: result.channelIds,
            });
          }}
        />
      ) : null}
      <AdSalesCheckoutDialogs
        adSaleModalOpen={adSaleModalOpen}
        setAdSaleModalOpen={setAdSaleModalOpen}
        accounts={accounts as Account[]}
        channels={saleableChannels}
        networks={saleableNetworks as TelegramChannelNetwork[]}
        productsByChannelId={productsByChannelId}
        settings={settings}
        workspaceTimezone={workspaceTimezone}
        adSaleSeedSlot={adSaleSeedSlot}
        systemBotConnected={systemBotConnectionQuery.data?.connected}
        systemBotUsername={systemBotConnectionQuery.data?.botUsername}
        systemBotWorkspaceId={systemBotConnectionQuery.data?.currentWorkspaceId}
        submitAdSale={submitAdSale}
        initialAdvertiser={initialAdvertiser}
      />

      <AdSalesSaleDetailsDialog
        selectedSale={selectedSale}
        selectedSaleId={selectedSaleId}
        setSelectedSaleId={setSelectedSaleId}
        accounts={accounts as Account[]}
        channels={channels}
        productsByChannelId={productsByChannelId}
        settings={settings}
        rates={rates}
        systemBotConnected={systemBotConnectionQuery.data?.connected}
        systemBotUsername={systemBotConnectionQuery.data?.botUsername}
        systemBotWorkspaceId={systemBotConnectionQuery.data?.currentWorkspaceId}
        queryClient={queryClient}
        setPostEditorPlacement={setPostEditorPlacement}
        setPostTitle={setPostTitle}
        setPostText={setPostText}
        setPostImages={setPostImages}
        refreshSaleAfterMutation={refreshSaleAfterMutation}
      />
      <AdSalesPostLinkDialogs
        pastSlotAssignment={pastSlotAssignment}
        setPastSlotAssignment={setPastSlotAssignment}
        selectedPastPostId={selectedPastPostId}
        setSelectedPastPostId={setSelectedPastPostId}
        postEditorPlacement={postEditorPlacement}
        setPostEditorPlacement={setPostEditorPlacement}
        postTitle={postTitle}
        setPostTitle={setPostTitle}
        postText={postText}
        setPostText={setPostText}
        postImages={postImages}
        setPostImages={setPostImages}
        queryClient={queryClient}
      />
    </AppShell>
  );
}
