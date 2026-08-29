"use client";

import type { QueryClient, QueryKey } from "@tanstack/react-query";
import type {
  TelegramAdSale,
  TelegramAdSaleListItem,
} from "@telegram-system/shared";
import type { PaginatedResponse } from "../../api-types";
import {
  accountKeys,
  dashboardKeys,
  telegramChannelKeys,
  telegramPostKeys,
} from "../../query-keys";

type AdSalesListParams = {
  page?: number;
  pageSize?: number;
  status?: string;
  advertiserId?: string;
  search?: string;
  [key: string]: unknown;
};

export const telegramAdSalesKeys = {
  listRoot: () => ["telegram-ad-sales", "sales"] as const,
  list: (params?: AdSalesListParams) =>
    [...telegramAdSalesKeys.listRoot(), params ?? {}] as const,
  detailRoot: () => ["telegram-ad-sale"] as const,
  detail: (saleId: string) =>
    [...telegramAdSalesKeys.detailRoot(), saleId] as const,
  crmRoot: () => ["telegram-ad-sales", "crm"] as const,
  crmAdvertisersRoot: () =>
    [...telegramAdSalesKeys.crmRoot(), "advertisers"] as const,
  crmAdvertisers: (params?: Record<string, unknown>) =>
    [...telegramAdSalesKeys.crmAdvertisersRoot(), params ?? {}] as const,
  settingsRoot: () => ["telegram-ad-sales", "settings"] as const,
  workspaceSettings: () =>
    [...telegramAdSalesKeys.settingsRoot(), "workspace"] as const,
  preferences: () =>
    [...telegramAdSalesKeys.settingsRoot(), "preferences"] as const,
  availabilityRoot: () => ["telegram-ad-availability"] as const,
  availability: (params: Record<string, unknown>) =>
    [...telegramAdSalesKeys.availabilityRoot(), params] as const,
  products: (params?: Record<string, unknown>) =>
    ["telegram-ad-products", params ?? {}] as const,
  channelProducts: (channelId: string) =>
    ["telegram-ad-products", "channel", channelId] as const,
  productsByChannels: (channelIds: string[]) =>
    ["telegram-ad-products", "channels", [...channelIds].sort()] as const,
  channelSetup: (channelId: string) =>
    ["telegram-ad-sales", "channel-setup", channelId] as const,
  policy: (channelId: string) => ["telegram-ad-policy", channelId] as const,
  baseline: (channelId: string) => ["telegram-ad-baseline", channelId] as const,
  priceHistory: (channelId: string, params?: Record<string, unknown>) =>
    ["telegram-ad-price-history", channelId, params ?? {}] as const,
  analyticsRoot: () => ["telegram-ad-analytics"] as const,
  analytics: (params?: Record<string, unknown>) =>
    [...telegramAdSalesKeys.analyticsRoot(), params ?? {}] as const,
  analyticsOverview: (params?: Record<string, unknown>) =>
    [...telegramAdSalesKeys.analyticsRoot(), "overview", params ?? {}] as const,
  analyticsSummary: (params?: Record<string, unknown>) =>
    [...telegramAdSalesKeys.analyticsRoot(), "summary", params ?? {}] as const,
  channelAnalytics: (channelId: string, params?: Record<string, unknown>) =>
    [
      ...telegramAdSalesKeys.analyticsRoot(),
      "channel",
      channelId,
      params ?? {},
    ] as const,
  networkAnalytics: (networkId: string, params?: Record<string, unknown>) =>
    [
      ...telegramAdSalesKeys.analyticsRoot(),
      "network",
      networkId,
      params ?? {},
    ] as const,
  revenueSeries: (params?: Record<string, unknown>) =>
    [
      ...telegramAdSalesKeys.analyticsRoot(),
      "revenue-series",
      params ?? {},
    ] as const,
  pricingSeries: (params?: Record<string, unknown>) =>
    [
      ...telegramAdSalesKeys.analyticsRoot(),
      "pricing-series",
      params ?? {},
    ] as const,
  inventory: (params?: Record<string, unknown>) =>
    [...telegramAdSalesKeys.analyticsRoot(), "inventory", params ?? {}] as const,
  alerts: (params?: Record<string, unknown>) =>
    [...telegramAdSalesKeys.analyticsRoot(), "alerts", params ?? {}] as const,
} as const;

function listParams(queryKey: QueryKey): AdSalesListParams {
  const params = queryKey[2];
  return params && typeof params === "object"
    ? (params as AdSalesListParams)
    : {};
}

function saleMatchesList(sale: TelegramAdSale, params: AdSalesListParams) {
  if (params.status && sale.status !== params.status) return false;
  if (params.advertiserId && sale.advertiserId !== params.advertiserId) {
    return false;
  }
  return true;
}

function withTotalDelta(
  current: PaginatedResponse<TelegramAdSaleListItem>,
  delta: number,
) {
  const totalItems = Math.max(0, current.pagination.totalItems + delta);
  const totalPages = Math.ceil(totalItems / current.pagination.pageSize);
  return {
    ...current.pagination,
    totalItems,
    totalPages,
    hasNextPage: current.pagination.page < totalPages,
    hasPreviousPage: current.pagination.page > 1,
  };
}

export type TelegramAdSaleCacheChange =
  | { type: "create"; sale: TelegramAdSale }
  | { type: "update"; sale: TelegramAdSale }
  | { type: "delete"; saleId: string };

/** Reconciles only pages whose membership is knowable from the cached row. */
export function reconcileTelegramAdSaleCache(
  queryClient: QueryClient,
  change: TelegramAdSaleCacheChange,
) {
  if (change.type === "delete") {
    queryClient.removeQueries({
      queryKey: telegramAdSalesKeys.detail(change.saleId),
      exact: true,
    });
  } else {
    queryClient.setQueryData(
      telegramAdSalesKeys.detail(change.sale.id),
      change.sale,
    );
  }

  for (const [queryKey, current] of queryClient.getQueriesData<
    PaginatedResponse<TelegramAdSaleListItem>
  >({ queryKey: telegramAdSalesKeys.listRoot() })) {
    if (!current?.items) continue;
    const params = listParams(queryKey);
    const saleId = change.type === "delete" ? change.saleId : change.sale.id;
    const existingIndex = current.items.findIndex((item) => item.id === saleId);

    if (change.type === "delete") {
      if (existingIndex < 0) continue;
      queryClient.setQueryData(queryKey, {
        ...current,
        items: current.items.filter((item) => item.id !== saleId),
        pagination: withTotalDelta(current, -1),
      });
      continue;
    }

    if (params.search?.trim()) {
      void queryClient.invalidateQueries({ queryKey, exact: true });
      continue;
    }

    const matches = saleMatchesList(change.sale, params);
    if (existingIndex >= 0) {
      queryClient.setQueryData(queryKey, {
        ...current,
        items: matches
          ? current.items.map((item) =>
              item.id === change.sale.id ? change.sale : item,
            )
          : current.items.filter((item) => item.id !== change.sale.id),
        pagination: matches
          ? current.pagination
          : withTotalDelta(current, -1),
      });
      continue;
    }

    if (change.type !== "create" || !matches || (params.page ?? 1) !== 1) {
      continue;
    }
    queryClient.setQueryData(queryKey, {
      ...current,
      items: [change.sale, ...current.items].slice(
        0,
        current.pagination.pageSize,
      ),
      pagination: withTotalDelta(current, 1),
    });
  }
}

export type TelegramAdSalesDerivedEffects = {
  availability?: boolean;
  analytics?: boolean;
  finance?: boolean;
  dashboard?: boolean;
  managedPosts?: boolean;
  channelSummaries?: boolean;
  channelIds?: string[];
};

export async function invalidateTelegramAdSaleReads(
  queryClient: QueryClient,
  options: { saleId?: string; lists?: boolean },
) {
  await Promise.all([
    ...(options.saleId
      ? [
          queryClient.invalidateQueries({
            queryKey: telegramAdSalesKeys.detail(options.saleId),
            exact: true,
          }),
        ]
      : []),
    ...(options.lists
      ? [
          queryClient.invalidateQueries({
            queryKey: telegramAdSalesKeys.listRoot(),
          }),
        ]
      : []),
  ]);
}

/** Invalidates server-derived read models only; list/detail rows are reconciled separately. */
export async function invalidateTelegramAdSalesDerivedQueries(
  queryClient: QueryClient,
  effects: TelegramAdSalesDerivedEffects,
) {
  const channelIds = [...new Set(effects.channelIds ?? [])];
  const invalidations = [
    ...(effects.availability
      ? [telegramAdSalesKeys.availabilityRoot()]
      : []),
    ...(effects.analytics ? [telegramAdSalesKeys.analyticsRoot()] : []),
    ...(effects.dashboard ? [dashboardKeys.summary()] : []),
    ...(effects.finance
      ? [accountKeys.transactions(), accountKeys.accounts()]
      : []),
    ...(effects.managedPosts
      ? channelIds.flatMap((channelId) => [
          telegramPostKeys.managedCalendar(channelId),
          telegramPostKeys.managedLists(channelId),
        ])
      : []),
    ...(effects.channelSummaries
      ? channelIds.flatMap((channelId) => [
          telegramChannelKeys.financialSummary(channelId),
          telegramChannelKeys.analytics(channelId),
        ])
      : []),
  ];
  await Promise.all(
    invalidations.map((queryKey) => queryClient.invalidateQueries({ queryKey })),
  );
}
