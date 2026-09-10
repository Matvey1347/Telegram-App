import {
  ArrowLeftRight,
  BarChart3,
  Bell,
  CalendarClock,
  CreditCard,
  HandCoins,
  Landmark,
  LayoutGrid,
  List,
  PiggyBank,
  Settings2,
  Tags,
  TrendingUp,
  WalletCards,
  type LucideIcon,
} from "lucide-react";
import type { FinanceVisualContext } from "./finance-visual-context";
import {
  FinanceStateContextGraphic,
  type FinanceStateGraphicKind,
} from "./finance-state-context-graphic";
import styles from "./finance-state-illustration.module.css";

export type FinanceVisualState =
  | "loading"
  | "waiting"
  | "saving"
  | "syncing"
  | "empty"
  | "error";

const contextIcons: Record<FinanceVisualContext, LucideIcon> = {
  overview: Landmark,
  transactions: List,
  transfers: ArrowLeftRight,
  debts: HandCoins,
  recurringPayments: CalendarClock,
  savings: PiggyBank,
  investments: TrendingUp,
  accounts: WalletCards,
  categories: Tags,
  analytics: BarChart3,
  budget: LayoutGrid,
  reminders: Bell,
  plan: CreditCard,
  settings: Settings2,
};

const contextKind: Record<FinanceVisualContext, FinanceStateGraphicKind> = {
  overview: "growth",
  transactions: "ledger",
  transfers: "flow",
  debts: "planning",
  recurringPayments: "planning",
  savings: "growth",
  investments: "growth",
  accounts: "ledger",
  categories: "ledger",
  analytics: "growth",
  budget: "planning",
  reminders: "planning",
  plan: "ledger",
  settings: "ledger",
};

const stateTone: Record<FinanceVisualState, string> = {
  loading: "text-sky-300",
  waiting: "text-amber-300",
  saving: "text-emerald-300",
  syncing: "text-blue-300",
  empty: "text-slate-300",
  error: "text-rose-300",
};

export function FinanceStateIllustration({
  state,
  context,
  compact = false,
}: {
  state: FinanceVisualState;
  context: FinanceVisualContext;
  compact?: boolean;
}) {
  const Icon = contextIcons[context];
  const focusedScene = context === "transfers" || context === "reminders";
  return (
    <div
      data-finance-state={state}
      data-finance-context={context}
      data-finance-visual-kind={contextKind[context]}
      data-finance-compact={compact ? "true" : "false"}
      className={`${styles.illustration} ${styles[state]} relative aspect-[600/136] w-full shrink-0 ${stateTone[state]}`}
      aria-hidden="true"
    >
      <svg
        viewBox="0 0 600 136"
        className="h-full w-full"
        fill="none"
        preserveAspectRatio="xMidYMid meet"
      >
        <rect
          className={styles.frame}
          x="1"
          y="1"
          width="598"
          height="134"
          rx="18"
        />
        <rect
          className={styles.panel}
          x="8"
          y="8"
          width="584"
          height="120"
          rx="14"
        />
        <FinanceStateContextGraphic context={context} />
        <StateMark state={state} />
        <rect
          className={styles.sweep}
          x="22"
          y="17"
          width="84"
          height="102"
          rx="18"
        />
      </svg>
      {!focusedScene ? (
        <span className={styles.iconTile}>
          <Icon size={24} strokeWidth={1.8} />
        </span>
      ) : null}
    </div>
  );
}

function StateMark({ state }: { state: FinanceVisualState }) {
  if (state === "error")
    return (
      <path
        data-finance-state-mark="error"
        d="M548 22L566 40M566 22L548 40"
        className={styles.errorMark}
      />
    );
  if (state === "saving")
    return (
      <path
        data-finance-state-mark="saving"
        d="M542 31L552 41L570 19"
        className={styles.successMark}
      />
    );
  if (state === "waiting")
    return (
      <path
        data-finance-state-mark="waiting"
        d="M556 18V31L567 38"
        className={styles.stateMark}
      />
    );
  return null;
}
