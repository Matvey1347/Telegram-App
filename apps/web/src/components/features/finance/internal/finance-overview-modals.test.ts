import { describe, expect, it } from "vitest";
import type { Account, Transfer } from "@/lib/api";
import { financeOptionIcon, mergeTransferAccounts } from "./finance-overview-modals";

const account = (id: string, name: string): Account => ({
  id, name, currency: "UAH", initialBalance: 0, isActive: true,
});

describe("mergeTransferAccounts", () => {
  it("keeps referenced accounts selectable while editing an old transfer", () => {
    const active = account("active", "Active account");
    const archived = account("archived", "Archived account");
    const transfer = {
      id: "transfer", fromAccountId: archived.id, toAccountId: active.id,
      fromAmount: 10, toAmount: 10, fromCurrency: "UAH", toCurrency: "UAH",
      date: "2026-08-21", fromAccount: archived, toAccount: active,
    } as Transfer;

    expect(mergeTransferAccounts([active], transfer).map((item) => item.id)).toEqual([
      "active", "archived",
    ]);
  });

  it("does not duplicate accounts already present in the active list", () => {
    const first = account("first", "First");
    const second = account("second", "Second");
    const transfer = { fromAccount: first, toAccount: second } as Transfer;
    expect(mergeTransferAccounts([first, second], transfer)).toHaveLength(2);
  });
});

describe("financeOptionIcon", () => {
  it("passes unicode emoji metadata to the shared select", () => {
    expect(financeOptionIcon({
      name: "Ukraine Card",
      iconPresentation: { type: "unicode", value: "🇺🇦", name: "Ukraine" },
    })).toMatchObject({
      "data-icon-emoji": "🇺🇦",
      "data-icon-fallback": "Ukraine Card",
    });
  });

  it("passes image metadata to the shared select", () => {
    expect(financeOptionIcon({
      name: "Account",
      iconPresentation: { type: "image", id: "icon", url: "https://cdn.example/icon.jpg" },
    })["data-icon-url"]).toBe("https://cdn.example/icon.jpg");
  });
});
