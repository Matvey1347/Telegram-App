import { Plus } from "lucide-react";
import type {
  ConsumerFinanceDashboard,
  ConsumerFinanceTransaction,
} from "@telegram-system/shared";
import { Button, Card, EmptyState } from "@/components/ui/primitives";
import { formatMoney } from "@/lib/features/finance/money";
import type { ConsumerFinanceScreen } from "./consumer-finance-screens";

export function FinanceDashboard({
  data,
  onNavigate,
}: {
  data: ConsumerFinanceDashboard;
  onNavigate: (screen: ConsumerFinanceScreen) => void;
}) {
  const { stats } = data;
  const accounts = stats.accounts.filter((account) => !account.archivedAt);
  const categories = stats.categories.slice(0, 6);
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-2">
        {[
          ["Income", stats.income, "text-emerald-300"],
          ["Expenses", stats.expense, "text-rose-300"],
          ["Net", stats.net, "text-sky-200"],
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
        <h2 className="mb-2 font-medium">Balances by account</h2>
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
                  ≈ {formatMoney(
                    account.equivalentBalance.amount,
                    account.equivalentBalance.currency,
                    "symbol",
                  )}
                </p>
              ) : null}
            </div>
          ))
        ) : (
          <EmptyState text="Add an account to track balances." />
        )}
      </Card>
      <Card>
        <h2 className="mb-3 font-medium">Spending this month</h2>
        {categories.length ? (
          categories.map((category) => (
            <CategoryProgress
              key={category.categoryId || category.name}
              name={category.name}
              amount={category.amount}
              currency={category.currency}
              maximum={Math.max(
                ...stats.categories.map((row) => Number(row.amount)),
                1,
              )}
            />
          ))
        ) : (
          <EmptyState text="Expenses will appear here." />
        )}
      </Card>
      <Card>
        <h2 className="mb-2 font-medium">Recent</h2>
        {data.recent.length ? (
          data.recent.map((item) => (
            <TransactionRow key={item.id} item={item} />
          ))
        ) : (
          <EmptyState text="No transactions yet." />
        )}
      </Card>
      <div className="grid grid-cols-3 gap-2">
        <Button onClick={() => onNavigate("transactions")}>
          <Plus size={16} /> Expense
        </Button>
        <Button variant="secondary" onClick={() => onNavigate("transactions")}>
          Income
        </Button>
        <Button variant="secondary" onClick={() => onNavigate("transactions")}>
          Transfer
        </Button>
      </div>
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
        <span>
          {formatMoney(amount, currency, "symbol")} · {percent}%
        </span>
      </div>
      <div
        role="progressbar"
        aria-label={`${name} spending`}
        aria-valuenow={percent}
        aria-valuemin={0}
        aria-valuemax={100}
        className="mt-1 h-2 rounded bg-neutral-800"
      >
        <div
          className="h-2 rounded bg-rose-400"
          style={{ width: `${percent}%` }}
        />
      </div>
    </div>
  );
}
export function TransactionRow({ item }: { item: ConsumerFinanceTransaction }) {
  const income = item.type === "INCOME";
  return (
    <div className="flex items-center justify-between border-b border-neutral-800 py-3 last:border-0">
      <div className="min-w-0">
        <p className="truncate text-sm">
          {item.description ||
            item.category?.name ||
            (income ? "Income" : "Expense")}
        </p>
        <p className="text-xs text-neutral-500">
          {item.account?.name ?? "Account"} ·{" "}
          {new Date(item.occurredAt).toLocaleDateString()}
        </p>
      </div>
      <strong className={income ? "text-emerald-300" : "text-rose-300"}>
        {income ? "+" : "−"}
        {formatMoney(item.amount, item.currency, "symbol")}
      </strong>
    </div>
  );
}
