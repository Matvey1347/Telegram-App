import type { FinanceBillingOfferCode } from "@finance-web/lib/billing/finance-billing-api";

export const offerNames: Record<FinanceBillingOfferCode, [string, string]> = {
  INTRO: ["7 днів", "7 days"],
  MONTH: ["1 місяць", "1 month"],
  QUARTER: ["3 місяці", "3 months"],
  YEAR: ["12 місяців", "12 months"],
};

export function financeBillingPlanName(code: string) {
  const name = code.toUpperCase();
  if (name === "PRO") return "Groshly Plus";
  if (name === "ULTIMATE") return "Groshly Ultimate";
  return code;
}

export function offerCode(interval: string | null, count: number | null) {
  if (interval === "DAY" && count === 7) return "INTRO";
  if (interval === "MONTH" && count === 1) return "MONTH";
  if (interval === "MONTH" && count === 3) return "QUARTER";
  if (interval === "YEAR" && count === 1) return "YEAR";
  return null;
}

export const money = (minor: number, currency: string, locale: string) =>
  new Intl.NumberFormat(locale, { style: "currency", currency }).format(
    minor / 100,
  );
