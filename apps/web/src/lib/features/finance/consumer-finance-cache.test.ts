import { QueryClient } from "@tanstack/react-query";
import { describe, expect, it } from "vitest";
import { consumerFinanceKeys } from "./consumer-finance-query-keys";
import {
  removeConsumerTransactionFromCaches,
  reconcileConsumerTransactionCaches,
} from "./consumer-finance-cache";

describe("consumer Finance transaction cache", () => {
  it("reconciles only transaction lists whose filters still match", () => {
    const client = new QueryClient();
    const expenseKey = consumerFinanceKeys.transactions("bot-1", {
      type: "EXPENSE",
      accountId: "a",
      search: "coffee",
    });
    const incomeKey = consumerFinanceKeys.transactions("bot-1", {
      type: "INCOME",
    });
    const row = {
      id: "one",
      accountId: "a",
      type: "EXPENSE",
      amount: "5",
      currency: "USD",
      occurredAt: "2026-08-21T12:00:00.000Z",
      description: "Coffee",
    } as const;
    client.setQueryData(expenseKey, {
      pageParams: [undefined],
      pages: [{ items: [row], nextCursor: null }],
    });
    client.setQueryData(incomeKey, {
      pageParams: [undefined],
      pages: [{ items: [], nextCursor: null }],
    });

    reconcileConsumerTransactionCaches(client, "bot-1", {
      ...row,
      type: "INCOME",
      description: "Salary",
    });

    expect(
      client.getQueryData<{ pages: Array<{ items: unknown[] }> }>(expenseKey)
        ?.pages[0].items,
    ).toEqual([]);
    expect(
      client.getQueryData<{ pages: Array<{ items: Array<{ id: string }> }> }>(
        incomeKey,
      )?.pages[0].items[0].id,
    ).toBe("one");
  });

  it("updates a transaction on a later page without duplicating it on page one", () => {
    const client = new QueryClient();
    const key = consumerFinanceKeys.transactions("bot-1", {});
    const row = {
      id: "one",
      accountId: "a",
      type: "EXPENSE",
      amount: "5",
      currency: "USD",
      occurredAt: "2026-08-21T12:00:00.000Z",
      description: "Old",
    } as const;
    client.setQueryData(key, {
      pageParams: [undefined, "next"],
      pages: [
        { items: [], nextCursor: "next" },
        { items: [row], nextCursor: null },
      ],
    });
    reconcileConsumerTransactionCaches(client, "bot-1", {
      ...row,
      description: "New",
    });
    const pages = client.getQueryData<{
      pages: Array<{ items: Array<{ description?: string }> }>;
    }>(key)!.pages;
    expect(pages[0].items).toEqual([]);
    expect(pages[1].items).toEqual([
      expect.objectContaining({ description: "New" }),
    ]);
  });

  it("moves an edited transaction across loaded pages when occurredAt changes", () => {
    const client = new QueryClient();
    const key = consumerFinanceKeys.transactions("bot-1", {});
    const old = {
      id: "old",
      accountId: "a",
      type: "EXPENSE",
      amount: "1",
      currency: "USD",
      occurredAt: "2026-08-01T12:00:00.000Z",
    } as const;
    const recent = {
      ...old,
      id: "recent",
      occurredAt: "2026-08-20T12:00:00.000Z",
    };
    client.setQueryData(key, {
      pageParams: [undefined, "next"],
      pages: [
        { items: [recent], nextCursor: "next" },
        { items: [old], nextCursor: null },
      ],
    });
    reconcileConsumerTransactionCaches(client, "bot-1", {
      ...old,
      occurredAt: "2026-08-21T12:00:00.000Z",
    });
    const pages = client.getQueryData<{
      pages: Array<{
        items: Array<{ id: string }>;
        nextCursor: string | null;
      }>;
    }>(key)!.pages;
    expect(pages[0].items[0].id).toBe("old");
    expect(pages[1].items[0].id).toBe("recent");
    expect(pages[0].nextCursor).toBe("old");
  });

  it("matches date filters in the profile timezone", () => {
    const client = new QueryClient();
    const key = consumerFinanceKeys.transactions("bot-1", {
      from: "2026-08-21",
      to: "2026-08-21",
    });
    client.setQueryData(key, {
      pageParams: [undefined],
      pages: [{ items: [], nextCursor: null }],
    });
    reconcileConsumerTransactionCaches(
      client,
      "bot-1",
      {
        id: "local-day",
        accountId: "a",
        type: "EXPENSE",
        amount: "1",
        currency: "USD",
        occurredAt: "2026-08-20T22:00:00.000Z",
      },
      "Pacific/Kiritimati",
    );
    expect(
      client.getQueryData<{ pages: Array<{ items: unknown[] }> }>(key)?.pages[0]
        .items,
    ).toHaveLength(1);
  });

  it("removes a deleted transaction from every loaded Mini App history page", () => {
    const client = new QueryClient();
    const key = consumerFinanceKeys.transactions("bot-1", { limit: 30 });
    client.setQueryData(key, {
      pageParams: [undefined],
      pages: [
        { items: [{ id: "one" }, { id: "two" }], nextCursor: "next" },
        { items: [{ id: "two" }, { id: "three" }], nextCursor: null },
      ],
    });

    removeConsumerTransactionFromCaches(client, "bot-1", "two");

    expect(client.getQueryData(key)).toMatchObject({
      pages: [{ items: [{ id: "one" }] }, { items: [{ id: "three" }] }],
    });
  });
});
