import type { InternalAxiosRequestConfig } from "axios";
import { afterEach, describe, expect, it } from "vitest";
import { consumerFinanceHttp } from "./consumer-finance-http";
import { consumerFinanceSavingsGoalsApi } from "./consumer-finance-savings-goals-api";
import { consumerFinanceInvestmentsApi } from "./consumer-finance-investments-api";

const originalAdapter = consumerFinanceHttp.defaults.adapter;
afterEach(() => {
  consumerFinanceHttp.defaults.adapter = originalAdapter;
});

function capture() {
  const requests: InternalAxiosRequestConfig[] = [];
  consumerFinanceHttp.defaults.adapter = async (config) => {
    requests.push(config);
    return { data: {}, status: 200, statusText: "OK", headers: {}, config };
  };
  return requests;
}

describe("Consumer Finance asset APIs", () => {
  it("uses the canonical savings goal routes", async () => {
    const requests = capture();
    const movement = {
      accountId: "cash",
      amount: "10",
      occurredAt: "2026-09-08T12:00:00.000Z",
      idempotencyKey: "allocation-1",
    };
    await consumerFinanceSavingsGoalsApi.list("bot", {
      status: "ACTIVE",
      limit: 100,
    });
    await consumerFinanceSavingsGoalsApi.create("bot", {
      name: "Trip",
      targetAmount: "100",
      currency: "USD",
    });
    await consumerFinanceSavingsGoalsApi.allocate("bot", "trip", movement);
    await consumerFinanceSavingsGoalsApi.release("bot", "trip", movement);
    await consumerFinanceSavingsGoalsApi.reallocate("bot", {
      ...movement,
      fromGoalId: "trip",
      toGoalId: "home",
    });
    await consumerFinanceSavingsGoalsApi.complete("bot", "trip");
    await consumerFinanceSavingsGoalsApi.archive("bot", "trip");
    await consumerFinanceSavingsGoalsApi.history("bot", "trip", {
      cursor: "next",
      limit: 30,
    });
    expect(requests.map(({ method, url }) => [method, url])).toEqual([
      ["get", "/finance-bots/bot/savings-goals"],
      ["post", "/finance-bots/bot/savings-goals"],
      ["post", "/finance-bots/bot/savings-goals/trip/allocate"],
      ["post", "/finance-bots/bot/savings-goals/trip/release"],
      ["post", "/finance-bots/bot/savings-goals/reallocate"],
      ["post", "/finance-bots/bot/savings-goals/trip/complete"],
      ["post", "/finance-bots/bot/savings-goals/trip/archive"],
      ["get", "/finance-bots/bot/savings-goals/trip/history"],
    ]);
    expect(requests[0]?.params).toEqual({ status: "ACTIVE", limit: 100 });
  });

  it("uses the canonical investment routes with summary before detail", async () => {
    const requests = capture();
    const cash = {
      kind: "CONTRIBUTION" as const,
      accountId: "cash",
      amount: "10",
      occurredAt: "2026-09-08T12:00:00.000Z",
      idempotencyKey: "flow-1",
    };
    await consumerFinanceInvestmentsApi.list("bot", { limit: 100 });
    await consumerFinanceInvestmentsApi.summary("bot");
    await consumerFinanceInvestmentsApi.get("bot", "asset");
    await consumerFinanceInvestmentsApi.addCashFlow("bot", "asset", cash);
    await consumerFinanceInvestmentsApi.addValuation("bot", "asset", {
      value: "12",
      valuedAt: cash.occurredAt,
      idempotencyKey: "value-1",
    });
    await consumerFinanceInvestmentsApi.close("bot", "asset", {
      closedAt: cash.occurredAt,
      idempotencyKey: "close-1",
    });
    await consumerFinanceInvestmentsApi.archive("bot", "asset");
    expect(requests.map(({ method, url }) => [method, url])).toEqual([
      ["get", "/finance-bots/bot/investments"],
      ["get", "/finance-bots/bot/investments/summary"],
      ["get", "/finance-bots/bot/investments/asset"],
      ["post", "/finance-bots/bot/investments/asset/cash-flows"],
      ["post", "/finance-bots/bot/investments/asset/valuations"],
      ["post", "/finance-bots/bot/investments/asset/close"],
      ["post", "/finance-bots/bot/investments/asset/archive"],
    ]);
  });
});
