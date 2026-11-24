import { consumerFinancePlanningApi } from "@consumer-finance/web/lib/api/consumer-finance-planning-api";
import type { FinanceStandaloneOfferCode } from "@telegram-system/shared";

export type FinanceBillingOfferCode = FinanceStandaloneOfferCode;

const offerCodes = ["INTRO", "MONTH", "QUARTER", "YEAR"] as const;
export const financeBillingApi = {
  async get(botId: string) {
    const catalog = await consumerFinancePlanningApi.billing(botId);
    const stripe = catalog.providers.filter(
      (provider) => provider.provider === "STRIPE",
    );
    const mode = stripe.some((provider) => provider.mode === "TEST")
      ? "TEST"
      : stripe[0]?.mode;
    const plan = catalog.plans.find((item) => item.code === "PRO");
    const monthly = plan?.prices.find(
      (price) =>
        price.currency === "UAH" &&
        price.interval === "MONTH" &&
        price.intervalCount === 1,
    );
    const offers = offerCodes.flatMap((code) => {
      const price = plan?.prices.find(
        (item) =>
          item.currency === "UAH" &&
          (code === "INTRO"
            ? item.interval === "DAY"
            : code === "YEAR"
              ? item.interval === "YEAR"
              : item.interval === "MONTH" &&
                item.intervalCount === (code === "QUARTER" ? 3 : 1)),
      );
      return price
        ? [
            {
              ...price,
              code,
              mode,
              available: Boolean(
                mode &&
                plan?.canPurchase &&
                price.version > 0 &&
                price.available !== false,
              ),
              introNextAmountMinor:
                code === "INTRO" ? monthly?.amountMinor : undefined,
            },
          ]
        : [];
    });
    return {
      tier: catalog.current.tier === "FREE" ? "FREE" : "PLUS",
      activeUntil: catalog.current.activeUntil,
      cancelAtPeriodEnd: catalog.current.cancelAtPeriodEnd,
      activeAccess: catalog.activeAccess,
      hasOverduePayment: catalog.subscriptions.some(
        (item) => item.source === "STRIPE" && item.status === "PAST_DUE",
      ),
      offers,
      history: catalog.paymentHistory,
    };
  },
  checkout: (botId: string, priceId: string, mode?: "TEST" | "LIVE") =>
    consumerFinancePlanningApi.checkout(botId, "STRIPE", priceId, mode),
  portal: consumerFinancePlanningApi.paymentPortal,
  changePlan: consumerFinancePlanningApi.changePlan,
  cancel: consumerFinancePlanningApi.cancelAutoRenew,
  resume: consumerFinancePlanningApi.resumeAutoRenew,
};
