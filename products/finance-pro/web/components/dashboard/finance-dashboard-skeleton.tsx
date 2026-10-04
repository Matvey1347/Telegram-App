import { Card } from "./ui";

function SkeletonLine({ className = "" }: { className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={`block animate-pulse rounded bg-neutral-800/80 motion-reduce:animate-none ${className}`}
    />
  );
}

export function FinanceDashboardSkeleton({ label }: { label: string }) {
  return (
    <div
      role="status"
      aria-label={label}
      aria-busy="true"
      data-finance-dashboard-skeleton
      className="space-y-2"
    >
      <Card className="!p-3">
        <div className="grid grid-cols-2 gap-x-4 gap-y-2 sm:grid-cols-4">
          {Array.from({ length: 4 }, (_, index) => (
            <MetricSkeleton key={index} />
          ))}
        </div>
        <SkeletonLine className="mt-2 h-2.5 w-full max-w-lg" />
        <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-2 border-t border-neutral-800 pt-2 sm:grid-cols-3 lg:grid-cols-6">
          {Array.from({ length: 6 }, (_, index) => (
            <MetricSkeleton key={index} compact />
          ))}
        </div>
      </Card>
      <Card className="!p-3">
        <SkeletonLine className="mb-3 h-4 w-40" />
        {Array.from({ length: 4 }, (_, index) => (
          <div
            key={index}
            className="flex items-center justify-between gap-3 border-t border-neutral-800 py-2 first:border-0"
          >
            <div className="flex flex-1 items-center gap-2">
              <SkeletonLine className="h-7 w-7 shrink-0 rounded-lg" />
              <SkeletonLine className="h-3 w-full max-w-44" />
            </div>
            <SkeletonLine className="h-3 w-20" />
          </div>
        ))}
      </Card>
    </div>
  );
}

function MetricSkeleton({ compact = false }: { compact?: boolean }) {
  return (
    <div className="min-w-0">
      <SkeletonLine className="h-2.5 w-2/3" />
      <SkeletonLine className={`mt-2 w-4/5 ${compact ? "h-3.5" : "h-5"}`} />
    </div>
  );
}
