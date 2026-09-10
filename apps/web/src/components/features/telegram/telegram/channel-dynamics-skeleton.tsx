export function ChannelDynamicsSkeleton() {
  return (
    <div
      role="status"
      aria-label="Loading channel dynamics"
      className="space-y-3"
    >
      <span className="sr-only">Loading channel dynamics</span>
      <div className="h-24 animate-pulse rounded-lg border border-neutral-800 bg-neutral-950/40" />
      <div className="grid gap-2 sm:grid-cols-3">
        {[0, 1, 2].map((item) => (
          <div
            key={item}
            data-testid="history-metric-skeleton"
            className="h-32 animate-pulse rounded-lg border border-neutral-800 bg-neutral-950/40"
          />
        ))}
      </div>
      <div className="h-12 animate-pulse rounded-lg border border-neutral-800 bg-neutral-950/40" />
      <div className="grid gap-3 lg:grid-cols-2">
        {[0, 1, 2, 3].map((item) => (
          <div
            key={item}
            data-testid="history-chart-skeleton"
            className="h-64 animate-pulse rounded-lg border border-neutral-800 bg-neutral-950/40"
          />
        ))}
      </div>
    </div>
  );
}
