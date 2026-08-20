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
  return value ? new Date(value).toLocaleDateString() : "—";
}
export function toMinorUnits(value: string) {
  const parsed = Number(value.replace(",", "."));
  return Number.isFinite(parsed) ? Math.round(parsed * 100) : null;
}
