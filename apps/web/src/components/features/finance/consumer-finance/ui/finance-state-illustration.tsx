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
import type { FinanceStateGraphicKind } from "./finance-state-context-graphic";
import { FinanceStateContextGraphic } from "./finance-state-context-graphic";
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
  return (
    <div
      data-finance-state={state}
      data-finance-context={context}
      data-finance-visual-kind={contextKind[context]}
      data-finance-compact={compact ? "true" : "false"}
      className={`${styles.illustration} ${styles[state]} relative aspect-[600/136] w-full shrink-0 ${stateTone[state]}`}
      aria-hidden="true"
    >
      <div className={styles.ambient} />
      <svg
        viewBox="0 0 600 136"
        preserveAspectRatio="xMidYMid meet"
        className={styles.contextCanvas}
      >
        <FinanceStateContextGraphic context={context} />
      </svg>
      <span className={styles.iconTile}>
        <Icon size={compact ? 17 : 21} strokeWidth={1.8} />
      </span>
      <StateMark state={state} />
    </div>
  );
}

function StateMark({ state }: { state: FinanceVisualState }) {
  if (state === "error")
    return (
      <svg viewBox="0 0 32 32" className={styles.stateBadge} fill="none">
        <path
          data-finance-state-mark="error"
          d="M10 10L22 22M22 10L10 22"
          className={styles.errorMark}
        />
      </svg>
    );
  if (state === "saving")
    return (
      <svg viewBox="0 0 32 32" className={styles.stateBadge} fill="none">
        <path
          data-finance-state-mark="saving"
          d="M8 16L14 22L24 10"
          className={styles.successMark}
        />
      </svg>
    );
  if (state === "waiting")
    return (
      <svg viewBox="0 0 32 32" className={styles.stateBadge} fill="none">
        <path
          data-finance-state-mark="waiting"
          d="M16 7V16L22 20"
          className={styles.stateMark}
        />
      </svg>
    );
  if (state === "loading" || state === "syncing")
    return (
      <svg viewBox="0 0 32 32" className={styles.stateBadge} fill="none">
        <circle cx="16" cy="16" r="8" className={styles.loadingTrack} />
        <path
          data-finance-state-mark={state}
          d="M16 8a8 8 0 0 1 8 8"
          className={styles.loadingMark}
        />
      </svg>
    );
  if (state === "empty")
    return (
      <svg viewBox="0 0 32 32" className={styles.stateBadge} fill="none">
        <path
          data-finance-state-mark="empty"
          d="M9 16h14"
          className={styles.stateMark}
        />
      </svg>
    );
  return null;
}
