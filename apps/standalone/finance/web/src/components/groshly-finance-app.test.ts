import { describe, expect, it } from "vitest";
import { groshlyIdentityScope, groshlySnapshot } from "./groshly-finance-app";

const base = {
  profile: {
    defaultCurrency: "PLN",
    locale: "uk" as const,
    telegramUser: { displayName: "Matvey", username: null, avatarUrl: null },
  },
  dashboard: {},
  accounts: [
    {
      id: "account-1",
      name: "Card",
      iconPresentation: { type: "unicode", value: "💳" },
      type: "CARD" as const,
      currency: "PLN",
      balance: "100",
    },
  ],
  categories: [
    {
      id: "category-1",
      name: "Home",
      type: "EXPENSE" as const,
      iconPresentation: { type: "unicode", value: "🏠" },
    },
  ],
  transactions: { items: [] },
};

describe("groshlySnapshot", () => {
  it("isolates persisted snapshots by Telegram user", () => {
    expect(groshlyIdentityScope("user=%7B%22id%22%3A42%7D&hash=signed")).toBe(
      "telegram-user:42",
    );
    expect(groshlyIdentityScope("hash=missing-user")).toBe("unverified");
  });
  it("keeps server debts, regular payments, and investments visible", () => {
    const snapshot = groshlySnapshot({
      ...base,
      obligations: {
        debts: {
          nextCursor: null,
          items: [
            {
              id: "debt-1",
              direction: "I_OWE",
              status: "OPEN",
              name: "Alex",
              amount: "25",
              currency: "PLN",
              accountId: "account-1",
              account: {} as never,
              dueAt: "2026-10-25T00:00:00.000Z",
              scheduleTimezone: "Europe/Warsaw",
              isOverdue: false,
              version: 1,
              createdAt: "2026-10-01T00:00:00.000Z",
              updatedAt: "2026-10-01T00:00:00.000Z",
            },
          ],
        },
        regularPayments: {
          nextCursor: null,
          items: [
            {
              id: "regular-1",
              name: "Internet",
              iconPresentation: { type: "unicode", value: "🌐" },
              amount: "50",
              currency: "PLN",
              accountId: "account-1",
              account: {} as never,
              categoryId: "category-1",
              recurrence: "MONTHLY",
              nextOccurrenceAt: "2026-11-01T00:00:00.000Z",
              scheduleTimezone: "Europe/Warsaw",
              status: "ACTIVE",
              isDue: false,
              version: 1,
              createdAt: "2026-10-01T00:00:00.000Z",
              updatedAt: "2026-10-01T00:00:00.000Z",
            },
          ],
        },
        investments: {
          nextCursor: null,
          items: [
            {
              id: "investment-1",
              name: "ETF",
              type: "SECURITIES",
              currency: "PLN",
              status: "ACTIVE",
              startedAt: "2026-01-01T00:00:00.000Z",
              totalInvested: "500",
              totalReturned: "20",
              currentValue: "560",
              profitLoss: "80",
              returnPercentage: 16,
              createdAt: "2026-01-01T00:00:00.000Z",
              updatedAt: "2026-10-01T00:00:00.000Z",
            },
          ],
        },
      },
    }) as { recurring: unknown[]; debts: unknown[]; investments: unknown[] };

    expect(snapshot.recurring).toHaveLength(1);
    expect(snapshot.debts).toHaveLength(1);
    expect(snapshot.investments).toHaveLength(1);
  });
});
