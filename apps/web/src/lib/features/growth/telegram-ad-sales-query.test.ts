import { describe, expect, it, vi } from "vitest";
import { QueryClient } from "@tanstack/react-query";
import {
  invalidateTelegramAdSalesQueries,
  upsertTelegramAdSaleInCache,
} from "./telegram-ad-sales-query";

describe("telegram-ad-sales query invalidation", () => {
  it("invalidates sale, dashboard, finance and channel queries", async () => {
    const invalidateQueries = vi.fn().mockResolvedValue(undefined);
    const queryClient = {
      invalidateQueries,
    } as never;

    await invalidateTelegramAdSalesQueries(queryClient, {
      saleId: "sale-1",
      channelIds: ["channel-1"],
    });

    expect(invalidateQueries).toHaveBeenCalledWith({
      queryKey: ["telegram-ad-sales"],
    });
    expect(invalidateQueries).toHaveBeenCalledWith({
      queryKey: ["telegram-ad-analytics"],
    });
    expect(invalidateQueries).toHaveBeenCalledWith({
      queryKey: ["telegram-ad-sale", "sale-1"],
    });
    expect(invalidateQueries).toHaveBeenCalledWith({
      queryKey: ["dashboard-summary"],
    });
    expect(invalidateQueries).toHaveBeenCalledWith({
      queryKey: ["transactions"],
    });
    expect(invalidateQueries).toHaveBeenCalledWith({
      queryKey: ["telegram-managed-posts-calendar", "channel-1"],
    });
  });
});

describe("upsertTelegramAdSaleInCache", () => {
  it("adds a newly created paid sale to calendar/list caches immediately", () => {
    const queryClient = new QueryClient();
    const queryKey = ["telegram-ad-sales", "sales", { scope: "calendar" }];
    queryClient.setQueryData(queryKey, {
      items: [],
      pagination: {
        page: 1,
        pageSize: 100,
        totalItems: 0,
        totalPages: 0,
        hasNextPage: false,
        hasPreviousPage: false,
      },
    });
    const sale = { id: "sale-1", placements: [], payments: [] } as never;

    upsertTelegramAdSaleInCache(queryClient, sale);

    expect(queryClient.getQueryData(queryKey)).toMatchObject({
      items: [{ id: "sale-1" }],
      pagination: { totalItems: 1 },
    });
  });
});
