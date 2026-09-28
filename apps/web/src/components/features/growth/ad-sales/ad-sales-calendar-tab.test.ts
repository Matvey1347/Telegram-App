import { describe, expect, it } from "vitest";
import {
  formatCalendarTransactionMoney,
  calendarDealAmount,
  groupCalendarSoldSlotsBySale,
} from "./ad-sales-calendar-tab";

describe("formatCalendarTransactionMoney", () => {
  it("returns only the transaction currency without converted variants", () => {
    const label = formatCalendarTransactionMoney(60, "UAH");

    expect(label).toBe("60.00 UAH");
    expect(label).not.toContain("USD");
    expect(label).not.toContain("PLN");
    expect(label).not.toContain("/");
  });
});

describe("calendarDealAmount", () => {
  it("uses the same deal total and settlement currency as Deals", () => {
    expect(
      calendarDealAmount(
        {
          agreedPrice: "189.70",
          currency: "USD",
          saleAgreedAmount: "310.00",
          settlementCurrency: "UAH",
        },
        "USD",
      ),
    ).toEqual({ amount: 310, currency: "UAH" });
  });
});

describe("groupCalendarSoldSlotsBySale", () => {
  it("renders one calendar item for every deal instead of every channel", () => {
    const entries = [
      {
        channelId: "channel-1",
        slot: { existingPlacement: { saleId: "sale-1" } },
      },
      {
        channelId: "channel-2",
        slot: { existingPlacement: { saleId: "sale-1" } },
      },
      {
        channelId: "channel-3",
        slot: { existingPlacement: { saleId: "sale-2" } },
      },
    ];

    expect(groupCalendarSoldSlotsBySale(entries)).toEqual([
      { saleId: "sale-1", entries: entries.slice(0, 2) },
      { saleId: "sale-2", entries: entries.slice(2) },
    ]);
  });
});
