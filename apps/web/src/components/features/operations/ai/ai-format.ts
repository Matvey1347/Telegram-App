import type { AiUsageTotals } from "@telegram-system/shared";
/** Decimal formatting without IEEE-754 rounding or financial arithmetic. */
export function aiMoney(value: string | null): string {
  if (value === null) return "Unknown";
  const [whole, fraction = ""] = value.split(".");
  const decimals = fraction.replace(/0+$/, "");
  return `$${whole}${decimals ? `.${decimals}` : ".00"}`;
}
/** Six decimal display precision; full exact values remain available in telemetry. */
export function aiDisplayMoney(value: string | null): string {
  if (value === null) return "Unknown";
  const [whole, fraction = ""] = value.split(".");
  if (fraction.length <= 6) return aiMoney(value);
  const units =
    BigInt(whole) * BigInt(1_000_000) +
    BigInt(fraction.slice(0, 6).padEnd(6, "0")) +
    (fraction[6] >= "5" ? BigInt(1) : BigInt(0));
  if (units === BigInt(0) && /[1-9]/.test(value)) return "<$0.000001";
  return aiMoney(
    `${units / BigInt(1_000_000)}.${String(units % BigInt(1_000_000)).padStart(6, "0")}`,
  );
}
export function aiCost(
  totals: Pick<
    AiUsageTotals,
    "knownCost" | "unpricedRequests" | "unknownUsageRequests"
  >,
) {
  return `${aiDisplayMoney(totals.knownCost)}${totals.unpricedRequests || totals.unknownUsageRequests ? " + unknown" : ""}`;
}
export function aiNumber(value: string | number) {
  return String(value).replace(/\B(?=(\d{3})+(?!\d))/g, " ");
}
export function aiCategory(value: string) {
  return value.toLowerCase().replaceAll("_", " ");
}
export function aiPermissions(access?: {
  isOwner: boolean;
  permissionKeys: readonly string[];
}) {
  return {
    view:
      !!access?.isOwner ||
      !!access?.permissionKeys.includes("operations.viewAiUsage"),
    manage:
      !!access?.isOwner ||
      !!access?.permissionKeys.includes("operations.manageAi"),
  };
}
