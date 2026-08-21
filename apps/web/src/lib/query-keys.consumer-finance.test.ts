import { describe, expect, it } from "vitest";
import { consumerFinanceKeys } from "./query-keys";

describe("consumerFinanceKeys", () => {
  it("keeps history caches distinct for filter combinations", () => {
    expect(
      consumerFinanceKeys.transactions("bot-1", { limit: 30, type: "EXPENSE" }),
    ).not.toEqual(
      consumerFinanceKeys.transactions("bot-1", { limit: 30, type: "INCOME" }),
    );
  });

  it("keeps derived finance resources in dedicated key families", () => {
    expect(consumerFinanceKeys.session("bot-1")).toEqual([
      "consumer-finance",
      "bot-1",
      "session",
    ]);
    expect(consumerFinanceKeys.limits("bot-1")).toEqual([
      "consumer-finance",
      "bot-1",
      "limits",
    ]);
    expect(consumerFinanceKeys.reminders("bot-1")).toEqual([
      "consumer-finance",
      "bot-1",
      "reminders",
    ]);
    expect(consumerFinanceKeys.settings("bot-1")).toEqual([
      "consumer-finance",
      "bot-1",
      "settings",
    ]);
    expect(consumerFinanceKeys.browserLoginConfig("bot-1")).toEqual([
      "consumer-finance",
      "bot-1",
      "browser-login-config",
    ]);
    expect(consumerFinanceKeys.entitlements("bot-1")).toEqual([
      "consumer-finance",
      "bot-1",
      "entitlements",
    ]);
    expect(consumerFinanceKeys.transaction("bot-1", "transaction-1")).toEqual([
      "consumer-finance",
      "bot-1",
      "transaction",
      "transaction-1",
    ]);
  });

  it("keeps analytics periods in separate cache entries", () => {
    expect(
      consumerFinanceKeys.analytics("bot-1", { period: "CURRENT_MONTH" }),
    ).not.toEqual(
      consumerFinanceKeys.analytics("bot-1", { period: "PREVIOUS_MONTH" }),
    );
  });

  it("keeps transfer filters isolated under a dedicated list prefix", () => {
    expect(
      consumerFinanceKeys.transfers("bot-1", { accountId: "a" }),
    ).not.toEqual(consumerFinanceKeys.transfers("bot-1", { accountId: "b" }));
    expect(consumerFinanceKeys.transferLists("bot-1")).toEqual([
      "consumer-finance",
      "bot-1",
      "transfers",
    ]);
  });
});
