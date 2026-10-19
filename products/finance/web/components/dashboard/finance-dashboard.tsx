import type {
  ConsumerFinanceAnalyticsQuery,
  ConsumerFinanceDashboard,
} from "@telegram-system/shared";
import { Card, EmptyState } from "@consumer-finance/web/components/ui";
import { formatMoney } from "@consumer-finance/web/lib/formatters/consumer-finance-money";
import type { ConsumerFinanceSurface } from "@consumer-finance/web/components/app/consumer-finance-navigation";
import { IconAvatar } from "@consumer-finance/web/components/ui/finance-icon-avatar";
import { type FinanceLocale } from "@consumer-finance/web/components/i18n/core";
import { financeDashboardCopy } from "@consumer-finance/web/components/i18n/dashboard";
import { FinancePeriodSelector } from "@consumer-finance/web/components/planning/finance-period-selector";
import { FinanceDashboardSkeleton } from "@consumer-finance/web/components/dashboard/finance-dashboard-skeleton";

export function FinanceDashboard({
  data,
  locale,
  surface,
  period = { period: "CURRENT_MONTH" },
  onPeriodChange = () => undefined,
  loading = false,
  loadingLabel = "Loading finances...",
}: {
  data?: ConsumerFinanceDashboard | null;
  locale: FinanceLocale;
  surface: ConsumerFinanceSurface;
  period?: ConsumerFinanceAnalyticsQuery;
  onPeriodChange?: (period: ConsumerFinanceAnalyticsQuery) => void;
  loading?: boolean;
  loadingLabel?: string;
}) {
  return (
    <div data-finance-dashboard={surface} className="space-y-2">
      <FinancePeriodSelector
        value={period}
        locale={locale}
        onChange={onPeriodChange}
      />
      {loading ? (
        <FinanceDashboardSkeleton label={loadingLabel} />
      ) : data ? (
        <FinanceDashboardContent data={data} locale={locale} />
      ) : null}
    </div>
  );
}

function FinanceDashboardContent({
  data,
  locale,
}: {
  data: ConsumerFinanceDashboard;
  locale: FinanceLocale;
}) {
  const t = financeDashboardCopy(locale);
  const { stats } = data;
  const accounts = stats.accounts.filter(
    (account) => !account.archivedAt && Number(account.balance) !== 0,
  );
  return (
    <>
      <section
        aria-label={t.netWorth}
        className="relative overflow-hidden rounded-[27px] bg-[linear-gradient(138deg,#265746_0%,#123c2e_74%,#092b20_100%)] p-6 text-white shadow-[0_12px_36px_rgba(21,58,41,0.12)] before:absolute before:-right-[72px] before:-top-[129px] before:size-[230px] before:rounded-full before:border before:border-white/15 after:absolute after:-bottom-[70px] after:-right-[73px] after:size-[150px] after:rounded-full after:border-[22px] after:border-white/[0.06]"
      >
        <div className="relative z-10 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.13em] text-[#c7e0ce]">
          <span className="size-2 rounded-full bg-[#cff08b]" aria-hidden="true" />
          {t.netWorth}
        </div>
        <p className="relative z-10 my-6 text-[clamp(31px,7.8vw,41px)] font-extrabold leading-none tracking-[-0.055em] tabular-nums">
          {formatMoney(stats.netWorth.amount, stats.netWorth.currency, "symbol")}
        </p>
        <div className="relative z-10 grid grid-cols-2 gap-x-5 gap-y-3 border-t border-white/15 pt-4 sm:grid-cols-4">
          {[
            [t.cash, stats.netWorth.cashAmount, stats.netWorth.currency, ""],
            [
              t.savings,
              data.savings.allocated,
              data.savings.currency,
              "text-sky-200",
            ],
            [
              t.investments,
              stats.netWorth.investmentValue,
              stats.netWorth.currency,
              "text-violet-200",
            ],
            [
              t.netWorth,
              stats.netWorth.amount,
              stats.netWorth.currency,
              "text-emerald-200",
            ],
          ].filter(([, value]) => Number(value) !== 0).map(([label, value, currency]) => (
            <div key={label} className="min-w-0">
              <p className="truncate text-[10px] font-semibold uppercase tracking-wide text-[#c7e0ce]">{label}</p>
              <p className="mt-1 truncate text-sm font-bold tabular-nums text-white">
                {formatMoney(value, currency, "symbol")}
              </p>
            </div>
          ))}
        </div>
        <p className="relative z-10 mt-4 text-[11px] text-[#c7e0ce]">{t.savingsPartCash}</p>
        {!stats.netWorth.complete &&
        (stats.netWorth.excludedAccountCount > 0 ||
          data.investments.excludedInvestments.some(
            (investment) => investment.reason === "RATE_UNAVAILABLE",
          )) ? (
          <p className="relative z-10 mt-2 text-xs text-[#cff08b]">{t.incompleteWorth}</p>
        ) : null}
      </section>
      <Card className="!p-5">
        <div className="grid grid-cols-2 gap-x-4 gap-y-4 sm:grid-cols-3 lg:grid-cols-6">
          {[
            [t.income, stats.income, "text-emerald-300"],
            [t.expense, stats.expense, "text-rose-300"],
            [t.saved, stats.saved, "text-sky-200"],
            [t.invested, stats.invested, "text-violet-200"],
            [t.investmentReturns, stats.investmentReturns, "text-emerald-200"],
            [t.net, stats.net, "text-sky-200"],
          ].filter(([, value]) => Number(value) !== 0).map(([label, value, tone]) => (
            <div key={label} className="min-w-0">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-[#82958b]">{label}</p>
              <p
                className={`mt-1 truncate text-sm font-bold tabular-nums ${tone}`}
              >
                {formatMoney(value, stats.currency, "symbol")}
              </p>
              {label === t.net ? (
                <p
                  className="mt-0.5 truncate text-[9px] text-[#82958b]"
                  title={t.netExplanation}
                >
                  {t.netExplanation}
                </p>
              ) : null}
            </div>
          ))}
        </div>
      </Card>
      <Card className="!p-0">
        <h2 className="px-5 pb-2 pt-5 text-base font-semibold tracking-tight">{t.balancesByAccount}</h2>
        {accounts.length ? (
          accounts.map((account) => (
            <div
              key={account.id}
              className="flex items-center justify-between gap-3 border-t border-[#e4ebe3] px-5 py-3 text-xs first:border-0"
            >
              <span className="flex min-w-0 items-center gap-2">
                <IconAvatar
                  icon={account.iconPresentation}
                  label={account.name}
                  size="sm"
                  bordered={false}
                />
                <span className="truncate">
                  {account.name} · {account.currency}
                </span>
              </span>
              <span className="shrink-0 text-right">
                <strong>
                  {formatMoney(account.balance, account.currency, "symbol")}
                </strong>
                {account.equivalentBalance &&
                account.equivalentBalance.currency !== account.currency ? (
                  <span className="mt-1 block text-xs text-[#82958b]">
                    ≈{" "}
                    {formatMoney(
                      account.equivalentBalance.amount,
                      account.equivalentBalance.currency,
                      "symbol",
                    )}
                  </span>
                ) : null}
              </span>
            </div>
          ))
        ) : (
          <div className="px-5 pb-5">
            <EmptyState text={t.addAccountHint} context="accounts" compact />
          </div>
        )}
      </Card>
    </>
  );
}
