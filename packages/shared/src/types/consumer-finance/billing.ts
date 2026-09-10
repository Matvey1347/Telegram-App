/** Canonical product tier. Storage fidelity must never depend on this value. */
export type ConsumerFinanceTier = "FREE" | "PRO" | "ULTIMATE";

/** Feature gates stay capability-based so clients never infer access from a plan name. */
export type ConsumerFinanceCapability =
  | "AI_INPUT"
  | "VOICE_INPUT"
  | "INTELLIGENT_CATEGORIZATION"
  | "RECEIPT_SCAN"
  | "SMART_LIMITS"
  | "FINANCE_HISTORY_QA"
  | "AI_INSIGHTS"
  | "AI_FORECAST_INTERPRETATION"
  | "AI_RECOMMENDATIONS";

export type ConsumerFinancePlanFeature =
  | "ACCOUNTS"
  | "TRANSACTIONS"
  | "DEBTS"
  | "REGULAR_PAYMENTS"
  | "DETAILED_ANALYTICS"
  | "PERIOD_COMPARISON"
  | "DETERMINISTIC_TRENDS"
  | ConsumerFinanceCapability;

export type ConsumerFinanceUsageFeature =
  | "AI_INPUT"
  | "RECEIPT_SCAN"
  | "AI_INSIGHTS";

export type ConsumerFinanceUsage = {
  feature: ConsumerFinanceUsageFeature;
  /** Successful operations only. */
  used: number;
  /** null denotes no quota. */
  limit: number | null;
  remaining: number | null;
  /** Present for period-based quotas and absent for lifetime/unlimited use. */
  resetAt: string | null;
};

export type ConsumerFinanceEntitlements = {
  tier: ConsumerFinanceTier;
  capabilities: ConsumerFinanceCapability[];
  usage: ConsumerFinanceUsage[];
  activeUntil: string | null;
  cancelAtPeriodEnd: boolean;
};

export type ConsumerBillingCatalog = {
  current: ConsumerFinanceEntitlements;
  plans: Array<{
    id: string | null;
    code: ConsumerFinanceTier;
    capabilities: ConsumerFinanceCapability[];
    features: ConsumerFinancePlanFeature[];
    usageLimits: Record<ConsumerFinanceUsageFeature, number | null>;
    /** Server-authoritative transition eligibility for checkout. */
    canPurchase: boolean;
    prices: Array<{
      id: string;
      currency: string;
      interval: "MONTH" | "YEAR";
      amountMinor: number;
      version: number;
    }>;
  }>;
  subscriptions: Array<{
    id: string;
    source: string;
    status: string;
    currency?: string | null;
    interval?: string | null;
    amountMinor?: number | null;
    currentPeriodEnd?: string | null;
    cancelAtPeriodEnd: boolean;
  }>;
  paymentHistory: Array<{
    id: string;
    status: "SUCCEEDED" | "FAILED";
    provider: "STRIPE" | "TELEGRAM_STARS" | null;
    amountMinor: number | null;
    currency: string | null;
    occurredAt: string;
    planCode: string | null;
  }>;
  providers: Array<{
    provider: "STRIPE" | "TELEGRAM_STARS";
    mode: "TEST" | "LIVE";
    capabilities: { intervals: Array<"MONTH" | "YEAR"> };
  }>;
};

export type ConsumerFinanceRenewalUpdate = {
  id: string;
  cancelAtPeriodEnd: boolean;
  currentPeriodEnd: string | null;
};
