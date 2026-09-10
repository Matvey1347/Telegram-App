import { describe, expect, it } from "vitest";
import type { ConsumerBillingCatalog } from "@telegram-system/shared";
import { consumerFinanceOffersForPlan } from "./finance-consumer-billing-format";

describe("consumerFinanceOffersForPlan", () => {
  it("keeps Stripe month and year while respecting the Stars month capability", () => {
    const plan: ConsumerBillingCatalog["plans"][number] = {
      id: "pro",
      code: "PRO",
      capabilities: [],
      features: [],
      usageLimits: { AI_INPUT: null, RECEIPT_SCAN: 30, AI_INSIGHTS: 0 },
      canPurchase: true,
      prices: [
        {
          id: "stripe-month",
          currency: "UAH",
          interval: "MONTH",
          amountMinor: 14900,
          version: 1,
        },
        {
          id: "stripe-year",
          currency: "UAH",
          interval: "YEAR",
          amountMinor: 149000,
          version: 1,
        },
        {
          id: "stars-month",
          currency: "XTR",
          interval: "MONTH",
          amountMinor: 250,
          version: 1,
        },
        {
          id: "stars-year",
          currency: "XTR",
          interval: "YEAR",
          amountMinor: 2500,
          version: 1,
        },
      ],
    };
    const providers: ConsumerBillingCatalog["providers"] = [
      {
        provider: "STRIPE",
        mode: "LIVE",
        capabilities: { intervals: ["MONTH", "YEAR"] },
      },
      {
        provider: "TELEGRAM_STARS",
        mode: "LIVE",
        capabilities: { intervals: ["MONTH"] },
      },
    ];

    expect(
      consumerFinanceOffersForPlan(plan, providers).map((offer) => [
        offer.provider.provider,
        offer.price.id,
      ]),
    ).toEqual([
      ["STRIPE", "stripe-month"],
      ["STRIPE", "stripe-year"],
      ["TELEGRAM_STARS", "stars-month"],
    ]);
  });
});
