const SYMBOLS: Record<string, string> = {
  USD: "$",
  EUR: "€",
  PLN: "zł",
  UAH: "₴",
  GBP: "£",
  TRY: "₺",
  CAD: "C$",
  AUD: "A$",
  CHF: "CHF",
  JPY: "¥",
  CNY: "¥",
};

/** Consumer Finance monetary presentation, intentionally independent of internal Finance. */
export function formatConsumerFinanceMoney(
  amount: number | string | null | undefined,
  currencyCode: string | null | undefined,
  currencyDisplayMode: "code" | "symbol" = "code",
) {
  const value = Number(amount ?? 0);
  const code = (currencyCode || "").toUpperCase();
  const formatted = new Intl.NumberFormat(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);

  return currencyDisplayMode === "symbol"
    ? `${SYMBOLS[code] ?? code} ${formatted}`.trim()
    : `${formatted} ${code}`.trim();
}

// Compatibility name inside the Consumer Finance product boundary.
export const formatMoney = formatConsumerFinanceMoney;
