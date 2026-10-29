import { describe, expect, it } from "vitest";
import { writeFinanceRateCache } from "@finance-web/groshly/rate-cache";
import {
  groshlyDebtInput,
  groshlyIdentityScope,
  groshlySnapshot,
} from "./groshly-finance-app";

const base = {
  profile: {
    defaultCurrency: "PLN",
    classifyExpenses: true,
    splitExpenses: false,
    defaultExpenseCategoryId: "category-1",
    defaultIncomeCategoryId: null,
    timezone: "Europe/Warsaw",
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
  it("uses the last confirmed rates after reopening the PWA", () => {
    writeFinanceRateCache({ rates: { UAH: 1, PLN: 11.2, USD: 42, EUR: 49 }, rateDate: "2026-10-28" });
    const snapshot = groshlySnapshot(base) as { rates: Record<string, number>; rateSource: string };
    expect(snapshot.rates.PLN).toBe(11.2);
    expect(snapshot.rateSource).toBe("cached");
    localStorage.removeItem("finance-fx-rates-v1");
  });
  it("maps persisted classification and default-category settings into the app snapshot", () => {
    const snapshot = groshlySnapshot(base) as Record<string, unknown>;
    expect(snapshot).toMatchObject({
      classifyExpenses: true,
      splitExpenses: false,
      defaultExpenseCategoryId: "category-1",
      defaultIncomeCategoryId: null,
    });
  });
  it("isolates persisted snapshots by Telegram user", () => {
    expect(groshlyIdentityScope("user=%7B%22id%22%3A42%7D&hash=signed")).toBe(
      "telegram-user:42",
    );
    expect(groshlyIdentityScope("hash=missing-user")).toBe("unverified");
  });
  it("retains economic amount, purpose, and recorded recurrence for analytics", () => {
    const snapshot = groshlySnapshot({
      ...base,
      transactions: {
        items: [{
          id: "transaction-1",
          accountId: "account-1",
          categoryId: "category-1",
          type: "EXPENSE" as const,
          purpose: "ORDINARY" as const,
          amount: "50",
          economicAmount: "40",
          recurringPaymentId: "regular-1",
          currency: "PLN",
          occurredAt: "2026-10-24T10:00:00Z",
        }],
      },
    }) as { transactions: Array<Record<string, unknown>> };
    expect(snapshot.transactions[0]).toMatchObject({
      purpose: "ORDINARY",
      amount: 50,
      economicAmount: 40,
      recurringId: "regular-1",
    });
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
              iconPresentation: { type: "unicode", value: "🤝" },
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

describe("Groshly debt API input", () => {
  it("maps the debt form to the persisted API contract", () => {
    expect(
      groshlyDebtInput({
        direction: "owe",
        name: "  Alex  ",
        emoji: "🚗",
        amount: 250,
        accountId: "account-1",
        due: "2026-11-01",
        notes: "Personal loan",
      }),
    ).toEqual({
      direction: "I_OWE",
      name: "Alex",
      emoji: "🚗",
      amount: "250",
      accountId: "account-1",
      recordTransaction: true,
      dueDate: "2026-11-01",
      note: "Personal loan",
    });
  });

  it("keeps a debt off the account when the form toggle is off", () => {
    expect(groshlyDebtInput({
      direction: "owed", name: "Item", amount: "20",
      accountId: "account-1", due: "2026-11-01", recordTransaction: false,
    }).recordTransaction).toBe(false);
  });
});
