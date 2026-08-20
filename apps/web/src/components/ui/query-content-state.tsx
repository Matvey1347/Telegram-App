import type { ReactNode } from "react";
import { Button, EmptyState, ErrorState, LoadingState } from "./primitives";

type QueryContentStateProps = {
  children: ReactNode;
  isLoading: boolean;
  isError: boolean;
  isEmpty: boolean;
  loadingText?: string;
  errorText?: string;
  emptyText?: string;
  onRetry?: () => void;
};

/**
 * Renders exactly one state for query-backed content.
 * Existing content wins over background loading/error states so refetches do not
 * replace useful data with a full-page placeholder.
 */
export function QueryContentState({
  children,
  isLoading,
  isError,
  isEmpty,
  loadingText,
  errorText,
  emptyText,
  onRetry,
}: QueryContentStateProps) {
  if (!isEmpty) return <>{children}</>;
  if (isLoading) return <LoadingState text={loadingText} />;
  if (isError)
    return (
      <div className="space-y-2">
        <ErrorState text={errorText} />
        {onRetry ? (
          <Button variant="secondary" onClick={onRetry}>
            Retry
          </Button>
        ) : null}
      </div>
    );
  return <EmptyState text={emptyText} />;
}
