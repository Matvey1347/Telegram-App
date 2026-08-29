import { describe, expect, it, vi } from "vitest";
import { QueryClient } from "@tanstack/react-query";
import type { TelegramAdSale } from "@telegram-system/shared";
import {
  invalidateTelegramAdSalesDerivedQueries,
  reconcileTelegramAdSaleCache,
  telegramAdSalesKeys,
} from "./telegram-ad-sales-query";

function sale(
  id: string,
  status = "DRAFT",
  advertiserId = "advertiser-1",
) {
  return { id, status, advertiserId } as TelegramAdSale;
}

function page(items: TelegramAdSale[], pageNumber: number, totalItems = items.length) {
  return {
    items,
    pagination: {
      page: pageNumber,
      pageSize: 2,
      totalItems,
      totalPages: Math.ceil(totalItems / 2),
      hasNextPage: pageNumber < Math.ceil(totalItems / 2),
      hasPreviousPage: pageNumber > 1,
    },
  };
}

describe("telegram-ad-sales cache reconciliation", () => {
  it("keeps server search and page two as distinct list scopes", () => {
    const firstPage = telegramAdSalesKeys.list({ page: 1, pageSize: 50, search: "Acme" });
    const matchingSecondPage = telegramAdSalesKeys.list({ page: 2, pageSize: 50, search: "Acme" });
    const differentSearch = telegramAdSalesKeys.list({ page: 2, pageSize: 50, search: "Beta" });

    expect(matchingSecondPage).not.toEqual(firstPage);
    expect(matchingSecondPage).not.toEqual(differentSearch);
  });

  it("creates only in matching page-one scopes and never inserts into page two", () => {
    const queryClient = new QueryClient();
    const firstDrafts = telegramAdSalesKeys.list({ page: 1, pageSize: 2, status: "DRAFT" });
    const secondDrafts = telegramAdSalesKeys.list({ page: 2, pageSize: 2, status: "DRAFT" });
    const firstConfirmed = telegramAdSalesKeys.list({ page: 1, pageSize: 2, status: "CONFIRMED" });
    queryClient.setQueryData(firstDrafts, page([sale("old")], 1, 3));
    queryClient.setQueryData(secondDrafts, page([sale("older")], 2, 3));
    queryClient.setQueryData(firstConfirmed, page([], 1, 0));

    reconcileTelegramAdSaleCache(queryClient, {
      type: "create",
      sale: sale("new"),
    });

    expect(queryClient.getQueryData(firstDrafts)).toMatchObject({
      items: [{ id: "new" }, { id: "old" }],
      pagination: { totalItems: 4, totalPages: 2 },
    });
    expect(queryClient.getQueryData(secondDrafts)).toMatchObject({
      items: [{ id: "older" }],
      pagination: { totalItems: 3 },
    });
    expect(queryClient.getQueryData(firstConfirmed)).toMatchObject({
      items: [],
      pagination: { totalItems: 0 },
    });
  });

  it("refetches searched scopes instead of guessing create membership", () => {
    const queryClient = new QueryClient();
    const searched = telegramAdSalesKeys.list({
      page: 1,
      pageSize: 2,
      search: "Acme",
    });
    const current = page([sale("old")], 1, 1);
    queryClient.setQueryData(searched, current);
    const invalidate = vi.spyOn(queryClient, "invalidateQueries");

    reconcileTelegramAdSaleCache(queryClient, {
      type: "create",
      sale: sale("unrelated"),
    });

    expect(queryClient.getQueryData(searched)).toEqual(current);
    expect(invalidate).toHaveBeenCalledWith({ queryKey: searched, exact: true });
  });

  it("updates only containing rows and removes rows that leave a filter", () => {
    const queryClient = new QueryClient();
    const firstDrafts = telegramAdSalesKeys.list({ page: 1, status: "DRAFT" });
    const secondDrafts = telegramAdSalesKeys.list({ page: 2, status: "DRAFT" });
    const confirmed = telegramAdSalesKeys.list({ page: 1, status: "CONFIRMED" });
    queryClient.setQueryData(firstDrafts, page([sale("sale-1")], 1, 3));
    queryClient.setQueryData(secondDrafts, page([sale("sale-2")], 2, 3));
    queryClient.setQueryData(confirmed, page([], 1, 0));

    const updated = sale("sale-1", "CONFIRMED");
    reconcileTelegramAdSaleCache(queryClient, { type: "update", sale: updated });

    expect(queryClient.getQueryData(firstDrafts)).toMatchObject({
      items: [],
      pagination: { totalItems: 2, totalPages: 1 },
    });
    expect(queryClient.getQueryData(secondDrafts)).toMatchObject({
      items: [{ id: "sale-2" }],
      pagination: { totalItems: 3 },
    });
    expect(queryClient.getQueryData(confirmed)).toMatchObject({
      items: [],
      pagination: { totalItems: 0 },
    });
    expect(queryClient.getQueryData(telegramAdSalesKeys.detail("sale-1"))).toBe(updated);
  });

  it("respects advertiser filters for create and update membership", () => {
    const queryClient = new QueryClient();
    const advertiserOne = telegramAdSalesKeys.list({ page: 1, advertiserId: "advertiser-1" });
    const advertiserTwo = telegramAdSalesKeys.list({ page: 1, advertiserId: "advertiser-2" });
    queryClient.setQueryData(advertiserOne, page([], 1, 0));
    queryClient.setQueryData(advertiserTwo, page([], 1, 0));

    reconcileTelegramAdSaleCache(queryClient, { type: "create", sale: sale("sale-1") });

    expect(queryClient.getQueryData(advertiserOne)).toMatchObject({ items: [{ id: "sale-1" }] });
    expect(queryClient.getQueryData(advertiserTwo)).toMatchObject({ items: [] });
  });

  it("deletes only containing rows, totals and exact detail", () => {
    const queryClient = new QueryClient();
    const first = telegramAdSalesKeys.list({ page: 1 });
    const second = telegramAdSalesKeys.list({ page: 2 });
    queryClient.setQueryData(first, page([sale("sale-1"), sale("sale-2")], 1, 3));
    queryClient.setQueryData(second, page([sale("sale-3")], 2, 3));
    queryClient.setQueryData(telegramAdSalesKeys.detail("sale-1"), sale("sale-1"));

    reconcileTelegramAdSaleCache(queryClient, { type: "delete", saleId: "sale-1" });

    expect(queryClient.getQueryData(first)).toMatchObject({
      items: [{ id: "sale-2" }],
      pagination: { totalItems: 2, totalPages: 1 },
    });
    expect(queryClient.getQueryData(second)).toMatchObject({
      items: [{ id: "sale-3" }],
      pagination: { totalItems: 3 },
    });
    expect(queryClient.getQueryData(telegramAdSalesKeys.detail("sale-1"))).toBeUndefined();
  });
});

describe("telegram-ad-sales derived invalidation", () => {
  it("invalidates exactly ordinary sale-derived data", async () => {
    const invalidateQueries = vi.fn().mockResolvedValue(undefined);
    await invalidateTelegramAdSalesDerivedQueries({ invalidateQueries } as never, {
      availability: true,
      analytics: true,
    });

    expect(invalidateQueries.mock.calls.map(([request]) => request.queryKey)).toEqual([
      ["telegram-ad-availability"],
      ["telegram-ad-analytics"],
    ]);
  });

  it("adds finance, dashboard and channel effects only when requested", async () => {
    const invalidateQueries = vi.fn().mockResolvedValue(undefined);
    await invalidateTelegramAdSalesDerivedQueries({ invalidateQueries } as never, {
      finance: true,
      dashboard: true,
      managedPosts: true,
      channelSummaries: true,
      channelIds: ["channel-1", "channel-1"],
    });

    expect(invalidateQueries.mock.calls.map(([request]) => request.queryKey)).toEqual([
      ["dashboard-summary"],
      ["transactions"],
      ["accounts"],
      ["telegram-managed-posts-calendar", "channel-1"],
      ["telegram-managed-posts", "channel-1", "list"],
      ["telegram-channel-financial-summary", "channel-1"],
      ["telegram-channel-analytics", "channel-1"],
    ]);
  });
});
