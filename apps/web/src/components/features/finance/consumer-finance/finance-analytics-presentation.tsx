import type { ConsumerFinanceAnalytics } from "@telegram-system/shared";
import { EmptyState } from "./ui";
import { formatMoney } from "@/lib/features/finance/consumer-finance-money";
import type { FinanceLocale } from "./i18n/core";
import { financeAnalyticsCopy } from "./i18n/analytics";
import { localizeFinanceCategory } from "./finance-category-i18n";

export function AnalyticsPresentation({
  data,
  locale = "en",
}: {
  data: ConsumerFinanceAnalytics;
  locale?: FinanceLocale;
}) {
  const t = financeAnalyticsCopy(locale);
  const timelineMaximum = Math.max(
    ...data.timeline.map((entry) => Math.abs(Number(entry.netCashflow))),
    1,
  );
  return (
    <div className="mt-4 space-y-5">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        <Metric
          label={t.income}
          value={data.summary.income}
          currency={data.currency}
          tone="text-emerald-300"
        />
        <Metric
          label={t.expense}
          value={data.summary.expenses}
          currency={data.currency}
          tone="text-rose-300"
        />
        <Metric
          label={t.saved}
          value={data.summary.saved}
          currency={data.currency}
          tone="text-sky-200"
        />
        <Metric
          label={t.invested}
          value={data.summary.invested}
          currency={data.currency}
          tone="text-violet-200"
        />
        <Metric
          label={t.investmentReturns}
          value={data.summary.investmentReturns}
          currency={data.currency}
          tone="text-emerald-200"
        />
        <Metric
          label={t.net}
          value={data.summary.netCashflow}
          currency={data.currency}
          tone="text-sky-200"
        />
      </div>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
        <Metric
          label={t.savingsSummary}
          value={data.savings.allocated}
          currency={data.savings.currency}
          tone="text-sky-200"
        />
        <Metric
          label={t.investmentValue}
          value={data.investments.currentValue}
          currency={data.investments.currency}
          tone="text-violet-200"
        />
        <Metric
          label={t.netWorth}
          value={data.netWorth.amount}
          currency={data.netWorth.currency}
          tone="text-emerald-200"
        />
      </div>
      <section>
        <h3 className="text-sm font-medium">{t.expensePriority}</h3>
        <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-3">
          <Metric
            label={t.requiredExpenses}
            value={data.summary.requiredExpenses ?? "0"}
            currency={data.currency}
            tone="text-rose-200"
          />
          <Metric
            label={t.discretionaryExpenses}
            value={data.summary.discretionaryExpenses ?? "0"}
            currency={data.currency}
            tone="text-amber-200"
          />
          <Metric
            label={t.unspecifiedExpenses}
            value={data.summary.unspecifiedExpenses ?? "0"}
            currency={data.currency}
            tone="text-neutral-300"
          />
        </div>
      </section>
      <section>
        <h3 className="text-sm font-medium">{t.periodComparison}</h3>
        {data.comparison.legacyFallback ? (
          <p role="note" className="mt-1 text-xs text-amber-300">
            {t.comparisonHistoricalExcluded}
          </p>
        ) : null}
        <div className="mt-2 grid gap-2 sm:grid-cols-3">
          {data.trends.map((trend) => (
            <div
              key={trend.metric}
              className="rounded-lg border border-neutral-800 bg-neutral-950/50 p-3 text-xs"
            >
              <p className="text-neutral-400">{trendLabel(trend.metric, t)}</p>
              <p className="mt-1 font-medium tabular-nums">
                {trend.changePercent === null
                  ? t.noComparisonBaseline
                  : `${trend.changePercent > 0 ? "+" : ""}${trend.changePercent}%`}
              </p>
              <p className="mt-1 text-neutral-500">
                {formatMoney(trend.previous, data.currency, "symbol")} →{" "}
                {formatMoney(trend.current, data.currency, "symbol")}
              </p>
            </div>
          ))}
        </div>
      </section>
      {data.legacyFallback ? (
        <LegacyNotice data={data} locale={locale} />
      ) : null}
      <div className="grid gap-5 lg:grid-cols-2">
        <CategoryBreakdown
          title={t.expensesByCategory}
          empty={t.expensesAppear}
          rows={data.expensesByCategory}
          currency={data.currency}
          locale={locale}
          tone="bg-rose-400"
        />
        <CategoryBreakdown
          title={t.incomeByCategory}
          empty={t.incomeAppear}
          rows={data.incomeByCategory}
          currency={data.currency}
          locale={locale}
          tone="bg-emerald-400"
        />
      </div>
      <section>
        <h3 className="text-sm font-medium">{t.accountBreakdown}</h3>
        {data.accounts.length ? (
          <div className="mt-2 overflow-x-auto rounded-lg border border-neutral-800">
            <table className="w-full min-w-[520px] text-sm">
              <thead className="bg-neutral-950/70 text-xs text-neutral-500">
                <tr>
                  <th className="px-3 py-2 text-left">{t.account}</th>
                  <th className="px-3 py-2 text-right">{t.income}</th>
                  <th className="px-3 py-2 text-right">{t.expense}</th>
                  <th className="px-3 py-2 text-right">{t.invested}</th>
                  <th className="px-3 py-2 text-right">
                    {t.investmentReturns}
                  </th>
                  <th className="px-3 py-2 text-right">{t.net}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-800">
                {data.accounts.map((account) => (
                  <tr key={account.accountId}>
                    <td className="px-3 py-2">{account.name}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-emerald-300">
                      {formatMoney(account.income, data.currency, "symbol")}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums text-rose-300">
                      {formatMoney(account.expenses, data.currency, "symbol")}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums text-violet-200">
                      {formatMoney(account.invested, data.currency, "symbol")}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums text-emerald-200">
                      {formatMoney(
                        account.investmentReturns,
                        data.currency,
                        "symbol",
                      )}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {formatMoney(
                        account.netCashflow,
                        data.currency,
                        "symbol",
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState text={t.accountsAppear} />
        )}
      </section>
      <section>
        <h3 className="text-sm font-medium">{t.cashflowTimeline}</h3>
        {data.timeline.length ? (
          <div
            className="mt-2 flex h-20 items-end gap-1"
            aria-label={t.cashflowTimeline}
          >
            {data.timeline.map((point) => {
              const amount = Number(point.netCashflow);
              return (
                <div
                  key={point.date}
                  title={`${point.date}: ${formatMoney(point.netCashflow, data.currency, "symbol")}`}
                  className="flex h-full min-w-1 flex-1 items-end"
                >
                  <div
                    className={`w-full rounded-t ${amount >= 0 ? "bg-emerald-400" : "bg-rose-400"}`}
                    style={{
                      height: `${Math.max(6, (Math.abs(amount) / timelineMaximum) * 100)}%`,
                    }}
                  />
                </div>
              );
            })}
          </div>
        ) : (
          <EmptyState text={t.timelineAppear} />
        )}
      </section>
    </div>
  );
}

function Metric({
  label,
  value,
  currency,
  tone,
}: {
  label: string;
  value: string;
  currency: string;
  tone: string;
}) {
  return (
    <div className="rounded-lg border border-neutral-800 bg-neutral-950/50 p-3">
      <p className="text-xs text-neutral-500">{label}</p>
      <p className={`mt-1 truncate font-medium tabular-nums ${tone}`}>
        {formatMoney(value, currency, "symbol")}
      </p>
    </div>
  );
}

function CategoryBreakdown({
  title,
  empty,
  rows,
  currency,
  locale,
  tone,
}: {
  title: string;
  empty: string;
  rows: ConsumerFinanceAnalytics["expensesByCategory"];
  currency: string;
  locale: FinanceLocale;
  tone: string;
}) {
  const t = financeAnalyticsCopy(locale);
  const maximum = Math.max(...rows.map((item) => Number(item.amount)), 1);
  return (
    <section>
      <h3 className="text-sm font-medium">{title}</h3>
      {rows.length ? (
        <div className="mt-2 space-y-2">
          {rows.slice(0, 8).map((item) => (
            <div key={item.categoryId ?? item.name}>
              <div className="flex justify-between gap-2 text-xs">
                <span className="truncate">
                  {item.categoryId || item.categoryKey
                    ? localizeFinanceCategory(
                        item.name,
                        item.categoryKey,
                        locale,
                      )
                    : t.other}
                </span>
                <span className="shrink-0 tabular-nums">
                  {formatMoney(item.amount, currency, "symbol")} ·{" "}
                  {item.percentage}%
                </span>
              </div>
              <div className="mt-1 h-1.5 rounded bg-neutral-800">
                <div
                  className={`h-1.5 rounded ${tone}`}
                  style={{
                    width: `${Math.min(100, (Number(item.amount) / maximum) * 100)}%`,
                  }}
                />
              </div>
            </div>
          ))}
        </div>
      ) : (
        <EmptyState text={empty} />
      )}
    </section>
  );
}

function LegacyNotice({
  data,
  locale,
}: {
  data: ConsumerFinanceAnalytics;
  locale: FinanceLocale;
}) {
  const t = financeAnalyticsCopy(locale);
  const fallback = data.legacyFallback!;
  return (
    <div
      role="note"
      className="rounded border border-amber-700/60 bg-amber-950/30 p-2 text-xs text-amber-100"
    >
      <p className="font-medium">{t.historicalExcluded}</p>
      <p className="mt-1 text-amber-100/80">
        {fallback.transactionCount} {t.historicalReason} {data.currency}.
      </p>
      {fallback.nativeAmounts.length ? (
        <ul
          className="mt-2 space-y-1 border-t border-amber-700/40 pt-2"
          aria-label={t.historicalAmounts}
        >
          {fallback.nativeAmounts.map((bucket) => (
            <li key={bucket.currency} className="flex justify-between gap-2">
              <span>{t.historicalAmount}</span>
              <span>
                {formatMoney(bucket.amount, bucket.currency, "symbol")}
              </span>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

function trendLabel(
  metric: ConsumerFinanceAnalytics["trends"][number]["metric"],
  copy: ReturnType<typeof financeAnalyticsCopy>,
) {
  return metric === "INCOME"
    ? copy.incomeTrend
    : metric === "EXPENSES"
      ? copy.expenseTrend
      : metric === "SAVED"
        ? copy.savedTrend
        : metric === "INVESTED"
          ? copy.investedTrend
          : metric === "INVESTMENT_RETURNS"
            ? copy.returnsTrend
            : copy.netTrend;
}
