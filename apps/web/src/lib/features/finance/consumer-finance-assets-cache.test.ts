import { QueryClient } from "@tanstack/react-query";
import { describe, expect, it } from "vitest";
import type {
  ConsumerFinanceInvestment,
  ConsumerFinanceSavingsGoal,
} from "@telegram-system/shared";
import { consumerFinanceKeys } from "./consumer-finance-query-keys";
import {
  patchInvestmentMutation,
  patchSavingsMutation,
} from "./consumer-finance-assets-cache";

const goal: ConsumerFinanceSavingsGoal = {
  id: "trip",
  name: "Trip",
  targetAmount: "100",
  currency: "USD",
  status: "ACTIVE",
  currentAllocated: "10",
  linkedAllocated: "10",
  legacyUnlinkedAmount: "0",
  backedAmount: "10",
  remainingAmount: "90",
  progressPercentage: 10,
  fundingStatus: "BACKED",
  createdAt: "2026-09-01",
  updatedAt: "2026-09-01",
};
const investment: ConsumerFinanceInvestment = {
  id: "asset",
  name: "Studio",
  type: "BUSINESS",
  currency: "USD",
  status: "ACTIVE",
  startedAt: "2026-09-01",
  totalInvested: "10",
  totalReturned: "0",
  currentValue: "12",
  profitLoss: "2",
  returnPercentage: 20,
  createdAt: "2026-09-01",
  updatedAt: "2026-09-01",
};

describe("Consumer Finance asset cache reconciliation", () => {
  it("patches authoritative savings list and detail without invalidating the product root", () => {
    const client = new QueryClient();
    const listKey = consumerFinanceKeys.savingsGoals("bot");
    client.setQueryData(listKey, {
      items: [{ ...goal, currentAllocated: "0" }],
      nextCursor: null,
    });
    patchSavingsMutation(client, "bot", { goals: [goal], duplicate: false });
    expect(
      client.getQueryData<{ items: ConsumerFinanceSavingsGoal[] }>(listKey)
        ?.items[0].currentAllocated,
    ).toBe("10");
    expect(
      client.getQueryState(consumerFinanceKeys.root("bot"))?.isInvalidated,
    ).not.toBe(true);
  });

  it("patches investment economics and only invalidates derived/history families", () => {
    const client = new QueryClient();
    const listKey = consumerFinanceKeys.investments("bot");
    client.setQueryData(listKey, {
      items: [{ ...investment, currentValue: "0" }],
      nextCursor: null,
    });
    patchInvestmentMutation(client, "bot", { investment, duplicate: false });
    expect(
      client.getQueryData<{ items: ConsumerFinanceInvestment[] }>(listKey)
        ?.items[0].currentValue,
    ).toBe("12");
    expect(
      client.getQueryState(consumerFinanceKeys.root("bot"))?.isInvalidated,
    ).not.toBe(true);
  });
});
