import type { ConsumerFinanceInvestmentValuation } from "@telegram-system/shared";
import { Card } from "./ui";
import { financeIntlLocale, type FinanceLocale } from "./i18n/core";
import { financeInvestmentsCopy } from "./i18n/investments";
import { formatMoney } from "@/lib/features/finance/consumer-finance-money";

const WIDTH = 760;
const HEIGHT = 230;
const PAD = { left: 76, right: 18, top: 18, bottom: 42 };

export function FinanceInvestmentValuationChart({
  valuations,
  locale,
}: {
  valuations: ConsumerFinanceInvestmentValuation[];
  locale: FinanceLocale;
}) {
  const t = financeInvestmentsCopy(locale);
  const points = valuations
    .filter((item) => !item.correctedByValuationId)
    .reverse()
    .slice(-12);
  if (!points.length) return null;
  const values = points.map((point) => Number(point.value));
  const rawMin = Math.min(...values);
  const rawMax = Math.max(...values);
  const padding = Math.max(
    (rawMax - rawMin) * 0.15,
    Math.abs(rawMax) * 0.03,
    1,
  );
  const min = Math.max(0, rawMin - padding);
  const max = rawMax + padding;
  const plotWidth = WIDTH - PAD.left - PAD.right;
  const plotHeight = HEIGHT - PAD.top - PAD.bottom;
  const x = (index: number) =>
    PAD.left +
    (points.length === 1
      ? plotWidth / 2
      : (index / (points.length - 1)) * plotWidth);
  const y = (value: number) =>
    PAD.top + ((max - value) / (max - min || 1)) * plotHeight;
  const path = points
    .map(
      (point, index) =>
        `${index ? "L" : "M"} ${x(index)} ${y(Number(point.value))}`,
    )
    .join(" ");
  const date = (value: string, short = false) =>
    new Intl.DateTimeFormat(
      financeIntlLocale(locale),
      short ? { day: "2-digit", month: "short" } : undefined,
    ).format(new Date(value));
  const ticks = [max, (max + min) / 2, min];
  const currency = points[0].currency;
  return (
    <Card>
      <h2 className="mb-1 font-medium">{t.valueChart}</h2>
      <p className="mb-3 text-xs text-neutral-500">
        {date(points[0].valuedAt)} — {date(points.at(-1)!.valuedAt)}
      </p>
      <div className="overflow-x-auto">
        <svg
          role="img"
          aria-label={`${t.valueChart}: ${points.map((point) => `${date(point.valuedAt)} ${formatMoney(point.value, point.currency)}`).join(", ")}`}
          viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
          className="h-56 w-full min-w-[560px]"
        >
          {ticks.map((tick) => {
            const tickY = y(tick);
            return (
              <g key={tick}>
                <line
                  x1={PAD.left}
                  x2={WIDTH - PAD.right}
                  y1={tickY}
                  y2={tickY}
                  stroke="rgb(64 64 64)"
                  strokeDasharray="4 5"
                />
                <text
                  x={PAD.left - 10}
                  y={tickY + 4}
                  textAnchor="end"
                  fill="rgb(163 163 163)"
                  fontSize="11"
                >
                  {formatMoney(tick.toFixed(2), currency, "symbol")}
                </text>
              </g>
            );
          })}
          <path
            d={path}
            fill="none"
            stroke="rgb(14 165 233)"
            strokeWidth="3"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          {points.map((point, index) => (
            <g key={point.id}>
              <circle
                cx={x(index)}
                cy={y(Number(point.value))}
                r="5"
                fill="rgb(14 165 233)"
                stroke="rgb(224 242 254)"
                strokeWidth="2"
              >
                <title>
                  {date(point.valuedAt)} ·{" "}
                  {formatMoney(point.value, point.currency, "symbol")}
                </title>
              </circle>
              {index === 0 ||
              index === points.length - 1 ||
              (points.length > 4 && index === Math.floor(points.length / 2)) ? (
                <text
                  x={x(index)}
                  y={HEIGHT - 13}
                  textAnchor={
                    index === 0
                      ? "start"
                      : index === points.length - 1
                        ? "end"
                        : "middle"
                  }
                  fill="rgb(163 163 163)"
                  fontSize="11"
                >
                  {date(point.valuedAt, true)}
                </text>
              ) : null}
            </g>
          ))}
        </svg>
      </div>
    </Card>
  );
}
