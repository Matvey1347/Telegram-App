import type { PropsWithChildren } from "react";
import { financeUiTokens } from "./finance-ui-tokens";

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

export function Skeleton({ className = "" }: { className?: string }) {
  return (
    <div
      className={`animate-pulse rounded-md bg-neutral-800/80 ${className}`}
      aria-hidden="true"
    />
  );
}

export function LoadingState({ text = "Loading..." }: { text?: string }) {
  return (
    <div
      className="overflow-hidden rounded-lg border border-neutral-800 bg-neutral-900 p-4 sm:p-5"
      role="status"
      aria-label={text}
    >
      <span className="sr-only">{text}</span>
      <div className="space-y-3" aria-hidden="true">
        <Skeleton className="h-5 w-40" />
        <Skeleton className="h-3 w-full" />
        <Skeleton className="h-3 w-4/5" />
        <div className="grid grid-cols-2 gap-3 pt-2 sm:grid-cols-4">
          {Array.from({ length: 4 }, (_, index) => (
            <Skeleton key={index} className="h-16" />
          ))}
        </div>
      </div>
    </div>
  );
}

export function ErrorState({
  text = "Something went wrong.",
}: {
  text?: string;
}) {
  return (
    <div className="rounded-lg border border-rose-700 bg-rose-950/30 p-4 text-sm text-rose-200">
      {text}
    </div>
  );
}

export function EmptyState({ text = "No data yet." }: { text?: string }) {
  return (
    <div className="rounded-xl border border-dashed border-neutral-700 p-5 text-neutral-400">
      {text}
    </div>
  );
}
