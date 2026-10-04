import { describe, expect, it } from "vitest";
import { nativeAdSalePayment } from "./ad-sale-native-payment";

describe("nativeAdSalePayment", () => {
  it("uses the linked payment currency for a compact sale row", () => {
    expect(
      nativeAdSalePayment({
        settlementCurrency: "USD",
        totalPaidAmount: "650",
        paymentSummary: { amount: "650", currency: "UAH" },
      }),
    ).toEqual({ amount: 650, currency: "UAH" });
  });
});
