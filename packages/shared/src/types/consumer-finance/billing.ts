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
  | "DEEP_ANALYTICS"
  | "ITEM_ANALYTICS"
  | "MERCHANT_PATTERNS"
  | "AUTOMATIC_INSIGHTS"
  | "ANOMALY_DETECTION"
  | "FINANCIAL_FORECAST";

export type ConsumerFinanceUsageFeature = "AI_INPUT" | "RECEIPT_SCAN";

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
  plans: Array<{
    id: string;
    code: string;
    name: string;
    description?: string | null;
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
  providers: Array<{
    provider: "STRIPE" | "TELEGRAM_STARS";
    mode: "TEST" | "LIVE";
    capabilities: { intervals: Array<"MONTH" | "YEAR"> };
  }>;
};
