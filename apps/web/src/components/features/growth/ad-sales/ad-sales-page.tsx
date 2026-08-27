"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { usePathname, useRouter } from "next/navigation";
import { Plus, SlidersHorizontal } from "lucide-react";
import { formatDate } from "@/lib/date-format";
import type {
  TelegramAdAvailabilitySlot,
  TelegramAdSale,
} from "@telegram-system/shared";
import { AppShell } from "@/components/layout/app-shell";
import {
  telegramChannelKeys,
  telegramPostKeys,
  telegramSystemBotKeys,
} from "@/lib/query-keys";
import { PageTabHead } from "@/components/layout/page-tab-head";
import {
  Button,
  FormField,
  Input,
  Modal,
  PageHeader,
  Select,
  Textarea,
} from "@/components/ui/primitives";
import { RegisterPaymentModal } from "@/components/features/growth/ad-sales/register-payment-modal";
import { AdSaleModal } from "@/components/features/growth/ad-sales/ad-sale-modal";
import { AdSalesWorkspaceHero } from "@/components/features/growth/ad-sales/ad-sales-workspace-hero";
import { AdSalesInventoryModal } from "@/components/features/growth/ad-sales/ad-sales-inventory-modal";
import type { AdSaleScopeMode } from "@/components/features/growth/ad-sales/ad-sale-placement-scope";
import { CalendarTab } from "@/components/features/growth/ad-sales/ad-sales-calendar-tab";
import { AdSalesAnalyticsPanel } from "@/components/features/growth/ad-sales/ad-sales-analytics-panel";
import { AdSalesClientsPanel } from "@/components/features/growth/ad-sales/ad-sales-clients-panel";
import { SaleDetailsModal } from "@/components/features/growth/ad-sales/ad-sales-sale-details-modal";
import { SalesTab } from "@/components/features/growth/ad-sales/ad-sales-sales-tab";
import {
  accountsApi,
  authApi,
  currenciesApi,
  getAllTelegramChannelPosts,
  getTelegramChannelPosts,
  syncTelegramChannelPostMetrics,
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
  zonedDateTimeToUtc,
  type TelegramAdSalesCalendarRangeMode,
  type TelegramAdSalesTab,
} from "@/lib/features/growth/telegram-ad-sales";
import {
  invalidateTelegramAdSalesQueries,
  telegramAdSalesKeys,
  upsertTelegramAdSaleInCache,
} from "@/lib/features/growth/telegram-ad-sales-query";
import { resolveAdSalesPreferenceSelection } from "@/lib/features/growth/ad-sales-preferences-hydration";
import { useAppToast } from "@/providers/toast-provider";
const calendarSalesPageSize = 100;
const adSalesDataCacheOptions = {
  staleTime: 2 * 60 * 1000,
  gcTime: 15 * 60 * 1000,
  placeholderData: keepPreviousData,
  refetchOnWindowFocus: false,
} as const;

function startOfWeek(value: Date) {
  const date = new Date(value);
  const day = date.getDay() || 7;
  date.setDate(date.getDate() - day + 1);
  date.setHours(0, 0, 0, 0);
  return date;
}

function addDays(value: Date, days: number) {
  const date = new Date(value);
  date.setDate(date.getDate() + days);
  return date;
}

function dateKey(value: Date) {
  return channelLocalDateKey(value);
}

function startOfMonth(value: Date) {
  return new Date(value.getFullYear(), value.getMonth(), 1);
}

function endOfMonth(value: Date) {
  return new Date(
    value.getFullYear(),
    value.getMonth() + 1,
    0,
    23,
    59,
    59,
    999,
  );
}

function addMonths(value: Date, months: number) {
  return new Date(value.getFullYear(), value.getMonth() + months, 1);
}

function monthGridDays(value: Date) {
  const start = startOfWeek(startOfMonth(value));
  return Array.from({ length: 42 }, (_, index) => addDays(start, index));
}

function monthGridDaysForRange(from: Date, to: Date) {
  const start = startOfWeek(startOfMonth(from));
  const lastVisibleWeekStart = startOfWeek(addDays(endOfMonth(to), 1));
  const end = addDays(lastVisibleWeekStart, 6);
  return listDaysInRange(start, end);
}

function rangeForCalendarMode(
  view: TelegramAdSalesCalendarRangeMode,
  cursor: Date,
) {
  if (view === "month") {
    return {
      from: startOfMonth(cursor),
      to: endOfMonth(cursor),
    };
  }
  if (view === "threeMonths") {
    return {
      from: startOfMonth(addMonths(cursor, -1)),
      to: endOfMonth(addMonths(cursor, 1)),
    };
  }
  return {
    from: startOfWeek(cursor),
    to: addDays(startOfWeek(cursor), 6),
  };
}

function listDaysInRange(from: Date, to: Date) {
  const days: Date[] = [];
  const start = new Date(from);
  start.setHours(0, 0, 0, 0);
  const end = new Date(to);
  end.setHours(0, 0, 0, 0);
  for (
    let cursor = new Date(start);
    cursor <= end;
    cursor = addDays(cursor, 1)
  ) {
    days.push(new Date(cursor));
  }
  return days;
}

function sameStringArray(left: string[], right: string[]) {
  return (
    left.length === right.length &&
    left.every((value, index) => value === right[index])
  );
}

const tabRouteMap: Record<TelegramAdSalesTab, string> = {
  calendar: "/ad-sales/calendar",
  sales: "/ad-sales/sales",
  clients: "/ad-sales/clients",
  analytics: "/ad-sales/analytics",
  settings: "/ad-sales/calendar",
};

function routeTabFromPathname(pathname: string): TelegramAdSalesTab {
  if (pathname.startsWith("/ad-sales/analytics")) return "analytics";
  if (pathname.startsWith("/ad-sales/clients")) return "clients";
  if (pathname.startsWith("/ad-sales/sales")) return "sales";
  return "calendar";
}

export function AdSalesPage() {
  const pathname = usePathname();
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
  const [selectedSaleId, setSelectedSaleId] = useState<string | null>(null);
  const [adSaleModalOpen, setAdSaleModalOpen] = useState(false);
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
    queryKey: ["currency-rates"],
    queryFn: currenciesApi.listRates,
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
    enabled: adSaleModalOpen,
    staleTime: 60 * 1000,
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
  const savePreferencesMutation = useMutation({
    mutationFn: (payload: Record<string, unknown>) =>
      telegramAdSalesApi.updatePreferences(payload),
    onSuccess: (preferences) => {
      queryClient.setQueryData(telegramAdSalesKeys.preferences(), preferences);
    },
  });
  const salesQuery = useQuery({
    queryKey: telegramAdSalesKeys.sales({
      page: salesPage,
      pageSize: salesPageSize,
    }),
    queryFn: () =>
      telegramAdSalesApi.listSalesPage({
        page: salesPage,
        pageSize: salesPageSize,
      }),
    enabled: tab === "sales",
    ...adSalesDataCacheOptions,
  });
  const calendarSalesQuery = useQuery({
    queryKey: telegramAdSalesKeys.sales({
      page: 1,
      pageSize: calendarSalesPageSize,
      scope: "calendar",
    }),
    queryFn: () =>
      telegramAdSalesApi.listSalesPage({
        page: 1,
        pageSize: calendarSalesPageSize,
      }),
    enabled: tab === "calendar",
    ...adSalesDataCacheOptions,
  });
  const selectedSaleQuery = useQuery({
    queryKey: selectedSaleId
      ? telegramAdSalesKeys.sale(selectedSaleId)
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
      savePreferencesMutation.mutate({
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
      savePreferencesMutation.mutate({
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
    savePreferencesMutation.mutate({
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

  const filteredSales = useMemo(() => {
    let items = salesQuery.data?.items ?? [];
    const search = saleSearch.trim().toLowerCase();
    if (search) {
      items = items.filter((sale) =>
        [
          sale.title,
          sale.advertiserNameSnapshot,
          sale.advertiserTelegramSnapshot,
          sale.advertiserName,
          sale.advertiserTelegram,
          sale.advertiserContact,
        ]
          .filter(Boolean)
          .some((value) => String(value).toLowerCase().includes(search)),
      );
    }
    return items;
  }, [saleSearch, salesQuery.data?.items]);

  const filteredSlots = useMemo(() => {
    const channelIds = new Set(effectiveChannelIds);
    const items = buildAdCalendarSlots(
      (calendarSalesQuery.data?.items ?? []).flatMap((sale) =>
        sale.placements
          .filter((placement) => channelIds.has(placement.telegramChannelId))
          .map(
            (placement): TelegramAdAvailabilitySlot => ({
              channelId: placement.telegramChannelId,
              date: channelLocalDateKey(
                placement.scheduledAt,
                placement.timezone,
              ),
              inventoryOpportunityKey: placement.inventoryOpportunityKey,
              scheduledAt: placement.scheduledAt,
              timezone: placement.timezone || workspaceTimezone,
              source: "sale",
              state: "SOLD",
              blockingReason: null,
              nextOrganicPostAt: null,
              productId: placement.telegramAdProductId,
              expectedViews: placement.expectedViews,
              recommendedPrice: placement.recommendedPrice,
              minimumPrice: placement.minimumPrice,
              currency: placement.currency,
              existingPlacement: {
                id: placement.id,
                saleId: sale.id,
                status: placement.status,
              },
              organicPostsCountForDay: 0,
              adsCountForDay: 1,
            }),
          ),
      ),
    );
    return items;
  }, [effectiveChannelIds, calendarSalesQuery.data?.items, workspaceTimezone]);

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
      upsertTelegramAdSaleInCache(queryClient, reserved);
      await invalidateTelegramAdSalesQueries(queryClient, {
        saleId: reserved.id,
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
      await invalidateTelegramAdSalesQueries(queryClient, {
        saleId: reserved.id,
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
    await invalidateTelegramAdSalesQueries(queryClient, { saleId, channelIds });
    await queryClient.invalidateQueries({
      queryKey: telegramAdSalesKeys.sales({}),
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

      <AdSalesWorkspaceHero
        from={from}
        to={to}
        rangeMode={calendarRangeMode}
        rangeSelection={calendarRangeSelection}
        activeTab={tab}
        onRangeModeChange={handleCalendarRangeModeChange}
        onRangeChange={handleCalendarRangeChange}
        onShiftRange={shiftCalendarRange}
        onToday={() => {
          setCalendarRangeSelection(null);
          setCalendarCursor(new Date());
        }}
        onTabChange={(nextTab) => {
          router.replace(tabRouteMap[nextTab]);
        }}
      />

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
      />

      {tab === "calendar" ? (
        <CalendarTab
          loadingChannelIds={[]}
          failedChannelIds={[]}
          calendarRangeMode={calendarRangeMode}
          calendarCursor={calendarCursor}
          calendarFrom={from}
          calendarTo={to}
          calendarDays={calendarDays}
          channels={saleableChannels}
          selectedChannelIds={selectedChannelIds}
          filteredSlots={filteredSlots}
          sales={calendarSalesQuery.data?.items ?? []}
          daySummaries={[]}
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
          loading={salesQuery.isLoading}
          error={salesQuery.error}
          page={salesQuery.data?.pagination.page ?? salesPage}
          pageSize={salesQuery.data?.pagination.pageSize ?? salesPageSize}
          pagination={salesQuery.data?.pagination}
          onPageChange={setSalesPage}
          onPageSizeChange={setSalesPageSize}
          search={saleSearch}
          onSearchChange={setSaleSearch}
          channels={channels}
          settings={settings}
          rates={rates}
          onOpenSale={setSelectedSaleId}
          onDeleteSale={async (sale) => {
            const result = await telegramAdSalesApi.deleteSale(sale.id);
            if (selectedSaleId === sale.id) setSelectedSaleId(null);
            await invalidateTelegramAdSalesQueries(queryClient, {
              saleId: sale.id,
              channelIds: result.channelIds,
            });
          }}
        />
      ) : null}

      {tab === "clients" ? <AdSalesClientsPanel /> : null}

      {tab === "analytics" ? (
        <AdSalesAnalyticsPanel
          selectedChannelIds={effectiveChannelIds}
          selectedNetworkId={selectedNetworkId || null}
          settings={settings}
          rates={rates}
        />
      ) : null}

      <AdSaleModal
        open={adSaleModalOpen}
        onClose={() => setAdSaleModalOpen(false)}
        accounts={accounts as Account[]}
        channels={saleableChannels}
        networks={saleableNetworks as TelegramChannelNetwork[]}
        productsByChannelId={productsByChannelId}
        defaultCurrency={settings?.primaryCurrency || "USD"}
        workspaceTimezone={workspaceTimezone}
        initialChannelId={adSaleSeedSlot?.channelId ?? null}
        initialScheduledAt={adSaleSeedSlot?.scheduledAt ?? null}
        initialInventoryOpportunityKey={
          adSaleSeedSlot?.inventoryOpportunityKey ?? null
        }
        systemBotUsername={systemBotConnectionQuery.data?.botUsername}
        onPrepareSystemBot={async () => {
          const prepared = await telegramSystemBotApi.prepareAdSalePostImport();
          return prepared.workflowId;
        }}
        onSendSystemBotPost={async (draft) => {
          await telegramSystemBotApi.sendAdSalePostPreview({
            title: draft.title,
            text: draft.text,
            imageUrls: draft.imageUrls,
            buttonRows: draft.buttonRows,
          });
        }}
        onSystemBotReturn={async (workflowId, channelIds) => {
          const result =
            await telegramSystemBotApi.adSalePostImportResult(workflowId);
          if (!result.ready) return null;
          await invalidateTelegramAdSalesQueries(queryClient, { channelIds });
          return result.draft;
        }}
        onSearchAdvertisers={(query) =>
          telegramAdSalesApi.searchAdvertisers({ q: query, limit: 5 })
        }
        onRequestQuote={async ({
          channelId,
          productId,
          pricingMode,
          currency,
          scheduledAt,
        }) =>
          telegramAdSalesApi.createQuote(
            {
              telegramChannelId: channelId,
              telegramAdProductId: productId,
              pricingMode,
              currency,
              scheduledAt,
            },
            true,
          )
        }
        onLoadAvailableSlots={async ({ channelId, productId, from, to }) => {
          const result = await telegramAdSalesApi.availability({
            from,
            to,
            channelIds: [channelId],
            ...(productId ? { productIds: [productId] } : {}),
          });
          return result.slots.filter(
            (slot) => slot.state === "AVAILABLE" || slot.state === "PAST",
          );
        }}
        onLoadPublishedPosts={async ({
          channelId,
          date,
          timezone,
          telegramPostUrl,
        }) => {
          const from = zonedDateTimeToUtc(
            date,
            "00:00:00",
            timezone,
          ).toISOString();
          const to = zonedDateTimeToUtc(
            date,
            "23:59:59",
            timezone,
          ).toISOString();
          const telegramMessageId =
            telegramPostUrl?.match(/\/(\d+)(?:[/?#].*)?$/)?.[1];
          const params = {
            page: 1,
            pageSize: 100,
            ...(telegramMessageId
              ? { search: telegramMessageId }
              : { from, to }),
          };
          let result = await getTelegramChannelPosts(channelId, params, true);
          const hasRequestedPost = () =>
            telegramMessageId
              ? result.items.some(
                  (post) =>
                    String(post.telegramMessageId) === telegramMessageId,
                )
              : result.items.length > 0;
          if (!hasRequestedPost()) {
            try {
              await syncTelegramChannelPostMetrics(
                channelId,
                {
                  postLimit: 100,
                },
                true,
              );
              result = await getTelegramChannelPosts(channelId, params, true);
            } catch {
              // Keep the locally stored history available if live Telegram
              // synchronization is unavailable for this connected account.
            }
          }
          const items = telegramMessageId
            ? result.items.filter(
                (post) => String(post.telegramMessageId) === telegramMessageId,
              )
            : result.items;
          return items.map((post) => ({
            id: post.id,
            title:
              post.text?.trim().split("\n").find(Boolean)?.slice(0, 90) ||
              "Telegram post",
            publishedAt: post.postDate,
          }));
        }}
        onSubmit={submitAdSale}
      />

      {paymentSale ? (
        <RegisterPaymentModal
          key={paymentSale.id}
          open
          onClose={() => setPaymentSale(null)}
          sale={paymentSale}
          accounts={accounts as Account[]}
          defaultCurrency={settings?.primaryCurrency || "USD"}
          onSubmit={async (payload) => {
            await telegramAdSalesApi.createPayment(paymentSale.id, payload);
            await refreshSaleAfterMutation(
              paymentSale.id,
              paymentSale.placements.map(
                (placement) => placement.telegramChannelId,
              ),
            );
            setPaymentSale(null);
          }}
        />
      ) : null}

      <SaleDetailsModal
        sale={selectedSale}
        open={Boolean(selectedSaleId)}
        loading={Boolean(selectedSaleId) && !selectedSale}
        onClose={() => setSelectedSaleId(null)}
        accounts={accounts as Account[]}
        channels={channels}
        productsByChannelId={productsByChannelId}
        settings={settings}
        rates={rates}
        onSave={async (sale, draft) => {
          let feedbackStarted = false;
          const silentAfterFirstMutation = () => {
            const silent = feedbackStarted;
            feedbackStarted = true;
            return silent;
          };
          if (
            draft.origin !== sale.origin ||
            draft.assignedMemberId !== sale.assignedMemberId ||
            draft.buyerContact !==
              (sale.advertiserTelegramSnapshot ??
                sale.advertiserTelegram ??
                sale.advertiserContact ??
                sale.advertiserNameSnapshot ??
                sale.advertiserName ??
                "")
          ) {
            const buyerChanged =
              draft.buyerContact !==
              (sale.advertiserTelegramSnapshot ??
                sale.advertiserTelegram ??
                sale.advertiserContact ??
                sale.advertiserNameSnapshot ??
                sale.advertiserName ??
                "");
            await telegramAdSalesApi.updateSale(
              sale.id,
              {
                origin: draft.origin,
                assignedMemberId: draft.assignedMemberId,
                ...(buyerChanged
                  ? {
                      advertiserId: null,
                      advertiserName:
                        draft.buyerContact.replace(/^@/, "") || "Advertiser",
                      advertiserContact: draft.buyerContact || null,
                      advertiserTelegram: draft.buyerContact.startsWith("@")
                        ? draft.buyerContact
                        : null,
                    }
                  : {}),
              },
              silentAfterFirstMutation(),
            );
          }
          const targetCurrency =
            draft.payments[0]?.currency ?? sale.settlementCurrency;
          if (targetCurrency !== sale.settlementCurrency) {
            await telegramAdSalesApi.updateSale(
              sale.id,
              {
                settlementCurrency: targetCurrency,
              },
              silentAfterFirstMutation(),
            );
          }
          for (const placement of draft.placements) {
            await telegramAdSalesApi.updatePlacement(
              sale.id,
              placement.id,
              {
                scheduledAt: placement.scheduledAt,
                timezone: placement.timezone,
                agreedPrice: placement.agreedPrice,
                recommendedPrice: placement.recommendedPrice,
                minimumPrice: placement.minimumPrice,
                currency: placement.currency,
                manualPriceReason: placement.manualPriceReason || null,
                telegramAdProductId: placement.telegramAdProductId,
                managedPostId: placement.managedPostId,
              },
              silentAfterFirstMutation(),
            );
          }
          for (const payment of draft.payments) {
            await telegramAdSalesApi.updatePayment(
              sale.id,
              payment.id,
              {
                accountId: payment.accountId,
                amount: payment.amount,
                currency: payment.currency,
                paidAt: payment.paidAt,
                notes: payment.notes || null,
                allocations: payment.allocations,
              },
              silentAfterFirstMutation(),
            );
          }
          await refreshSaleAfterMutation(
            sale.id,
            sale.placements.map((item) => item.telegramChannelId),
          );
          await queryClient.invalidateQueries({
            queryKey: telegramAdSalesKeys.sale(sale.id),
          });
          await queryClient.invalidateQueries({ queryKey: ["transactions"] });
        }}
        onUpdateSharedPost={async (sale, draft) => {
          const linkedPlacements = sale.placements.filter(
            (placement) => placement.managedPostId,
          );
          if (linkedPlacements.length !== sale.placements.length) {
            throw new Error(
              "Every placement must have a configured post before the shared post can be updated.",
            );
          }
          await Promise.all(
            linkedPlacements.map((placement, index) =>
              telegramChannelsApi.updateManagedPost(
                placement.telegramChannelId,
                placement.managedPostId!,
                {
                  title: draft.title,
                  text: draft.text,
                  imageUrls: draft.imageUrls,
                  buttonRows: draft.buttonRows,
                  inPlaceOnly: true,
                },
                index > 0,
              ),
            ),
          );
          await Promise.all([
            refreshSaleAfterMutation(
              sale.id,
              linkedPlacements.map((placement) => placement.telegramChannelId),
            ),
            ...linkedPlacements.map((placement) =>
              queryClient.invalidateQueries({
                queryKey: telegramPostKeys.managed(
                  placement.telegramChannelId,
                ),
              }),
            ),
          ]);
        }}
        onAction={async (sale, action, placement) => {
          const placementId = placement?.id;
          if (action === "confirm") {
            await telegramAdSalesApi.confirmSale(sale.id);
          } else if (action === "reserve") {
            await telegramAdSalesApi.reserveSale(sale.id, {
              placements: sale.placements.map((item) => ({
                placementId: item.id,
                scheduledAt: item.scheduledAt,
              })),
            });
          } else if (action === "cancel") {
            if (placementId) {
              await telegramAdSalesApi.cancelPlacement(
                sale.id,
                placementId,
                {},
              );
            } else {
              await telegramAdSalesApi.cancelSale(sale.id);
            }
          } else if (action === "register-payment") {
            setPaymentSale(sale);
            setSelectedSaleId(null);
            return;
          } else if (action === "create-post" && placementId) {
            setPostEditorPlacement({ saleId: sale.id, placementId });
            setPostTitle(sale.title || sale.advertiserName);
            setPostText("");
            setPostImages("");
            return;
          } else if (action === "schedule" && placementId) {
            await telegramAdSalesApi.schedulePlacement(
              sale.id,
              placementId,
              {},
            );
          } else if (action === "publish" && placementId) {
            await telegramAdSalesApi.publishPlacement(sale.id, placementId, {});
          } else if (action === "reschedule" && placementId) {
            await telegramAdSalesApi.reschedulePlacement(sale.id, placementId, {
              scheduledAt: placement.scheduledAt,
            });
          } else if (action === "complete-permanent" && placementId) {
            await telegramAdSalesApi.completePermanentPlacement(
              sale.id,
              placementId,
              {},
            );
          }
          await refreshSaleAfterMutation(
            sale.id,
            sale.placements.map((item) => item.telegramChannelId),
          );
          await queryClient.invalidateQueries({
            queryKey: telegramAdSalesKeys.sale(sale.id),
          });
        }}
        onLoadPlacementPosts={async (placement) => {
          const posts = await getAllTelegramChannelPosts(
            placement.telegramChannelId,
          );
          return posts.map((post) => ({
            id: post.id,
            title:
              post.text?.trim().split("\n").find(Boolean)?.slice(0, 90) ||
              `Post ${post.telegramMessageId}`,
            publishedAt: post.postDate,
          }));
        }}
        onAttachPost={async (sale, placement, post) => {
          await telegramAdSalesApi.attachManagedPost(sale.id, placement.id, {
            ...post,
          });
          await refreshSaleAfterMutation(
            sale.id,
            sale.placements.map((item) => item.telegramChannelId),
          );
          await queryClient.invalidateQueries({
            queryKey: telegramAdSalesKeys.sale(sale.id),
          });
        }}
      />

      <Modal
        open={Boolean(pastSlotAssignment)}
        onClose={() => {
          setPastSlotAssignment(null);
          setSelectedPastPostId("");
        }}
        title="Link sold post"
        size="md"
      >
        {pastSlotAssignment ? (
          <div className="space-y-4">
            <p className="text-sm text-neutral-400">
              Choose the real ad post for {pastSlotAssignment.channelTitle} on{" "}
              {pastSlotAssignment.slotDateLabel}.
            </p>
            <FormField label="Published post">
              <Select
                value={selectedPastPostId}
                onChange={(event) => setSelectedPastPostId(event.target.value)}
              >
                {pastSlotAssignment.posts.map((post) => {
                  const label = post.title?.trim() || "Untitled post";
                  return (
                    <option key={post.id} value={post.id}>
                      {post.dateValue
                        ? `${new Date(post.dateValue).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })} · `
                        : ""}
                      {post.kind === "telegram" ? "Post · " : "Managed · "}
                      {label}
                    </option>
                  );
                })}
              </Select>
            </FormField>
            <div className="flex justify-end gap-2">
              <Button
                variant="secondary"
                onClick={() => {
                  setPastSlotAssignment(null);
                  setSelectedPastPostId("");
                }}
              >
                Skip for now
              </Button>
              <Button
                disabled={!selectedPastPostId}
                onClick={async () => {
                  if (!pastSlotAssignment || !selectedPastPostId) return;
                  const current = pastSlotAssignment;
                  const selectedPost = current.posts.find(
                    (post) => post.id === selectedPastPostId,
                  );
                  setPastSlotAssignment(null);
                  setSelectedPastPostId("");
                  await telegramAdSalesApi.attachManagedPost(
                    current.saleId,
                    current.placementId,
                    {
                      ...(selectedPost?.kind === "telegram"
                        ? { telegramPostId: selectedPost.id }
                        : { managedPostId: selectedPost?.id }),
                    },
                  );
                  await telegramAdSalesApi.reconcileSale(current.saleId, true);
                  await invalidateTelegramAdSalesQueries(queryClient, {
                    saleId: current.saleId,
                  });
                }}
              >
                Save
              </Button>
            </div>
          </div>
        ) : null}
      </Modal>

      <Modal
        open={Boolean(postEditorPlacement)}
        onClose={() => setPostEditorPlacement(null)}
        title="Create advertising post"
        size="xl"
      >
        <div className="space-y-4">
          <FormField label="Title">
            <Input
              value={postTitle}
              onChange={(event) => setPostTitle(event.target.value)}
            />
          </FormField>
          <FormField label="Text">
            <Textarea
              rows={8}
              value={postText}
              onChange={(event) => setPostText(event.target.value)}
            />
          </FormField>
          <FormField label="Image URLs">
            <Textarea
              rows={4}
              value={postImages}
              onChange={(event) => setPostImages(event.target.value)}
              placeholder="One URL per line"
            />
          </FormField>
          <div className="flex justify-end gap-2">
            <Button
              variant="secondary"
              onClick={() => setPostEditorPlacement(null)}
            >
              Cancel
            </Button>
            <Button
              onClick={async () => {
                if (!postEditorPlacement) return;
                await telegramAdSalesApi.createManagedPostFromPlacement(
                  postEditorPlacement.saleId,
                  postEditorPlacement.placementId,
                  {
                    title: postTitle,
                    text: postText,
                    imageUrls: postImages
                      .split("\n")
                      .map((value) => value.trim())
                      .filter(Boolean),
                  },
                );
                const saleId = postEditorPlacement.saleId;
                setPostEditorPlacement(null);
                await queryClient.invalidateQueries({
                  queryKey: telegramAdSalesKeys.sale(saleId),
                });
                await queryClient.invalidateQueries({
                  queryKey: telegramAdSalesKeys.root,
                });
              }}
            >
              Create post
            </Button>
          </div>
        </div>
      </Modal>
    </AppShell>
  );
}
