import type {
  ConsumerFinanceCapability,
  ConsumerFinancePlanFeature,
  ConsumerFinanceTier,
} from '@telegram-system/shared';

export const FINANCE_TIERS = ['FREE', 'PRO', 'ULTIMATE'] as const;
export type FinanceTier = (typeof FINANCE_TIERS)[number];

const BASE_FEATURES = [
  'ACCOUNTS',
  'TRANSACTIONS',
  'DEBTS',
  'REGULAR_PAYMENTS',
  'DETAILED_ANALYTICS',
  'PERIOD_COMPARISON',
  'DETERMINISTIC_TRENDS',
] as const satisfies readonly ConsumerFinancePlanFeature[];

const PRO_CAPABILITIES = [
  'AI_INPUT',
  'VOICE_INPUT',
  'INTELLIGENT_CATEGORIZATION',
  'RECEIPT_SCAN',
  'SMART_LIMITS',
] as const satisfies readonly ConsumerFinanceCapability[];

const ULTIMATE_CAPABILITIES = [
  ...PRO_CAPABILITIES,
  'FINANCE_HISTORY_QA',
  'AI_INSIGHTS',
  'AI_FORECAST_INTERPRETATION',
  'AI_RECOMMENDATIONS',
] as const satisfies readonly ConsumerFinanceCapability[];

export const FINANCE_CAPABILITIES = [
  ...new Set([...PRO_CAPABILITIES, ...ULTIMATE_CAPABILITIES]),
] as ConsumerFinanceCapability[];

type FinanceProductDefinition = {
  tier: ConsumerFinanceTier;
  name: string;
  price: {
    amountMinor: number;
    currency: 'UAH';
    interval: 'MONTH';
  } | null;
  capabilities: readonly ConsumerFinanceCapability[];
  features: readonly ConsumerFinancePlanFeature[];
  usageLimits: {
    AI_INPUT: number | null;
    RECEIPT_SCAN: number | null;
    AI_INSIGHTS: number | null;
  };
};

export const FINANCE_PRODUCT_DEFINITIONS: Record<
  ConsumerFinanceTier,
  FinanceProductDefinition
> = {
  FREE: {
    tier: 'FREE',
    name: 'Free',
    price: null,
    capabilities: [],
    features: BASE_FEATURES,
    usageLimits: { AI_INPUT: 10, RECEIPT_SCAN: 3, AI_INSIGHTS: 0 },
  },
  PRO: {
    tier: 'PRO',
    name: 'Pro',
    price: { amountMinor: 14900, currency: 'UAH', interval: 'MONTH' },
    capabilities: PRO_CAPABILITIES,
    features: [...BASE_FEATURES, ...PRO_CAPABILITIES],
    usageLimits: { AI_INPUT: null, RECEIPT_SCAN: 30, AI_INSIGHTS: 0 },
  },
  ULTIMATE: {
    tier: 'ULTIMATE',
    name: 'Ultimate',
    price: { amountMinor: 24900, currency: 'UAH', interval: 'MONTH' },
    capabilities: ULTIMATE_CAPABILITIES,
    features: [...BASE_FEATURES, ...ULTIMATE_CAPABILITIES],
    usageLimits: { AI_INPUT: null, RECEIPT_SCAN: 200, AI_INSIGHTS: 100 },
  },
};
