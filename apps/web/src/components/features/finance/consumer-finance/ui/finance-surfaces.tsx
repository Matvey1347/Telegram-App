"use client";

import type { PropsWithChildren } from "react";
import { financeUiTokens } from "./finance-ui-tokens";
import {
  FinanceStateIllustration,
  type FinanceVisualState,
} from "./finance-state-illustration";
import {
  useFinanceVisualContext,
  type FinanceVisualContext,
} from "./finance-visual-context";

export function Card({
  children,
  className = "",
}: PropsWithChildren<{ className?: string }>) {
  return (
    <div className={`p-4 sm:p-5 ${financeUiTokens.card} ${className}`}>
      {children}
    </div>
  );
}

export function Table({ children }: PropsWithChildren) {
  return (
    <div className="w-full overflow-x-auto overflow-y-clip [scrollbar-color:#3a3a3a_transparent] [scrollbar-width:thin] [-webkit-overflow-scrolling:touch] max-sm:-mx-1 max-sm:px-1">
      <table className="w-max min-w-full text-left text-sm text-neutral-200 [&_thead_th]:sticky [&_thead_th]:top-0 [&_thead_th]:z-20 [&_thead_th]:bg-slate-900">
        {children}
      </table>
    </div>
  );
}

type FinanceFeedbackStateProps = {
  text?: string;
  context?: FinanceVisualContext;
  compact?: boolean;
  className?: string;
};

const stateSurface: Record<FinanceVisualState, string> = {
  loading: "border-sky-950 bg-[#0c1117] text-neutral-300",
  waiting: "border-amber-950 bg-[#0c1117] text-neutral-300",
  saving: "border-emerald-950 bg-[#0c1117] text-neutral-200",
  syncing: "border-blue-950 bg-[#0c1117] text-neutral-200",
  empty: "border-neutral-800 bg-[#0c1117] text-neutral-300",
  error: "border-rose-900 bg-[#120e12] text-rose-100",
};

export function FinanceFeedbackState({
  state,
  text,
  context,
  compact = false,
  className = "",
}: FinanceFeedbackStateProps & { state: FinanceVisualState }) {
  const inheritedContext = useFinanceVisualContext();
  const resolvedContext = context ?? inheritedContext;
  const role = state === "error" ? "alert" : "status";
  return (
    <div
      data-finance-feedback={state}
      className={`relative flex w-full flex-col overflow-hidden rounded-2xl border p-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.035),0_18px_50px_rgba(0,0,0,0.18)] sm:p-4 ${compact ? "min-h-32" : "min-h-48"} ${stateSurface[state]} ${className}`}
      role={role}
      aria-live={state === "error" ? "assertive" : "polite"}
      aria-busy={
        state === "loading" ||
        state === "waiting" ||
        state === "saving" ||
        state === "syncing"
      }
    >
      <FinanceStateIllustration
        state={state}
        context={resolvedContext}
        compact={compact}
      />
      {text ? (
        <p className="w-full px-2 pb-1 pt-3 text-center text-sm font-medium leading-6">
          {text}
        </p>
      ) : null}
    </div>
  );
}

export function LoadingState({
  text = "Loading...",
  compact = false,
  ...props
}: FinanceFeedbackStateProps) {
  return (
    <FinanceFeedbackState
      state="loading"
      text={text}
      compact={compact}
      {...props}
    />
  );
}

export function WaitingState(props: FinanceFeedbackStateProps) {
  return <FinanceFeedbackState state="waiting" {...props} />;
}

export function SavingState(props: FinanceFeedbackStateProps) {
  return <FinanceFeedbackState state="saving" {...props} />;
}

export function SyncingState(props: FinanceFeedbackStateProps) {
  return <FinanceFeedbackState state="syncing" {...props} />;
}

export function ErrorState({
  text = "Something went wrong.",
  ...props
}: FinanceFeedbackStateProps) {
  return <FinanceFeedbackState state="error" text={text} {...props} />;
}

export function EmptyState({
  text = "No data yet.",
  ...props
}: FinanceFeedbackStateProps) {
  return <FinanceFeedbackState state="empty" text={text} {...props} />;
}
