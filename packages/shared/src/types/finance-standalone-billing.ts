/** Public Finance product access is independent from the Stripe billing period. */
export type FinanceStandaloneTier = "FREE" | "PLUS";

export type FinanceStandaloneOfferCode =
  | "INTRO"
  | "MONTH"
  | "QUARTER"
  | "YEAR";

export type FinanceStandaloneBillingCatalog = {
  tier: FinanceStandaloneTier;
  activeUntil: string | null;
  cancelAtPeriodEnd: boolean;
  offers: Array<{
    code: FinanceStandaloneOfferCode;
    amountMinor: number;
    currency: "UAH";
    /** Human-readable duration; the INTRO offer renews at the monthly price. */
    intervalLabel: string;
    introNextAmountMinor?: number;
    available: boolean;
  }>;
  subscription: {
    id: string;
    status: "ACTIVE" | "PAST_DUE" | "CANCELED" | "INCOMPLETE";
    source: "STRIPE" | "GIFT" | "LEGACY";
    offerCode: FinanceStandaloneOfferCode | null;
    currentPeriodEnd: string | null;
    cancelAtPeriodEnd: boolean;
  } | null;
  history: Array<{
    id: string;
    kind: "PAYMENT_SUCCEEDED" | "PAYMENT_FAILED" | "REFUND" | "CHARGEBACK";
    amountMinor: number;
    currency: string;
    cashAmountMinor: number;
    bonusAmountMinor: number;
    occurredAt: string;
  }>;
};

export type FinanceStandaloneCheckoutRequest = {
  offerCode: FinanceStandaloneOfferCode;
};

export type FinanceStandaloneCheckoutResponse = { url: string };
