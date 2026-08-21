import { QueryClient } from "@tanstack/react-query";
import { describe, expect, it } from "vitest";
import { accountKeys, consumerFinanceKeys } from "@/lib/query-keys";
import {
  removeConsumerTransactionFromCaches,
  removeTransactionFromCaches,
  restoreTransactionCacheSnapshots,
} from "./transaction-cache";

describe("transaction cache helpers", () => {
  it("removes a deleted transaction from every loaded internal list and restores it on failure", () => {
    const client = new QueryClient();
    const recentKey = [...accountKeys.transactions(), { sort: "date_desc" }];
    const filteredKey = [...accountKeys.transactions(), { type: "expense" }];
    client.setQueryData(recentKey, [{ id: "one" }, { id: "two" }]);
    client.setQueryData(filteredKey, [{ id: "two" }]);
    const snapshots = client.getQueriesData({ queryKey: accountKeys.transactions() });

    removeTransactionFromCaches(client, "two");

    expect(client.getQueryData(recentKey)).toEqual([{ id: "one" }]);
    expect(client.getQueryData(filteredKey)).toEqual([]);

    restoreTransactionCacheSnapshots(client, snapshots);
    expect(client.getQueryData(recentKey)).toEqual([{ id: "one" }, { id: "two" }]);
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
      pages: [
        { items: [{ id: "one" }] },
        { items: [{ id: "three" }] },
      ],
    });
  });
});
