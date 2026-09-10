import type {
  ConsumerBillingCatalog,
  ConsumerFinanceTier,
  ConsumerFinancePlanFeature,
  ConsumerFinanceUsage,
} from "@telegram-system/shared";
import { financeIntlLocale, type FinanceLocale } from "./i18n/core";
import { financePlansCopy } from "./i18n/plans";

type Copy = ReturnType<typeof financePlansCopy>;
export type ConsumerFinanceCatalogPlan =
  ConsumerBillingCatalog["plans"][number];
export type ConsumerFinanceCatalogProvider =
  ConsumerBillingCatalog["providers"][number];
export type ConsumerFinanceCheckoutOffer = {
  price: ConsumerFinanceCatalogPlan["prices"][number];
  provider: ConsumerFinanceCatalogProvider;
};

export function consumerFinanceTierLabel(tier: ConsumerFinanceTier, t: Copy) {
  return tier === "PRO"
    ? t.financePro
    : tier === "ULTIMATE"
      ? t.financeUltimate
      : t.financeFree;
}

export function consumerFinanceUsageLabel(
  usage: ConsumerFinanceUsage,
  t: Copy,
) {
  return usage.feature === "AI_INPUT"
    ? t.aiInputs
    : usage.feature === "AI_INSIGHTS"
      ? t.featureAiInsights
      : t.receiptScans;
}

export function consumerFinanceUsageValue(
  usage: ConsumerFinanceUsage,
  t: Copy,
) {
  return usage.limit === null
    ? `${usage.used} · ${t.unlimited}`
    : `${usage.used}/${usage.limit}`;
}

export function consumerFinanceFeatureLabel(
  feature: ConsumerFinancePlanFeature,
  plan: ConsumerFinanceCatalogPlan,
  copy: Copy,
) {
  if (
    feature === "AI_INPUT" ||
    feature === "RECEIPT_SCAN" ||
    feature === "AI_INSIGHTS"
  ) {
    const limit = plan.usageLimits[feature];
    const label =
      feature === "AI_INPUT"
        ? copy.aiInputs
        : feature === "AI_INSIGHTS"
          ? copy.featureAiInsights
          : copy.receiptScans;
    return `${label}: ${limit === null ? copy.unlimited : limit}`;
  }
  const labels: Record<
    Exclude<
      ConsumerFinancePlanFeature,
      "AI_INPUT" | "RECEIPT_SCAN" | "AI_INSIGHTS"
    >,
    string
  > = {
    ACCOUNTS: copy.featureAccounts,
    TRANSACTIONS: copy.featureTransactions,
    DEBTS: copy.featureDebts,
    REGULAR_PAYMENTS: copy.featureRegularPayments,
    DETAILED_ANALYTICS: copy.featureAnalytics,
    PERIOD_COMPARISON: copy.featureComparison,
    DETERMINISTIC_TRENDS: copy.featureTrends,
    VOICE_INPUT: copy.featureVoice,
    INTELLIGENT_CATEGORIZATION: copy.featureCategorization,
    SMART_LIMITS: copy.featureSmartLimits,
    FINANCE_HISTORY_QA: copy.featureHistoryQa,
    AI_FORECAST_INTERPRETATION: copy.featureAiForecast,
    AI_RECOMMENDATIONS: copy.featureAiRecommendations,
  };
  return labels[feature];
}

export function consumerFinanceOffersForPlan(
  plan: ConsumerFinanceCatalogPlan,
  providers: ConsumerFinanceCatalogProvider[],
): ConsumerFinanceCheckoutOffer[] {
  return plan.prices.flatMap((price) =>
    providers
      .filter(
        (provider) =>
          provider.capabilities.intervals.includes(price.interval) &&
          (provider.provider === "TELEGRAM_STARS"
            ? price.currency === "XTR"
            : price.currency === "UAH"),
      )
      .map((provider) => ({ price, provider })),
  );
}

export function formatConsumerFinancePlanPrice(
  amountMinor: number,
  currency: string,
  locale: FinanceLocale,
) {
  if (currency === "XTR") return `${amountMinor} XTR`;
  try {
    return new Intl.NumberFormat(financeIntlLocale(locale), {
      style: "currency",
      currency,
    }).format(amountMinor / 100);
  } catch {
    return `${(amountMinor / 100).toFixed(2)} ${currency}`;
  }
}

export function consumerFinanceProviderLabel(provider: string) {
  if (provider === "TELEGRAM_STARS") return "Telegram Stars";
  if (provider === "STRIPE") return "Stripe";
  return provider;
}

export function consumerFinanceSubscriptionStatusLabel(
  status: string,
  copy: Copy,
) {
  const labels: Record<string, string> = {
    ACTIVE: copy.subscriptionActive,
    PAST_DUE: copy.subscriptionPastDue,
    CANCELED: copy.subscriptionCanceled,
    CANCELLED: copy.subscriptionCanceled,
    INCOMPLETE: copy.subscriptionIncomplete,
    INCOMPLETE_EXPIRED: copy.subscriptionIncompleteExpired,
    TRIALING: copy.subscriptionTrialing,
  };
  return labels[status] ?? status;
}
