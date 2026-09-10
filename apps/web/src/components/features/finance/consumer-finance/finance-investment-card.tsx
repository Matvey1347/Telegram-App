import {
  ArrowDownToLine,
  ArrowUpFromLine,
  CircleDollarSign,
  Pencil,
  TrendingDown,
  TrendingUp,
} from "lucide-react";
import type { ConsumerFinanceInvestment } from "@telegram-system/shared";
import { Button, Card } from "./ui";
import type { FinanceLocale } from "./i18n/core";
import { financeInvestmentsCopy } from "./i18n/investments";
import { investmentTypeLabel } from "./finance-investment-editor";
import { formatMoney } from "@/lib/features/finance/consumer-finance-money";

export function FinanceInvestmentCard({
  investment,
  locale,
  onOpen,
  onEdit,
}: {
  investment: ConsumerFinanceInvestment;
  locale: FinanceLocale;
  onOpen: () => void;
  onEdit: () => void;
}) {
  const t = financeInvestmentsCopy(locale);
  const pnl = Number(investment.profitLoss);
  const ResultIcon =
    pnl > 0 ? TrendingUp : pnl < 0 ? TrendingDown : CircleDollarSign;
  const resultLabel =
    pnl > 0 ? t.positiveResult : pnl < 0 ? t.negativeResult : t.neutralResult;
  return (
    <Card className="space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="truncate font-semibold">{investment.name}</h2>
            <span className="rounded-md bg-neutral-800 px-2 py-0.5 text-xs text-neutral-300">
              {investment.status === "ACTIVE"
                ? t.active
                : investment.status === "CLOSED"
                  ? t.closed
                  : t.archived}
            </span>
          </div>
          <p className="mt-1 text-xs text-neutral-500">
            {investmentTypeLabel(investment.type, t)} · {investment.currency}
          </p>
        </div>
        {investment.status !== "ARCHIVED" ? (
          <button
            type="button"
            onClick={onEdit}
            aria-label={t.editInvestment}
            className="min-h-10 min-w-10 rounded-lg text-neutral-300 hover:bg-neutral-800"
          >
            <Pencil className="mx-auto" size={17} />
          </button>
        ) : null}
      </div>
      {investment.status === "ARCHIVED" ? (
        <p className="text-xs text-neutral-400">{t.archivedReadOnly}</p>
      ) : null}
      <div className="grid grid-cols-2 gap-3 text-sm">
        <Metric
          icon={<ArrowDownToLine size={14} />}
          label={t.totalInvested}
          value={formatMoney(
            investment.totalInvested,
            investment.currency,
            "symbol",
          )}
        />
        <Metric
          icon={<ArrowUpFromLine size={14} />}
          label={t.totalReturned}
          value={formatMoney(
            investment.totalReturned,
            investment.currency,
            "symbol",
          )}
        />
        <Metric
          label={t.currentValue}
          value={formatMoney(
            investment.currentValue,
            investment.currency,
            "symbol",
          )}
        />
        <Metric
          label={t.profitLoss}
          value={formatMoney(
            investment.profitLoss,
            investment.currency,
            "symbol",
          )}
        />
      </div>
      <p
        className={`flex items-center gap-2 text-sm ${pnl > 0 ? "text-emerald-300" : pnl < 0 ? "text-rose-300" : "text-neutral-300"}`}
      >
        <ResultIcon size={17} aria-hidden="true" />
        <span>
          {resultLabel} ·{" "}
          {investment.returnPercentage == null
            ? "—"
            : `${investment.returnPercentage.toFixed(2)}%`}
        </span>
      </p>
      <Button className="w-full" variant="secondary" onClick={onOpen}>
        {t.openDetails}
      </Button>
    </Card>
  );
}
function Metric({
  label,
  value,
  icon,
}: {
  label: string;
  value: string;
  icon?: React.ReactNode;
}) {
  return (
    <div>
      <p className="flex items-center gap-1 text-xs text-neutral-500">
        {icon}
        {label}
      </p>
      <p className="mt-1 font-medium tabular-nums">{value}</p>
    </div>
  );
}
