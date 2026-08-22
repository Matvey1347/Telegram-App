import { QueryClient } from "@tanstack/react-query";
import { describe, expect, it } from "vitest";
import { accountKeys } from "@/lib/query-keys";
import {
  removeTransactionFromCaches,
  restoreTransactionCacheSnapshots,
} from "./transaction-cache";

describe("internal transaction cache helpers", () => {
  it("removes a deleted transaction from every loaded list and restores it on failure", () => {
    const client = new QueryClient();
    const recentKey = [...accountKeys.transactions(), { sort: "date_desc" }];
    const filteredKey = [...accountKeys.transactions(), { type: "expense" }];
    client.setQueryData(recentKey, [{ id: "one" }, { id: "two" }]);
    client.setQueryData(filteredKey, [{ id: "two" }]);
    const snapshots = client.getQueriesData({
      queryKey: accountKeys.transactions(),
    });

    removeTransactionFromCaches(client, "two");

    expect(client.getQueryData(recentKey)).toEqual([{ id: "one" }]);
    expect(client.getQueryData(filteredKey)).toEqual([]);

    restoreTransactionCacheSnapshots(client, snapshots);
    expect(client.getQueryData(recentKey)).toEqual([
      { id: "one" },
      { id: "two" },
    ]);
  });
});
