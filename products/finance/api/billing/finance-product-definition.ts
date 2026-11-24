import type {
  ConsumerFinanceCapability,
  ConsumerFinancePlanFeature,
  ConsumerFinanceTier,
} from "@telegram-system/shared";

export const FINANCE_TIERS = ["FREE", "PRO", "ULTIMATE"] as const;
export type FinanceTier = (typeof FINANCE_TIERS)[number];

const BASE_FEATURES = [
  "ACCOUNTS",
  "TRANSACTIONS",
  "DEBTS",
  "REGULAR_PAYMENTS",
  "DETAILED_ANALYTICS",
  "PERIOD_COMPARISON",
  "DETERMINISTIC_TRENDS",
] as const satisfies readonly ConsumerFinancePlanFeature[];

const PRO_CAPABILITIES = [
  "AI_INPUT",
  "VOICE_INPUT",
  "INTELLIGENT_CATEGORIZATION",
  "RECEIPT_SCAN",
  "SMART_LIMITS",
] as const satisfies readonly ConsumerFinanceCapability[];

const ULTIMATE_CAPABILITIES = [
  ...PRO_CAPABILITIES,
  "FINANCE_HISTORY_QA",
  "AI_INSIGHTS",
  "AI_FORECAST_INTERPRETATION",
  "AI_RECOMMENDATIONS",
] as const satisfies readonly ConsumerFinanceCapability[];

export const FINANCE_CAPABILITIES = [
  ...new Set([...PRO_CAPABILITIES, ...ULTIMATE_CAPABILITIES]),
] as ConsumerFinanceCapability[];

type FinanceProductDefinition = {
  tier: ConsumerFinanceTier;
  name: string;
  price: {
    amountMinor: number;
    currency: "UAH";
    interval: "DAY" | "MONTH" | "YEAR";
    intervalCount: number;
  } | null;
  prices?: readonly {
    amountMinor: number;
    currency: "UAH";
    interval: "DAY" | "MONTH" | "YEAR";
    intervalCount: number;
  }[];
  capabilities: readonly ConsumerFinanceCapability[];
  features: readonly ConsumerFinancePlanFeature[];
  usageLimits: {
    AI_INPUT: number | null;
    RECEIPT_SCAN: number | null;
    AI_INSIGHTS: number | null;
  };
  usagePeriods: Record<
    "AI_INPUT" | "RECEIPT_SCAN" | "AI_INSIGHTS",
    "LIFETIME" | "MONTH" | "UNLIMITED"
  >;
};

export const FINANCE_PRODUCT_DEFINITIONS: Record<
  ConsumerFinanceTier,
  FinanceProductDefinition
> = {
  FREE: {
    tier: "FREE",
    name: "Free",
    price: null,
    capabilities: [],
    features: [...BASE_FEATURES],
    usageLimits: { AI_INPUT: 0, RECEIPT_SCAN: 0, AI_INSIGHTS: 0 },
    usagePeriods: {
      AI_INPUT: "LIFETIME",
      RECEIPT_SCAN: "LIFETIME",
      AI_INSIGHTS: "LIFETIME",
    },
  },
  PRO: {
    tier: "PRO",
    name: "PLUS",
    price: {
      amountMinor: 17900,
      currency: "UAH",
      interval: "MONTH",
      intervalCount: 1,
    },
    prices: [
      { amountMinor: 700, currency: "UAH", interval: "DAY", intervalCount: 7 },
      {
        amountMinor: 17900,
        currency: "UAH",
        interval: "MONTH",
        intervalCount: 1,
      },
      {
        amountMinor: 39900,
        currency: "UAH",
        interval: "MONTH",
        intervalCount: 3,
      },
      {
        amountMinor: 109900,
        currency: "UAH",
        interval: "YEAR",
        intervalCount: 1,
      },
    ],
    capabilities: ULTIMATE_CAPABILITIES,
    features: [...BASE_FEATURES, ...ULTIMATE_CAPABILITIES],
    usageLimits: { AI_INPUT: null, RECEIPT_SCAN: 200, AI_INSIGHTS: 100 },
    usagePeriods: {
      AI_INPUT: "UNLIMITED",
      RECEIPT_SCAN: "MONTH",
      AI_INSIGHTS: "MONTH",
    },
  },
  ULTIMATE: {
    tier: "ULTIMATE",
    name: "Ultimate",
    price: null,
    capabilities: ULTIMATE_CAPABILITIES,
    features: [...BASE_FEATURES, ...ULTIMATE_CAPABILITIES],
    usageLimits: { AI_INPUT: null, RECEIPT_SCAN: 200, AI_INSIGHTS: 100 },
    usagePeriods: {
      AI_INPUT: "UNLIMITED",
      RECEIPT_SCAN: "MONTH",
      AI_INSIGHTS: "MONTH",
    },
  },
};
