import type {
  ConsumerFinanceTier,
  ConsumerFinanceUsage,
} from "@telegram-system/shared";
import type { financeCopy } from "./finance-i18n";

type Copy = ReturnType<typeof financeCopy>;

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
  return usage.feature === "AI_INPUT" ? t.aiInputs : t.receiptScans;
}

export function consumerFinanceUsageValue(
  usage: ConsumerFinanceUsage,
  t: Copy,
) {
  return usage.limit === null
    ? `${usage.used} · ${t.unlimited}`
    : `${usage.used}/${usage.limit}`;
}
