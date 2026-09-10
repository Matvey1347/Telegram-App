import type { InternalAxiosRequestConfig } from "axios";
import { afterEach, describe, expect, it } from "vitest";
import { consumerFinanceHttp } from "./consumer-finance-http";
import { consumerFinanceObligationsApi } from "./consumer-finance-obligations-api";

const originalAdapter = consumerFinanceHttp.defaults.adapter;

afterEach(() => {
  consumerFinanceHttp.defaults.adapter = originalAdapter;
});

describe("consumerFinanceObligationsApi", () => {
  it("uses the exact debt collection, update and settlement contracts", async () => {
    const requests: InternalAxiosRequestConfig[] = [];
    consumerFinanceHttp.defaults.adapter = async (config) => {
      requests.push(config);
      return { data: {}, status: 200, statusText: "OK", headers: {}, config };
    };
    const input = {
      direction: "I_OWE" as const,
      name: "Alex",
      amount: "42",
      accountId: "cash",
      dueDate: "2026-09-10",
      note: null,
    };

    await consumerFinanceObligationsApi.debts("bot", { status: "OPEN" });
    await consumerFinanceObligationsApi.createDebt("bot", input);
    await consumerFinanceObligationsApi.updateDebt("bot", "debt", input);
    await consumerFinanceObligationsApi.settleDebt("bot", "debt");

    expect(requests.map(({ method, url }) => [method, url])).toEqual([
      ["get", "/finance-bots/bot/debts"],
      ["post", "/finance-bots/bot/debts"],
      ["patch", "/finance-bots/bot/debts/debt"],
      ["post", "/finance-bots/bot/debts/debt/settle"],
    ]);
    expect(requests[0]?.params).toEqual({ status: "OPEN" });
    expect(JSON.parse(String(requests[3]?.data))).toEqual({});
  });

  it("uses exact regular-payment occurrence and revision contracts", async () => {
    const requests: InternalAxiosRequestConfig[] = [];
    consumerFinanceHttp.defaults.adapter = async (config) => {
      requests.push(config);
      return { data: {}, status: 200, statusText: "OK", headers: {}, config };
    };

    const input = {
      name: "Rent",
      amount: "100",
      accountId: "cash",
      categoryId: null,
      recurrence: "MONTHLY" as const,
      nextPaymentDate: "2026-10-01",
      note: null,
    };
    await consumerFinanceObligationsApi.regularPayments("bot", {
      status: "ACTIVE",
    });
    await consumerFinanceObligationsApi.createRegularPayment("bot", input);
    await consumerFinanceObligationsApi.updateRegularPayment(
      "bot",
      "rent",
      input,
    );
    await consumerFinanceObligationsApi.confirmRegularPayment("bot", "rent", {
      expectedOccurrenceAt: "2026-09-08T08:00:00.000Z",
      expectedVersion: 3,
      amount: "125",
    });
    await consumerFinanceObligationsApi.regularPaymentRevisions("bot", "rent", {
      cursor: "cursor",
      limit: 30,
    });
    await consumerFinanceObligationsApi.applyOccurrenceAmount(
      "bot",
      "rent",
      "occurrence",
      { expectedVersion: 7 },
    );
    await consumerFinanceObligationsApi.pauseRegularPayment("bot", "rent");
    await consumerFinanceObligationsApi.resumeRegularPayment("bot", "rent");
    await consumerFinanceObligationsApi.cancelRegularPayment("bot", "rent");

    expect(requests.map(({ method, url }) => [method, url])).toEqual([
      ["get", "/finance-bots/bot/regular-payments"],
      ["post", "/finance-bots/bot/regular-payments"],
      ["patch", "/finance-bots/bot/regular-payments/rent"],
      ["post", "/finance-bots/bot/regular-payments/rent/confirm"],
      ["get", "/finance-bots/bot/regular-payments/rent/revisions"],
      [
        "post",
        "/finance-bots/bot/regular-payments/rent/occurrences/occurrence/apply-amount",
      ],
      ["post", "/finance-bots/bot/regular-payments/rent/pause"],
      ["post", "/finance-bots/bot/regular-payments/rent/resume"],
      ["post", "/finance-bots/bot/regular-payments/rent/cancel"],
    ]);
    expect(requests[0]?.params).toEqual({ status: "ACTIVE" });
    expect(JSON.parse(String(requests[1]?.data))).toEqual(input);
    expect(JSON.parse(String(requests[2]?.data))).toEqual(input);
    expect(JSON.parse(String(requests[3]?.data))).toEqual({
      expectedOccurrenceAt: "2026-09-08T08:00:00.000Z",
      expectedVersion: 3,
      amount: "125",
    });
    expect(requests[4]?.params).toEqual({ cursor: "cursor", limit: 30 });
    expect(JSON.parse(String(requests[5]?.data))).toEqual({
      expectedVersion: 7,
    });
    for (const index of [6, 7, 8]) {
      expect(JSON.parse(String(requests[index]?.data))).toEqual({});
    }
  });
});
