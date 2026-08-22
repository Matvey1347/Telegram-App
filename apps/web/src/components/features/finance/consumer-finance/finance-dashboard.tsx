import { ArrowDownLeft, ArrowLeftRight, ArrowUpRight } from "lucide-react";
import type {
  ConsumerFinanceDashboard,
  ConsumerFinanceTransaction,
} from "@telegram-system/shared";
import { Button, Card, EmptyState } from "@/components/ui/primitives";
import { formatMoney } from "@/lib/features/finance/money";
import type { ConsumerFinanceScreen } from "./consumer-finance-screens";
import type { ConsumerFinanceAction } from "./consumer-finance-navigation";
import type { ConsumerFinanceSurface } from "./consumer-finance-navigation";
import {
  financeCopy,
  financeIntlLocale,
  localizeFinanceCategory,
  type FinanceLocale,
} from "./finance-i18n";

export function FinanceDashboard({
  data,
  onNavigate,
  onAction,
  locale,
  timezone,
  surface,
}: {
  data: ConsumerFinanceDashboard;
  onNavigate: (screen: ConsumerFinanceScreen) => void;
  onAction: (action: ConsumerFinanceAction) => void;
  locale: FinanceLocale;
  timezone: string;
  surface: ConsumerFinanceSurface;
}) {
  const t = financeCopy(locale);
  const { stats } = data;
  const accounts = stats.accounts.filter((account) => !account.archivedAt);
  const categories = stats.categories.slice(0, 6);
  return (
    <div
      data-finance-dashboard={surface}
      className={
        surface === "browser" ? "grid gap-4 xl:grid-cols-2" : "space-y-4"
      }
    >
      <Card className="flex flex-wrap items-end justify-between gap-3 xl:col-span-2">
        <div>
          <p className="text-xs uppercase text-neutral-500">{t.totalBalance}</p>
          <p className="mt-1 text-2xl font-semibold tabular-nums">
            {formatMoney(
              stats.totalBalance.amount,
              stats.totalBalance.currency,
              "symbol",
            )}
          </p>
        </div>
        <p className="truncate text-xs text-neutral-500">
          {stats.totalBalance.includedAccountCount} / {accounts.length}{" "}
          {t.accounts.toLocaleLowerCase()}
        </p>
        {stats.totalBalance.excludedAccounts.length ? (
          <p className="w-full text-xs text-amber-300">{t.incompleteBalance}</p>
        ) : null}
      </Card>
      <div className="grid grid-cols-3 gap-2 xl:col-span-2">
        {[
          [t.income, stats.income, "text-emerald-300"],
          [t.expense, stats.expense, "text-rose-300"],
          [t.net, stats.net, "text-sky-200"],
        ].map(([label, value, tone]) => (
          <Card key={label} className="p-3">
            <p className="text-[10px] uppercase text-neutral-500">{label}</p>
            <p className={`mt-1 truncate text-base font-semibold ${tone}`}>
              {formatMoney(value, stats.currency, "symbol")}
            </p>
          </Card>
        ))}
      </div>
      <Card>
        <h2 className="mb-2 font-medium">{t.balancesByAccount}</h2>
        {accounts.length ? (
          accounts.map((account) => (
            <div
              key={account.id}
              className="flex justify-between border-t border-neutral-800 py-2 text-sm first:border-0"
            >
              <span>
                {account.name} · {account.currency}
              </span>
              <strong>
                {formatMoney(account.balance, account.currency, "symbol")}
              </strong>
              {account.equivalentBalance &&
              account.equivalentBalance.currency !== account.currency ? (
                <p className="mt-1 text-xs text-neutral-500">
                  ≈{" "}
                  {formatMoney(
                    account.equivalentBalance.amount,
                    account.equivalentBalance.currency,
                    "symbol",
                  )}
                </p>
              ) : null}
            </div>
          ))
        ) : (
          <EmptyState text={t.addAccountHint} />
        )}
      </Card>
      <Card>
        <h2 className="mb-3 font-medium">{t.spendingMonth}</h2>
        {categories.length ? (
          categories.map((category) => (
            <CategoryProgress
              key={category.categoryId || category.name}
              name={localizeFinanceCategory(
                category.name,
                category.categoryKey,
                locale,
              )}
              amount={category.amount}
              currency={category.currency}
              maximum={Math.max(
                ...stats.categories.map((row) => Number(row.amount)),
                1,
              )}
            />
          ))
        ) : (
          <EmptyState text={t.expensesAppear} />
        )}
      </Card>
      {data.limits.length ? (
        <Card>
          <div className="mb-3 flex items-center justify-between gap-3">
            <h2 className="font-medium">{t.budget}</h2>
            <Button variant="secondary" onClick={() => onNavigate("budget")}>
              {t.edit}
            </Button>
          </div>
          {data.limits.slice(0, 4).map((limit) => (
            <div className="mb-3 last:mb-0" key={limit.id}>
              <div className="flex justify-between gap-3 text-xs">
                <span>
                  {localizeFinanceCategory(
                    limit.category.name,
                    limit.category.key,
                    locale,
                  )}
                </span>
                <span>
                  {formatMoney(limit.spent, limit.currency, "symbol")} /{" "}
                  {formatMoney(limit.amount, limit.currency, "symbol")}
                </span>
              </div>
              <div className="mt-1 h-2 rounded bg-neutral-800">
                <div
                  className={`h-2 rounded ${limit.percentage > 100 ? "bg-rose-400" : "bg-sky-400"}`}
                  style={{ width: `${Math.min(100, limit.percentage)}%` }}
                />
              </div>
            </div>
          ))}
        </Card>
      ) : null}
      {data.goal ? (
        <Card>
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-xs uppercase text-neutral-500">
                {t.financialGoal}
              </p>
              <h2 className="mt-1 font-medium">{data.goal.name}</h2>
              <p className="text-sm text-neutral-400">
                {formatMoney(
                  data.goal.currentAmount,
                  data.goal.currency,
                  "symbol",
                )}{" "}
                /{" "}
                {formatMoney(
                  data.goal.targetAmount,
                  data.goal.currency,
                  "symbol",
                )}
              </p>
            </div>
            <Button variant="secondary" onClick={() => onNavigate("budget")}>
              {t.edit}
            </Button>
          </div>
        </Card>
      ) : null}
      <Card className="xl:col-span-2">
        <h2 className="mb-2 font-medium">{t.recent}</h2>
        {data.recent.length ? (
          data.recent.map((item) => (
            <TransactionRow
              key={item.id}
              item={item}
              locale={locale}
              timezone={timezone}
            />
          ))
        ) : (
          <EmptyState text={t.noTransactionsYet} />
        )}
      </Card>
      {surface === "telegram" ? (
        <div className="grid gap-2 sm:grid-cols-3">
          <Button onClick={() => onAction("expense")}>
            <ArrowUpRight size={16} /> {t.addExpense}
          </Button>
          <Button variant="secondary" onClick={() => onAction("income")}>
            <ArrowDownLeft size={16} /> {t.addIncome}
          </Button>
          <Button variant="secondary" onClick={() => onAction("transfer")}>
            <ArrowLeftRight size={16} /> {t.transfers}
          </Button>
        </div>
      ) : null}
    </div>
  );
}
function CategoryProgress({
  name,
  amount,
  currency,
  maximum,
}: {
  name: string;
  amount: string;
  currency: string;
  maximum: number;
}) {
  const percent = Math.round(Math.min(100, (Number(amount) / maximum) * 100));
  return (
    <div className="mb-3">
      <div className="flex justify-between text-xs">
        <span>{name}</span>
        <span>{formatMoney(amount, currency, "symbol")}</span>
      </div>
      <div className="mt-1 h-2 rounded bg-neutral-800" aria-hidden="true">
        <div
          className="h-2 rounded bg-rose-400"
          style={{ width: `${percent}%` }}
        />
      </div>
    </div>
  );
}
export function TransactionRow({
  item,
  locale,
  timezone,
}: {
  item: ConsumerFinanceTransaction;
  locale: FinanceLocale;
  timezone: string;
}) {
  const t = financeCopy(locale);
  const income = item.type === "INCOME";
  const sourceLabel =
    item.source === "RECEIPT"
      ? t.receipt
      : item.source === "AI"
        ? t.aiEntry
        : t.manualEntry;
  return (
    <div className="flex items-center justify-between border-b border-neutral-800 py-3 last:border-0">
      <div className="min-w-0">
        <p className="truncate text-sm">
          {item.merchantDisplay ||
            item.description ||
            (item.category
              ? localizeFinanceCategory(
                  item.category.name,
                  item.category.key,
                  locale,
                )
              : undefined) ||
            (income ? t.income : t.expense)}
        </p>
        <p className="text-xs text-neutral-500">
          {item.account?.name ?? t.accountFallback} ·{" "}
          {new Intl.DateTimeFormat(financeIntlLocale(locale), {
            timeZone: timezone,
          }).format(new Date(item.occurredAt))}
          {item.source ? ` · ${sourceLabel}` : ""}
          {item.itemCount
            ? ` · ${item.itemCount} ${item.itemCount === 1 ? t.item : t.items}`
            : ""}
        </p>
      </div>
      <strong
        className={`ml-3 shrink-0 whitespace-nowrap text-sm tabular-nums ${income ? "text-emerald-300" : "text-rose-300"}`}
      >
        {income ? "+" : "−"}
        {formatMoney(item.amount, item.currency, "symbol")}
      </strong>
    </div>
  );
}
