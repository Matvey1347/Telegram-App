"use client";

import type { PropsWithChildren } from "react";
import { financeUiTokens } from "@consumer-finance/web/components/ui/finance-ui-tokens";
import {
  FinanceStateIllustration,
  type FinanceVisualState,
} from "@consumer-finance/web/components/ui/finance-state-illustration";
import {
  useFinanceVisualContext,
  type FinanceVisualContext,
} from "@consumer-finance/web/components/ui/finance-visual-context";
import { FinanceMoneyLoader } from "@consumer-finance/web/components/ui/finance-money-loader";

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
      <table className="w-max min-w-full text-left text-sm text-[#18382d] [&_thead_th]:sticky [&_thead_th]:top-0 [&_thead_th]:z-20 [&_thead_th]:bg-[#edf3eb]">
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
  loading: "border-[#e4ebe3] bg-white text-[#82958b]",
  waiting: "border-[#e4ebe3] bg-white text-[#82958b]",
  saving: "border-[#cfe5bc] bg-[#edf3eb] text-[#315944]",
  syncing: "border-[#cfe5bc] bg-[#edf3eb] text-[#315944]",
  empty: "border-[#e4ebe3] bg-white text-[#82958b]",
  error: "border-[#f1cfc7] bg-[#fff0ec] text-[#a74343]",
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
      className={`relative flex w-full flex-col overflow-hidden rounded-[24px] border p-3 shadow-[0_12px_36px_rgba(21,58,41,0.05)] sm:p-4 ${compact ? "min-h-32" : "min-h-48"} ${stateSurface[state]} ${className}`}
      role={role}
      aria-live={state === "error" ? "assertive" : "polite"}
      aria-busy={
        state === "loading" ||
        state === "waiting" ||
        state === "saving" ||
        state === "syncing"
      }
    >
      {state === "loading" ? (
        <FinanceMoneyLoader context={resolvedContext} compact={compact} />
      ) : (
        <FinanceStateIllustration
          state={state}
          context={resolvedContext}
          compact={compact}
        />
      )}
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
