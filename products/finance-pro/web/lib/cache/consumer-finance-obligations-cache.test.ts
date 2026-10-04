import type { InfiniteData } from "@tanstack/react-query";
import { QueryClient } from "@tanstack/react-query";
import { describe, expect, it } from "vitest";
import type {
  ConsumerFinanceDebt,
  ConsumerFinanceDebtPage,
  ConsumerFinanceRegularPayment,
  ConsumerFinanceRegularPaymentPage,
} from "@telegram-system/shared";
import {
  reconcileConsumerDebtPages,
  reconcileConsumerRegularPaymentPages,
} from "./consumer-finance-obligations-cache";
import { consumerFinanceKeys } from "./consumer-finance-query-keys";

const account = {
  id: "account",
  name: "Cash",
  currency: "USD",
  iconPresentation: { type: "unicode" as const, value: "💵" },
};
const debt: ConsumerFinanceDebt = {
  id: "debt",
  direction: "I_OWE",
  status: "OPEN",
  name: "Alex",
  amount: "10",
  currency: "USD",
  accountId: "account",
  account,
  dueAt: "2026-09-10T00:00:00.000Z",
  scheduleTimezone: "UTC",
  isOverdue: false,
  version: 1,
  createdAt: "2026-09-01T00:00:00.000Z",
  updatedAt: "2026-09-01T00:00:00.000Z",
};
const payment: ConsumerFinanceRegularPayment = {
  id: "regular",
  name: "Rent",
  amount: "100",
  currency: "USD",
  accountId: "account",
  account,
  recurrence: "MONTHLY",
  nextOccurrenceAt: "2026-10-01T00:00:00.000Z",
  scheduleTimezone: "UTC",
  status: "ACTIVE",
  isDue: false,
  version: 1,
  createdAt: "2026-09-01T00:00:00.000Z",
  updatedAt: "2026-09-01T00:00:00.000Z",
};

describe("Consumer Finance obligation page caches", () => {
  it("moves an authoritative settled debt between matching cached tabs", () => {
    const client = new QueryClient();
    const openKey = consumerFinanceKeys.debts("bot", { status: "OPEN" });
    const settledKey = consumerFinanceKeys.debts("bot", {
      status: "SETTLED",
    });
    client.setQueryData<InfiniteData<ConsumerFinanceDebtPage>>(openKey, {
      pages: [{ items: [debt], nextCursor: null }],
      pageParams: [undefined],
    });
    client.setQueryData<InfiniteData<ConsumerFinanceDebtPage>>(settledKey, {
      pages: [{ items: [], nextCursor: null }],
      pageParams: [undefined],
    });

    reconcileConsumerDebtPages(client, "bot", {
      ...debt,
      status: "SETTLED",
      settledAt: "2026-09-08T00:00:00.000Z",
    });

    expect(
      client.getQueryData<InfiniteData<ConsumerFinanceDebtPage>>(openKey)
        ?.pages[0]?.items,
    ).toEqual([]);
    expect(
      client.getQueryData<InfiniteData<ConsumerFinanceDebtPage>>(settledKey)
        ?.pages[0]?.items[0]?.status,
    ).toBe("SETTLED");
  });

  it("moves status tabs without touching a revision query", () => {
    const client = new QueryClient();
    const activeKey = consumerFinanceKeys.regularPayments("bot", {
      status: "ACTIVE",
    });
    const pausedKey = consumerFinanceKeys.regularPayments("bot", {
      status: "PAUSED",
    });
    const revisionsKey = consumerFinanceKeys.regularPaymentRevisions(
      "bot",
      "regular",
    );
    client.setQueryData<InfiniteData<ConsumerFinanceRegularPaymentPage>>(
      activeKey,
      {
        pages: [{ items: [payment], nextCursor: null }],
        pageParams: [undefined],
      },
    );
    client.setQueryData<InfiniteData<ConsumerFinanceRegularPaymentPage>>(
      pausedKey,
      { pages: [{ items: [], nextCursor: null }], pageParams: [undefined] },
    );
    client.setQueryData(revisionsKey, { sentinel: true });

    reconcileConsumerRegularPaymentPages(client, "bot", {
      ...payment,
      status: "PAUSED",
    });

    expect(
      client.getQueryData<InfiniteData<ConsumerFinanceRegularPaymentPage>>(
        activeKey,
      )?.pages[0]?.items,
    ).toEqual([]);
    expect(
      client.getQueryData<InfiniteData<ConsumerFinanceRegularPaymentPage>>(
        pausedKey,
      )?.pages[0]?.items[0]?.status,
    ).toBe("PAUSED");
    expect(client.getQueryData(revisionsKey)).toEqual({ sentinel: true });
  });
});
