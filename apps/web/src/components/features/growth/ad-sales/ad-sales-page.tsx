"use client";
// prettier-ignore
import { useDeferredValue, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Plus, SlidersHorizontal } from "lucide-react";
import { formatDate } from "@/lib/date-format";
import {
  TELEGRAM_AD_ANALYTICS_MAX_SELECTED_CHANNELS,
  type TelegramAdAvailabilitySlot,
  type TelegramAdSale,
} from "@telegram-system/shared";
import { AppShell } from "@/components/layout/app-shell";
import {
  telegramChannelKeys,
  telegramSystemBotKeys,
} from "@/lib/query-keys";
import { PageTabHead } from "@/components/layout/page-tab-head";
import { Button, PageHeader } from "@/components/ui/primitives";
import { AdSaleModal } from "@/components/features/growth/ad-sales/ad-sale-modal";
import { AdSalesWorkspaceHero } from "@/components/features/growth/ad-sales/ad-sales-workspace-hero";
import { AdSalesInventoryModal } from "@/components/features/growth/ad-sales/ad-sales-inventory-modal";
import type { AdSaleScopeMode } from "@/components/features/growth/ad-sales/ad-sale-placement-scope";
import { CalendarTab } from "@/components/features/growth/ad-sales/ad-sales-calendar-tab";
import { AdSalesAnalyticsPanel } from "@/components/features/growth/ad-sales/ad-sales-analytics-panel";
import { SalesTab } from "@/components/features/growth/ad-sales/ad-sales-sales-tab";
import { useAdSalesLifecycleRefresh } from "@/components/features/growth/ad-sales/use-ad-sales-publication-refresh";
import { AdSalesPostLinkDialogs } from "@/components/features/growth/ad-sales/ad-sales-post-link-dialogs";
import { AdSalesCheckoutDialogs } from "@/components/features/growth/ad-sales/ad-sales-checkout-dialogs";
import { AdSalesSaleDetailsDialog } from "@/components/features/growth/ad-sales/ad-sales-sale-details-dialog";
import {
  addDays,
  dateKey,
  listDaysInRange,
  monthGridDays,
  monthGridDaysForRange,
  rangeForCalendarMode,
  routeTabFromPathname,
  sameStringArray,
  tabRouteMap,
} from "@/components/features/growth/ad-sales/ad-sales-calendar-range";
import {
  accountsApi,
  authApi,
  currenciesApi,
  getTelegramChannelPosts,
  telegramAdSalesApi,
  telegramSystemBotApi,
  telegramChannelsApi,
  telegramChannelNetworksApi,
  type Account,
  type TelegramChannelNetwork,
} from "@/lib/api";
import {
  buildAdCalendarSlots,
  channelLocalDateKey,
  expandNetworkChannelIds,
  readAdSalesCalendarRangeMode,
  writeAdSalesCalendarRangeMode,
  type TelegramAdSalesCalendarRangeMode,
} from "@/lib/features/growth/telegram-ad-sales";
import {
  invalidateTelegramAdSaleReads,
  invalidateTelegramAdSalesDerivedQueries,
  reconcileTelegramAdSaleCache,
  telegramAdSalesKeys,
} from "@/lib/features/growth/telegram-ad-sales-query";
import { resolveAdSalesPreferenceSelection } from "@/lib/features/growth/ad-sales-preferences-hydration";
import { useAppToast } from "@/providers/toast-provider";
import { CrmWorkspace } from "./crm/crm-workspace";
import { CrmNavigation } from "./crm/crm-navigation";
import { resolveAdSalesSurface } from "./crm/crm-routes";
import { useCrmDealDeepLink } from "./use-crm-deal-deep-link";
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
  const [calendarRangeMode, setCalendarRangeMode] =
    useState<TelegramAdSalesCalendarRangeMode>("week");
  const [calendarCursor, setCalendarCursor] = useState(() => new Date());
  const [calendarRangeSelection, setCalendarRangeSelection] = useState<{
    from: string;
    to: string;
  } | null>(null);
  const [selectedNetworkId, setSelectedNetworkId] = useState("");
  const [selectedChannelIds, setSelectedChannelIds] = useState<string[]>([]);
  const [inventorySelectionMode, setInventorySelectionMode] =
    useState<AdSaleScopeMode>("channels");
  const [inventoryOpen, setInventoryOpen] = useState(false);
  const [salesPage, setSalesPage] = useState(1);
  const [salesPageSize, setSalesPageSize] = useState(25);
  const [saleSearch, setSaleSearch] = useState("");
  const deferredSaleSearch = useDeferredValue(saleSearch.trim());
  const [selectedSaleId, setSelectedSaleId] = useState<string | null>(requestedSaleId);
  const [adSaleModalOpen, setAdSaleModalOpen] = useState(false);
  const initialAdvertiser = useCrmDealDeepLink(searchParams, setAdSaleModalOpen);
  const adSaleCheckoutIdempotencyKeyRef = useRef<string | null>(null);
  const [adSaleSeedSlot, setAdSaleSeedSlot] =
    useState<TelegramAdAvailabilitySlot | null>(null);
  const [paymentSale, setPaymentSale] = useState<TelegramAdSale | null>(null);
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
  const appliedPreferencesSignatureRef = useRef<string | null>(null);
  useLayoutEffect(() => {
    const storedView = readAdSalesCalendarRangeMode(window.localStorage);
    if (!storedView) return;
    // Apply the stored visual mode before the browser paints the calendar.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setCalendarRangeMode(storedView);
  }, []);
  useEffect(() => {
    if (
      pathname.startsWith("/ad-sales/settings") ||
      pathname.startsWith("/ad-sales/pricing")
    ) {
      router.replace(tabRouteMap.calendar);
    }
  }, [pathname, router]);
  const { from, to } = useMemo(() => {
    if (calendarRangeSelection?.from) {
      return {
        from: new Date(`${calendarRangeSelection.from}T00:00:00`),
        to: new Date(
          `${calendarRangeSelection.to || calendarRangeSelection.from}T23:59:59.999`,
        ),
      };
    }
    return rangeForCalendarMode(calendarRangeMode, calendarCursor);
  }, [calendarCursor, calendarRangeMode, calendarRangeSelection]);

  const calendarDays = useMemo(() => {
    if (calendarRangeMode === "month" && !calendarRangeSelection?.from) {
      return monthGridDays(calendarCursor);
    }
    if (calendarRangeMode === "threeMonths" && !calendarRangeSelection?.from) {
      return monthGridDaysForRange(from, to);
    }
    return listDaysInRange(from, to);
  }, [calendarCursor, calendarRangeMode, calendarRangeSelection, from, to]);
  const { data: settings } = useQuery({
    queryKey: ["currency-settings"],
    queryFn: currenciesApi.getSettings,
    staleTime: 5 * 60 * 1000,
  });
  const { data: me } = useQuery({
    queryKey: ["auth", "me"],
    queryFn: authApi.me,
    staleTime: 5 * 60 * 1000,
  });
  const { data: rates } = useQuery({
    queryKey: ["currency-rates-latest"],
    queryFn: currenciesApi.listLatestRates,
    staleTime: 5 * 60 * 1000,
  });
  const channelsQuery = useQuery({
    queryKey: telegramChannelKeys.list(),
    queryFn: telegramChannelsApi.list,
    enabled: tab !== "clients" || inventoryOpen || adSaleModalOpen,
    staleTime: 60 * 1000,
  });
  const channels = useMemo(
    () => channelsQuery.data ?? [],
    [channelsQuery.data],
  );
  const networksQuery = useQuery({
    queryKey: ["telegram-channel-networks"],
    queryFn: telegramChannelNetworksApi.list,
    enabled:
      tab === "calendar" ||
      tab === "analytics" ||
      inventoryOpen ||
      adSaleModalOpen,
    staleTime: 60 * 1000,
  });
  const networks = useMemo(
    () => networksQuery.data ?? [],
    [networksQuery.data],
  );
  const { data: accounts = [] } = useQuery({
    queryKey: ["accounts"],
    queryFn: accountsApi.list,
    enabled: adSaleModalOpen || Boolean(selectedSaleId) || Boolean(paymentSale),
    staleTime: 60 * 1000,
  });
  const systemBotConnectionQuery = useQuery({
    queryKey: telegramSystemBotKeys.connection(),
    queryFn: telegramSystemBotApi.connection,
    enabled: adSaleModalOpen, staleTime: 60 * 1000,
    refetchOnWindowFocus: "always",
  });
  const workspaceTimezone = me?.workspace.timezone || "Europe/Warsaw";
  const preferencesQuery = useQuery({
    queryKey: telegramAdSalesKeys.preferences(),
    queryFn: telegramAdSalesApi.getPreferences,
    enabled:
      tab === "calendar" ||
      tab === "analytics" ||
      inventoryOpen ||
      adSaleModalOpen,
    staleTime: 60 * 1000,
  });
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

  const saleableChannels = useMemo(
    () => channels.filter((channel) => channel.preview?.canPostMessages),
    [channels],
  );
  const saleableChannelIdsList = useMemo(
    () => saleableChannels.map((channel) => channel.id),
    [saleableChannels],
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

  useEffect(() => {
    const preferences = preferencesQuery.data;
    const resolvedSelection = resolveAdSalesPreferenceSelection({
      preferences,
      channelsReady: channelsQuery.isSuccess,
      networksReady: networksQuery.isSuccess,
      saleableChannelIds: saleableChannelIdsList,
      networks: saleableNetworks,
      requestedChannelId,
    });
    if (!preferences || !resolvedSelection) return;
    const nextNetworkId = resolvedSelection.selectedNetworkId;
    const nextIds = resolvedSelection.selectedChannelIds;
    const storedRangeMode = readAdSalesCalendarRangeMode(window.localStorage);
    const normalizedView =
      storedRangeMode === "threeMonths"
        ? "threeMonths"
        : preferences.initialized && preferences.calendarView === "month"
          ? "month"
          : "week";
    const nextCalendarRangeMode = normalizedView;
    writeAdSalesCalendarRangeMode(window.localStorage, nextCalendarRangeMode);
    const nextPreferencesSignature = JSON.stringify({
      nextIds,
      nextNetworkId,
      nextCalendarRangeMode,
      saleableChannelIdsList,
    });

    if (appliedPreferencesSignatureRef.current === nextPreferencesSignature) {
      return;
    }
    appliedPreferencesSignatureRef.current = nextPreferencesSignature;

    setSelectedChannelIds((current) =>
      sameStringArray(current, nextIds) ? current : nextIds,
    );
    setSelectedNetworkId((current) =>
      current === nextNetworkId ? current : nextNetworkId,
    );
    setInventorySelectionMode(nextNetworkId ? "network" : "channels");
    setCalendarRangeMode((current) =>
      current === nextCalendarRangeMode ? current : nextCalendarRangeMode,
    );

    if (!preferences.initialized && nextIds.length) {
      savePreferences({
        selectedChannelIds: nextIds,
        selectedNetworkId: null,
        calendarView:
          nextCalendarRangeMode === "threeMonths"
            ? "month"
            : nextCalendarRangeMode,
        initialized: true,
      });
      return;
    }

    if (
      preferences.initialized &&
      (!sameStringArray(nextIds, preferences.selectedChannelIds) ||
        nextNetworkId !== (preferences.selectedNetworkId ?? ""))
    ) {
      savePreferences({
        selectedChannelIds: nextIds,
        selectedNetworkId: nextNetworkId || null,
        calendarView:
          nextCalendarRangeMode === "threeMonths"
            ? "month"
            : nextCalendarRangeMode,
        initialized: true,
      });
    }
  }, [
    channelsQuery.isSuccess,
    networksQuery.isSuccess,
    preferencesQuery.data,
    requestedChannelId,
    savePreferences,
    saleableChannelIdsList,
    saleableNetworks,
  ]);

  const persistCalendarPreferences = (
    payload: Partial<{
      selectedChannelIds: string[];
      selectedNetworkId: string | null;
      calendarView: "week" | "month";
    }>,
  ) => {
    savePreferences({
      selectedChannelIds,
      selectedNetworkId: selectedNetworkId || null,
      calendarView:
        payload.calendarView ??
        (calendarRangeMode === "threeMonths" ? "month" : calendarRangeMode),
      ...payload,
      initialized: true,
    });
  };

  const handleCalendarRangeModeChange = (
    view: TelegramAdSalesCalendarRangeMode,
  ) => {
    writeAdSalesCalendarRangeMode(window.localStorage, view);
    setCalendarRangeMode(view);
    if (view !== "threeMonths") {
      persistCalendarPreferences({ calendarView: view });
    }
  };

  const handleCalendarRangeChange = (range: { from: string; to: string }) => {
    setCalendarRangeSelection(range.from || range.to ? range : null);
    if (range.from) {
      setCalendarCursor(new Date(`${range.from}T12:00:00`));
    }
  };

  const shiftCalendarRange = (direction: -1 | 1) => {
    if (calendarRangeSelection?.from) {
      const currentFrom = new Date(`${calendarRangeSelection.from}T00:00:00`);
      const currentTo = new Date(
        `${calendarRangeSelection.to || calendarRangeSelection.from}T00:00:00`,
      );
      const span = Math.max(
        1,
        Math.round(
          (currentTo.getTime() - currentFrom.getTime()) / (24 * 60 * 60 * 1000),
        ) + 1,
      );
      const nextFrom = addDays(currentFrom, span * direction);
      const nextTo = addDays(currentTo, span * direction);
      setCalendarRangeSelection({
        from: dateKey(nextFrom),
        to: dateKey(nextTo),
      });
      setCalendarCursor(new Date(nextFrom));
      return;
    }
    setCalendarCursor((current) =>
      calendarRangeMode === "month"
        ? new Date(current.getFullYear(), current.getMonth() + direction, 1)
        : calendarRangeMode === "threeMonths"
          ? new Date(
              current.getFullYear(),
              current.getMonth() + direction * 3,
              1,
            )
          : addDays(current, direction * 7),
    );
  };

  const handleSelectedNetworkIdChange = (networkId: string) => {
    setSelectedNetworkId(networkId);
    if (!networkId) {
      persistCalendarPreferences({ selectedNetworkId: null });
      return;
    }
    const network = saleableNetworks.find((item) => item.id === networkId);
    const nextChannelIds = network?.channels.map((channel) => channel.id) ?? [];
    setSelectedChannelIds(nextChannelIds);
    persistCalendarPreferences({
      selectedNetworkId: networkId || null,
      selectedChannelIds: nextChannelIds,
    });
  };

  const handleSelectedChannelIdsChange = (channelIds: string[]) => {
    setSelectedChannelIds(channelIds);
    setSelectedNetworkId("");
    persistCalendarPreferences({
      selectedChannelIds: channelIds,
      selectedNetworkId: null,
    });
  };

  const handleInventorySelectionModeChange = (mode: AdSaleScopeMode) => {
    setInventorySelectionMode(mode);
    if (mode === "network") {
      const nextNetworkId =
        selectedNetworkId ||
        saleableNetworks.find((network) => network.systemKey === "ALL")?.id ||
        "";
      handleSelectedNetworkIdChange(nextNetworkId);
      return;
    }
    setSelectedNetworkId("");
    persistCalendarPreferences({
      selectedChannelIds,
      selectedNetworkId: null,
    });
  };

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
      from: from.toISOString(),
      to: to.toISOString(),
      channelIds: [...effectiveChannelIds].sort(),
    }),
    [effectiveChannelIds, from, to],
  );
  const calendarAvailabilityQuery = useQuery({
    queryKey: telegramAdSalesKeys.availability(calendarAvailabilityParams),
    queryFn: () => telegramAdSalesApi.availability(calendarAvailabilityParams),
    enabled: tab === "calendar" && effectiveChannelIds.length > 0,
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
        advertiserId: payload.advertiserId,
        createAdvertiser: payload.createAdvertiser,
        advertiserName: payload.advertiserName,
        advertiserTelegram: payload.advertiserTelegram,
        advertiserContact: payload.advertiserContact,
        origin: payload.origin,
        settlementCurrency: payload.paymentCurrency,
        assignedMemberId: payload.assignedMemberId,
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
        payment: {
          accountId: payload.accountId,
          amount: payload.paymentAmount,
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
      await invalidateTelegramAdSalesDerivedQueries(queryClient, {
        availability: true,
        analytics: true,
        finance: true,
        dashboard: true,
        managedPosts: true,
        channelSummaries: true,
        channelIds: reserved.placements.map(
          (placement) => placement.telegramChannelId,
        ),
      });
      if (
        seedSlot?.state === "PAST" &&
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
      message: "Saving the sale and reserving its placements...",
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
    await invalidateTelegramAdSaleReads(queryClient, {
      saleId,
      lists: true,
    });
    await invalidateTelegramAdSalesDerivedQueries(queryClient, {
      availability: true,
      analytics: true,
      channelSummaries: true,
      channelIds,
    });
  }

  const selectedSale =
    selectedSaleQuery.data?.id === selectedSaleId
      ? selectedSaleQuery.data
      : null;
  return (
    <AppShell>
      <PageTabHead title="Ad Sales" emoji="💼" color="#0f766e" />
      <PageHeader
        title="Advertising sales"
        subtitle="Sell ad placements across your own Telegram channels and networks."
        action={
          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="secondary"
              className="inline-flex h-11 items-center justify-center gap-2 rounded-xl px-4"
              onClick={() => setInventoryOpen(true)}
            >
              <SlidersHorizontal size={17} />
              Inventory
            </Button>
            <Button
              className="inline-flex h-11 items-center justify-center gap-2 rounded-xl px-5"
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
          onToday={() => {
            setCalendarRangeSelection(null);
            setCalendarCursor(new Date());
          }}
        />
      ) : null}

      <AdSalesInventoryModal
        open={inventoryOpen}
        loading={channelsQuery.isLoading || networksQuery.isLoading}
        error={channelsQuery.error || networksQuery.error}
        selectionMode={inventorySelectionMode}
        selectedNetworkId={selectedNetworkId}
        selectedChannelIds={selectedChannelIds}
        networks={saleableNetworks as TelegramChannelNetwork[]}
        channels={saleableChannels}
        onClose={() => setInventoryOpen(false)}
        onSelectionModeChange={handleInventorySelectionModeChange}
        onNetworkChange={handleSelectedNetworkIdChange}
        onChannelsChange={handleSelectedChannelIdsChange}
        maxSelectedChannels={
          tab === "analytics"
            ? TELEGRAM_AD_ANALYTICS_MAX_SELECTED_CHANNELS
            : undefined
        }
      />

      {tab === "calendar" ? (
        <CalendarTab
          loadingChannelIds={
            calendarAvailabilityQuery.isLoading ? effectiveChannelIds : []
          }
          failedChannelIds={
            calendarAvailabilityQuery.isError ? effectiveChannelIds : []
          }
          calendarRangeMode={calendarRangeMode}
          calendarCursor={calendarCursor}
          calendarFrom={from}
          calendarTo={to}
          calendarDays={calendarDays}
          channels={saleableChannels}
          selectedChannelIds={selectedChannelIds}
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
              channelIds: result.channelIds,
            });
          }}
        />
      ) : null}

      {tab === "analytics" ? (
        <AdSalesAnalyticsPanel
          selectedChannelIds={effectiveChannelIds}
          selectedNetworkId={selectedNetworkId || null}
          settings={settings}
          rates={rates}
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
        submitAdSale={submitAdSale}
        paymentSale={paymentSale}
        setPaymentSale={setPaymentSale}
        refreshSaleAfterMutation={refreshSaleAfterMutation}
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
        queryClient={queryClient}
        setPaymentSale={setPaymentSale}
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
