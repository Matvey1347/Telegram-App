import { Skeleton } from "@/components/ui/primitives";

export function ChannelDynamicsSkeleton() {
  return (
    <div
      role="status"
      aria-label="Loading channel dynamics"
      className="space-y-3"
    >
      <span className="sr-only">Loading channel dynamics</span>
      <div className="rounded-lg border border-neutral-800 bg-neutral-950/40 p-3">
        <Skeleton className="h-3 w-28" />
        <Skeleton className="mt-3 h-5 w-36" />
      </div>
      <div className="grid gap-2 sm:grid-cols-3">
        {[0, 1, 2].map((item) => (
          <div
            key={item}
            data-testid="history-metric-skeleton"
            className="h-32 rounded-lg border border-neutral-800 bg-neutral-950/40 p-3"
          >
            <Skeleton className="h-3 w-32 max-w-[70%]" />
            <Skeleton className="mt-3 h-3 w-44 max-w-[85%]" />
            <Skeleton className="mt-5 h-5 w-24" />
            <Skeleton className="mt-2 h-3 w-16" />
          </div>
        ))}
      </div>
      <div className="flex h-14 items-center justify-between rounded-lg border border-neutral-800 bg-neutral-950/40 px-3">
        <Skeleton className="h-4 w-32" />
        <Skeleton className="h-4 w-28" />
      </div>
      <div className="grid gap-3 lg:grid-cols-2">
        {[0, 1, 2, 3].map((item) => (
          <div
            key={item}
            data-testid="history-chart-skeleton"
            className="h-64 rounded-lg border border-neutral-800 bg-neutral-950/40 p-4"
          >
            <Skeleton className="h-4 w-40 max-w-[60%]" />
            <Skeleton className="mt-3 h-3 w-72 max-w-[85%]" />
            <div className="mt-8 flex h-32 items-end gap-3 border-b border-l border-neutral-800 px-3">
              {[
                "h-[45%]",
                "h-3/4",
                "h-[55%]",
                "h-[90%]",
                "h-[65%]",
                "h-[82%]",
              ].map((height, index) => (
                <Skeleton
                  key={index}
                  className={`flex-1 rounded-b-none ${height}`}
                />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
