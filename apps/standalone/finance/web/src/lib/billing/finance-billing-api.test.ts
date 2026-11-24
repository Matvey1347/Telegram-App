import { describe, expect, it, vi } from "vitest";
import { financeBillingApi } from "./finance-billing-api";

const api = vi.hoisted(() => ({ billing: vi.fn(), checkout: vi.fn() }));
vi.mock("@consumer-finance/web/lib/api/consumer-finance-planning-api", () => ({
  consumerFinancePlanningApi: api,
}));

describe("Groshly billing", () => {
  it("uses the signed-in consumer's catalog and sends the server price to Stripe Checkout", async () => {
    api.billing.mockResolvedValue({
      current: { tier: "FREE" },
      subscriptions: [],
      paymentHistory: [],
      providers: [{ provider: "STRIPE", mode: "TEST" }],
      plans: [
        {
          code: "PRO",
          canPurchase: true,
          prices: [
            {
              id: "monthly",
              currency: "UAH",
              interval: "MONTH",
              intervalCount: 1,
              version: 2,
              amountMinor: 17900,
            },
          ],
        },
      ],
    });
    const catalog = await financeBillingApi.get("finance-bot");
    expect(catalog.offers).toMatchObject([
      { code: "MONTH", available: true, mode: "TEST" },
    ]);
    await financeBillingApi.checkout(
      "finance-bot",
      catalog.offers[0].id,
      catalog.offers[0].mode,
    );
    expect(api.billing).toHaveBeenCalledWith("finance-bot");
    expect(api.checkout).toHaveBeenCalledWith(
      "finance-bot",
      "STRIPE",
      "monthly",
      "TEST",
    );
  });
});
