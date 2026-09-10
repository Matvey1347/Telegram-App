import type { ConsumerFinanceInvestmentValuation } from "@telegram-system/shared";
import { Card } from "./ui";
import { financeIntlLocale, type FinanceLocale } from "./i18n/core";
import { financeInvestmentsCopy } from "./i18n/investments";
import { formatMoney } from "@/lib/features/finance/consumer-finance-money";

export function FinanceInvestmentValuationChart({
  valuations,
  locale,
}: {
  valuations: ConsumerFinanceInvestmentValuation[];
  locale: FinanceLocale;
}) {
  const t = financeInvestmentsCopy(locale);
  const points = valuations
    .filter((valuation) => !valuation.correctedByValuationId)
    .reverse()
    .slice(-12);
  const maximum = Math.max(...points.map((point) => Number(point.value)), 1);
  if (!points.length) return null;
  const date = (value: string) =>
    new Intl.DateTimeFormat(financeIntlLocale(locale)).format(new Date(value));
  return (
    <Card>
      <h2 className="mb-3 font-medium">{t.valueChart}</h2>
      <div
        role="img"
        aria-label={`${t.valueChart}: ${points
          .map(
            (point) =>
              `${date(point.valuedAt)} ${formatMoney(point.value, point.currency)}`,
          )
          .join(", ")}`}
        className="flex h-32 items-end gap-2 border-b border-l border-neutral-700 px-2 pt-2"
      >
        {points.map((point) => (
          <div
            key={point.id}
            className="min-w-2 flex-1 rounded-t bg-sky-500"
            style={{
              height: `${Math.max(4, (Number(point.value) / maximum) * 100)}%`,
            }}
            title={`${date(point.valuedAt)} · ${formatMoney(point.value, point.currency, "symbol")}`}
          />
        ))}
      </div>
    </Card>
  );
}
