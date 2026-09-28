import { QueryClient } from "@tanstack/react-query";
import { describe, expect, it } from "vitest";
import type { Account } from "@/lib/api";
import { accountKeys } from "@/lib/query-keys";
import { patchFinanceAccountCache } from "./account-cache";

const account = {
  id: "account-1",
  name: "Cash",
  currency: "UAH",
  initialBalance: 0,
  isActive: true,
  balance: 125,
  iconPresentation: { type: "unicode", value: "💵" },
} as Account;

describe("patchFinanceAccountCache", () => {
  it("patches account references without invalidating unrelated Finance lists", () => {
    const client = new QueryClient();
    client.setQueryData([...accountKeys.accounts(), "overview"], {
      items: [account],
      pagination: {},
    });
    client.setQueryData([...accountKeys.transactions(), "overview"], {
      items: [{ id: "transaction-1", account }],
      pagination: {},
    });

    patchFinanceAccountCache(client, {
      ...account,
      iconPresentation: { type: "unicode", value: "🏦" },
    });

    const accounts = client.getQueryData<{ items: Account[] }>([
      ...accountKeys.accounts(),
      "overview",
    ]);
    const transactions = client.getQueryData<{ items: Array<{ account: Account }> }>([
      ...accountKeys.transactions(),
      "overview",
    ]);
    expect(accounts?.items[0]).toMatchObject({ balance: 125, iconPresentation: { value: "🏦" } });
    expect(transactions?.items[0].account.iconPresentation).toMatchObject({ value: "🏦" });
  });
});
