import { QueryClient } from "@tanstack/react-query";
import { describe, expect, it } from "vitest";
import type { ConsumerFinanceTransfer } from "@telegram-system/shared";
import { consumerFinanceKeys } from "@/lib/query-keys";
import { reconcileConsumerTransferCaches } from "./transfer-cache";

const transfer: ConsumerFinanceTransfer = {
  id: "t",
  fromAccountId: "a",
  toAccountId: "b",
  fromAmount: "10",
  toAmount: "9",
  fromCurrency: "USD",
  toCurrency: "EUR",
  exchangeRate: "0.9",
  occurredAt: "2026-08-21T12:00:00.000Z",
  description: "Rent",
  fromAccount: { id: "a", name: "Cash", currency: "USD" },
  toAccount: { id: "b", name: "Card", currency: "EUR" },
};

describe("transfer cache", () => {
  it("removes edited transfers from filters they no longer match", () => {
    const client = new QueryClient();
    const rentKey = consumerFinanceKeys.transfers("bot", {
      accountId: "a",
      search: "rent",
    });
    const salaryKey = consumerFinanceKeys.transfers("bot", {
      search: "salary",
    });
    client.setQueryData(rentKey, {
      pageParams: [undefined],
      pages: [{ items: [transfer], nextCursor: null }],
    });
    client.setQueryData(salaryKey, {
      pageParams: [undefined],
      pages: [{ items: [], nextCursor: null }],
    });
    reconcileConsumerTransferCaches(client, "bot", {
      ...transfer,
      fromAccountId: "c",
      fromAccount: { id: "c", name: "Bank", currency: "USD" },
      description: "Salary",
    });
    expect(
      client.getQueryData<{ pages: Array<{ items: unknown[] }> }>(rentKey)
        ?.pages[0].items,
    ).toEqual([]);
    expect(
      client.getQueryData<{ pages: Array<{ items: Array<{ id: string }> }> }>(
        salaryKey,
      )?.pages[0].items[0].id,
    ).toBe("t");
  });

  it("does not duplicate a transfer that is already on a later page", () => {
    const client = new QueryClient();
    const key = consumerFinanceKeys.transfers("bot", {});
    client.setQueryData(key, {
      pageParams: [undefined, "next"],
      pages: [
        { items: [], nextCursor: "next" },
        { items: [transfer], nextCursor: null },
      ],
    });
    reconcileConsumerTransferCaches(client, "bot", {
      ...transfer,
      description: "Updated",
    });
    const pages = client.getQueryData<{
      pages: Array<{ items: Array<{ description?: string }> }>;
    }>(key)!.pages;
    expect(pages[0].items).toEqual([]);
    expect(pages[1].items).toEqual([
      expect.objectContaining({ description: "Updated" }),
    ]);
  });

  it("reorders loaded pages after an occurredAt edit", () => {
    const client = new QueryClient();
    const key = consumerFinanceKeys.transfers("bot", {});
    const recent = {
      ...transfer,
      id: "recent",
      occurredAt: "2026-08-20T12:00:00.000Z",
    };
    client.setQueryData(key, {
      pageParams: [undefined, "next"],
      pages: [
        { items: [recent], nextCursor: "next" },
        {
          items: [{ ...transfer, occurredAt: "2026-08-01T12:00:00.000Z" }],
          nextCursor: null,
        },
      ],
    });
    reconcileConsumerTransferCaches(client, "bot", {
      ...transfer,
      occurredAt: "2026-08-21T12:00:00.000Z",
    });
    const pages = client.getQueryData<{
      pages: Array<{
        items: Array<{ id: string }>;
        nextCursor: string | null;
      }>;
    }>(key)!.pages;
    expect(pages[0].items[0].id).toBe("t");
    expect(pages[1].items[0].id).toBe("recent");
    expect(pages[0].nextCursor).toBe("t");
  });
});
