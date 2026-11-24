"use client";

import type { ExchangeRate } from "@/lib/api";
import { amountInDisplayCurrency, formatFinanceAmount } from "@/lib/features/finance/money";
import { useFinanceDisplay } from "@/providers/finance-display-provider";
import { useOptionalI18n } from "@/providers/i18n-provider";

export function CurrencyAmount({
  amount,
  currency,
  className = "text-white",
  conversionClassName = "text-xs font-normal tracking-normal text-neutral-400",
  fallbackCurrency,
  rates,
}: {
  amount?: number | string | null;
  currency?: string | null;
  className?: string;
  conversionClassName?: string;
  fallbackCurrency?: string;
  rates?: ExchangeRate[];
}) {
  const display = useFinanceDisplay();
  const locale = useOptionalI18n()?.locale;
  const source = currency?.toUpperCase();
  const native = source ? amountInDisplayCurrency(amount, source, source) : null;
  if (native === null || !source) return <span className={className}>—</span>;

  const target = (display.currency ?? fallbackCurrency)?.toUpperCase();
  const showEquivalent = target && target !== source;
  const equivalent = showEquivalent
    ? amountInDisplayCurrency(native, source, target, display.rates ?? rates)
    : null;
  const unavailable = locale === "ru" ? "Курс недоступен" : "Exchange rate unavailable";

  return (
    <span className={className}>
      {formatFinanceAmount(native, source)}
      {showEquivalent ? (
        <span className={`block ${conversionClassName}`} title={equivalent === null ? unavailable : undefined}>
          {equivalent === null ? "—" : `≈ ${formatFinanceAmount(equivalent, target)}`}
        </span>
      ) : null}
    </span>
  );
}
