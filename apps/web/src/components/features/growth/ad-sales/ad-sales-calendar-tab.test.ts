import { describe, expect, it } from "vitest";
import {
  formatCalendarTransactionMoney,
  calendarDealAmount,
  calendarSaleAmounts,
  calendarAdvertiserAvatarUrl,
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

describe("calendarSaleAmounts", () => {
  it("uses the received total from Deals instead of the agreed slot prices", () => {
    const totals = calendarSaleAmounts([
      {
        currency: "UAH",
        existingPlacement: {
          id: "placement-1",
          saleId: "sale-1",
          agreedPrice: "189.70",
          saleAgreedAmount: "189.70",
          saleReceivedAmount: "310.00",
          currency: "UAH",
        },
      },
      {
        currency: "UAH",
        existingPlacement: {
          id: "placement-2",
          saleId: "sale-2",
          agreedPrice: "354.60",
          saleAgreedAmount: "354.60",
          saleReceivedAmount: "340.00",
          currency: "UAH",
        },
      },
      {
        currency: "UAH",
        existingPlacement: {
          id: "placement-3",
          saleId: "sale-3",
          agreedPrice: "354.60",
          saleAgreedAmount: "354.60",
          saleReceivedAmount: "400.00",
          currency: "UAH",
        },
      },
    ] as never);

    expect(
      [...totals.values()].reduce((sum, item) => sum + item.amount, 0),
    ).toBe(1050);
  });

  it("uses every unique placement when an older calendar response has no sale aggregate", () => {
    const totals = calendarSaleAmounts([
      {
        currency: "UAH",
        existingPlacement: {
          id: "placement-1",
          saleId: "sale-1",
          agreedPrice: "189.70",
          currency: "UAH",
        },
      },
      {
        currency: "UAH",
        existingPlacement: {
          id: "placement-2",
          saleId: "sale-1",
          agreedPrice: "120.30",
          currency: "UAH",
        },
      },
      // Calendar slot materialization can encounter the same placement again;
      // it must not count it twice.
      {
        currency: "UAH",
        existingPlacement: {
          id: "placement-1",
          saleId: "sale-1",
          agreedPrice: "189.70",
          currency: "UAH",
        },
      },
    ] as never);

    expect(totals.get("sale-1")).toEqual({ amount: 310, currency: "UAH" });
  });
});

describe("calendarAdvertiserAvatarUrl", () => {
  it("uses the persisted CRM photo before a public Telegram fallback", () => {
    expect(
      calendarAdvertiserAvatarUrl("https://cdn.example/a20.jpg", "A20_admin"),
    ).toBe("https://cdn.example/a20.jpg");
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
