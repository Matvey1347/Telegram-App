import type {
  ConsumerFinanceAnalyticsQuery,
  ConsumerFinanceDashboard,
} from "@telegram-system/shared";
import { Card, EmptyState } from "./ui";
import { formatMoney } from "@/lib/features/finance/consumer-finance-money";
import type { ConsumerFinanceSurface } from "./consumer-finance-navigation";
import { IconAvatar } from "./ui/finance-icon-avatar";
import { type FinanceLocale } from "./i18n/core";
import { financeDashboardCopy } from "./i18n/dashboard";
import { FinancePeriodSelector } from "./finance-period-selector";
import { FinanceDashboardSkeleton } from "./finance-dashboard-skeleton";

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
      <Card className="!p-3">
        <div className="grid grid-cols-2 gap-x-4 gap-y-2 sm:grid-cols-4">
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
          ].filter(([, value]) => Number(value) !== 0).map(([label, value, currency, tone]) => (
            <div key={label}>
              <p className="text-[10px] uppercase text-neutral-500">{label}</p>
              <p className={`text-base font-semibold tabular-nums ${tone}`}>
                {formatMoney(value, currency, "symbol")}
              </p>
            </div>
          ))}
        </div>
        <p className="mt-2 text-[11px] text-neutral-500">{t.savingsPartCash}</p>
        {!stats.netWorth.complete &&
        (stats.netWorth.excludedAccountCount > 0 ||
          data.investments.excludedInvestments.some(
            (investment) => investment.reason === "RATE_UNAVAILABLE",
          )) ? (
          <p className="mt-2 text-xs text-amber-300">{t.incompleteWorth}</p>
        ) : null}
        <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-2 border-t border-neutral-800 pt-2 sm:grid-cols-3 lg:grid-cols-6">
          {[
            [t.income, stats.income, "text-emerald-300"],
            [t.expense, stats.expense, "text-rose-300"],
            [t.saved, stats.saved, "text-sky-200"],
            [t.invested, stats.invested, "text-violet-200"],
            [t.investmentReturns, stats.investmentReturns, "text-emerald-200"],
            [t.net, stats.net, "text-sky-200"],
          ].filter(([, value]) => Number(value) !== 0).map(([label, value, tone]) => (
            <div key={label} className="min-w-0">
              <p className="text-[10px] uppercase text-neutral-500">{label}</p>
              <p
                className={`truncate text-sm font-semibold tabular-nums ${tone}`}
              >
                {formatMoney(value, stats.currency, "symbol")}
              </p>
              {label === t.net ? (
                <p
                  className="mt-0.5 truncate text-[9px] text-neutral-500"
                  title={t.netExplanation}
                >
                  {t.netExplanation}
                </p>
              ) : null}
            </div>
          ))}
        </div>
      </Card>
      <Card className="!p-3">
        <h2 className="mb-1 text-sm font-medium">{t.balancesByAccount}</h2>
        {accounts.length ? (
          accounts.map((account) => (
            <div
              key={account.id}
              className="flex items-center justify-between gap-3 border-t border-neutral-800 py-1.5 text-xs first:border-0"
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
                  <span className="mt-1 block text-xs text-neutral-500">
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
          <EmptyState text={t.addAccountHint} context="accounts" compact />
        )}
      </Card>
    </>
  );
}
