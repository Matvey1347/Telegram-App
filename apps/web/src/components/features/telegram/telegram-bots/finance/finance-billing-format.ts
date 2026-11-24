export function formatBillingMoney(
  amountMinor: number,
  currency: string | null | undefined,
) {
  const code = currency?.toUpperCase();
  if (!code) return "—";
  if (code === "XTR") return `${amountMinor.toLocaleString()} XTR`;
  try {
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency: code,
    }).format(amountMinor / 100);
  } catch {
    return `${(amountMinor / 100).toFixed(2)} ${code}`;
  }
}
export function formatBillingDate(value: string | null | undefined) {
  return value ? formatDate(value) : "—";
}
export function toMinorUnits(value: string) {
  const parsed = Number(value.replace(",", "."));
  return Number.isFinite(parsed) ? Math.round(parsed * 100) : null;
}
import { formatDate } from "@/lib/date-format";

export function formatAiCost(micros: number | null) {
  if (micros == null) return "—";
  if (!micros) return "$0";
  if (micros < 10) return "<$0.00001";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: micros < 10_000 ? 4 : 2,
    maximumFractionDigits: 4,
  }).format(micros / 1_000_000);
}
