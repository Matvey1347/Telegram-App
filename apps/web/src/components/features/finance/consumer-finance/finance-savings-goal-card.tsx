import {
  Archive,
  ArrowRightLeft,
  CheckCircle2,
  History,
  MinusCircle,
  Pencil,
  PlusCircle,
  ShieldAlert,
  ShieldCheck,
} from "lucide-react";
import type { ConsumerFinanceSavingsGoal } from "@telegram-system/shared";
import { Button, Card } from "./ui";
import type { FinanceLocale } from "./i18n/core";
import { financeSavingsCopy } from "./i18n/savings";
import { formatMoney } from "@/lib/features/finance/consumer-finance-money";

export function FinanceSavingsGoalCard({
  goal,
  locale,
  onEdit,
  onAction,
  onHistory,
  onComplete,
  onArchive,
}: {
  goal: ConsumerFinanceSavingsGoal;
  locale: FinanceLocale;
  onEdit: () => void;
  onAction: (action: "ALLOCATE" | "RELEASE" | "REALLOCATE") => void;
  onHistory: () => void;
  onComplete: () => void;
  onArchive: () => void;
}) {
  const t = financeSavingsCopy(locale);
  const active = goal.status === "ACTIVE";
  const funding =
    goal.fundingStatus === "BACKED"
      ? t.fundingBacked
      : goal.fundingStatus === "UNDERFUNDED"
        ? t.fundingUnderfunded
        : t.fundingLegacy;
  const FundingIcon =
    goal.fundingStatus === "BACKED" ? ShieldCheck : ShieldAlert;
  return (
    <Card className="space-y-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="truncate font-semibold">{goal.name}</h2>
            <span className="rounded-md bg-neutral-800 px-2 py-0.5 text-xs text-neutral-300">
              {goal.status === "ACTIVE"
                ? t.active
                : goal.status === "COMPLETED"
                  ? t.completed
                  : t.archived}
            </span>
          </div>
          <p className="mt-1 text-xs text-neutral-500">
            {goal.targetDate
              ? `${t.due} ${goal.targetDate.slice(0, 10)}`
              : t.noDate}
          </p>
        </div>
        <div className="flex gap-1">
          {active ? (
            <button
              type="button"
              onClick={onEdit}
              aria-label={t.editGoal}
              className="min-h-10 min-w-10 rounded-lg text-neutral-300 hover:bg-neutral-800"
            >
              <Pencil className="mx-auto" size={17} />
            </button>
          ) : null}
          <button
            type="button"
            onClick={onHistory}
            aria-label={t.history}
            className="min-h-10 min-w-10 rounded-lg text-neutral-300 hover:bg-neutral-800"
          >
            <History className="mx-auto" size={17} />
          </button>
        </div>
      </div>
      <div
        role="progressbar"
        aria-label={`${goal.name}: ${t.progress}`}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.min(100, Math.round(goal.progressPercentage))}
        className="h-2 rounded bg-neutral-800"
      >
        <div
          className="h-2 rounded bg-emerald-400"
          style={{ width: `${Math.min(100, goal.progressPercentage)}%` }}
        />
      </div>
      <div className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
        <Metric
          label={t.allocated}
          value={formatMoney(goal.currentAllocated, goal.currency, "symbol")}
        />
        <Metric
          label={t.target}
          value={formatMoney(goal.targetAmount, goal.currency, "symbol")}
        />
        <Metric
          label={t.remaining}
          value={formatMoney(goal.remainingAmount, goal.currency, "symbol")}
        />
        <Metric
          label={t.backed}
          value={formatMoney(goal.backedAmount, goal.currency, "symbol")}
        />
      </div>
      <p
        className={`flex items-center gap-2 text-xs ${goal.fundingStatus === "BACKED" ? "text-emerald-300" : "text-amber-300"}`}
      >
        <FundingIcon size={15} aria-hidden="true" />
        {funding}
      </p>
      {Number(goal.legacyUnlinkedAmount) > 0 ? (
        <p
          role="note"
          className="rounded-lg border border-amber-800/60 bg-amber-950/20 p-2 text-xs text-amber-200"
        >
          {t.legacyWarning} (
          {formatMoney(goal.legacyUnlinkedAmount, goal.currency, "symbol")})
        </p>
      ) : null}
      {goal.note ? (
        <p className="text-sm text-neutral-400">{goal.note}</p>
      ) : null}
      {goal.status !== "ARCHIVED" ? (
        <div className="flex flex-wrap gap-2">
          {active ? (
            <Button onClick={() => onAction("ALLOCATE")}>
              <PlusCircle size={16} />
              {t.allocate}
            </Button>
          ) : null}
          <Button variant="secondary" onClick={() => onAction("RELEASE")}>
            <MinusCircle size={16} />
            {t.release}
          </Button>
          <Button variant="secondary" onClick={() => onAction("REALLOCATE")}>
            <ArrowRightLeft size={16} />
            {t.move}
          </Button>
          {active ? (
            <Button variant="secondary" onClick={onComplete}>
              <CheckCircle2 size={16} />
              {t.complete}
            </Button>
          ) : null}
          <Button variant="secondary" onClick={onArchive}>
            <Archive size={16} />
            {t.archive}
          </Button>
        </div>
      ) : null}
    </Card>
  );
}
function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs text-neutral-500">{label}</p>
      <p className="mt-1 font-medium tabular-nums">{value}</p>
    </div>
  );
}
