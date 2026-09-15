function SkeletonBlock({ className = "" }: { className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={`block animate-pulse rounded-md bg-neutral-800/80 motion-reduce:animate-none ${className}`}
    />
  );
}

export function FinanceAnalyticsSkeleton({ label }: { label: string }) {
  return (
    <div
      role="status"
      aria-label={label}
      aria-busy="true"
      data-finance-analytics-skeleton
      className="mt-3 space-y-3"
    >
      <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3 xl:grid-cols-9">
        {Array.from({ length: 9 }, (_, index) => (
          <div
            key={index}
            className="min-h-[68px] rounded-lg border border-neutral-800 bg-neutral-950/35 p-2"
          >
            <SkeletonBlock className="h-2.5 w-2/3" />
            <SkeletonBlock className="mt-3 h-5 w-4/5" />
          </div>
        ))}
      </div>
      <SkeletonBlock className="h-2.5 w-full max-w-xl" />
      <div className="grid gap-2 lg:grid-cols-3">
        {Array.from({ length: 3 }, (_, index) => (
          <div
            key={index}
            className="min-h-48 rounded-lg border border-neutral-800 bg-neutral-950/30 p-3"
          >
            <SkeletonBlock className="h-4 w-1/2" />
            <div className="mt-5 flex items-center gap-4">
              <SkeletonBlock className="h-24 w-24 shrink-0 rounded-full" />
              <div className="flex-1 space-y-3">
                <SkeletonBlock className="h-3 w-full" />
                <SkeletonBlock className="h-3 w-5/6" />
                <SkeletonBlock className="h-3 w-2/3" />
              </div>
            </div>
          </div>
        ))}
      </div>
      <div className="grid gap-3 xl:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
        <SkeletonPanel />
        <SkeletonPanel />
      </div>
      <div className="space-y-2">
        <SkeletonBlock className="h-4 w-36" />
        <div className="grid gap-2 sm:grid-cols-3">
          <SkeletonBlock className="h-20" />
          <SkeletonBlock className="h-20" />
          <SkeletonBlock className="h-20" />
        </div>
      </div>
      <div className="rounded-lg border border-neutral-800 p-3">
        <SkeletonBlock className="h-4 w-32" />
        <SkeletonBlock className="mt-4 h-10 w-full" />
        <SkeletonBlock className="mt-2 h-10 w-full" />
      </div>
    </div>
  );
}

function SkeletonPanel() {
  return (
    <div className="min-h-44 rounded-lg border border-neutral-800 bg-neutral-950/30 p-3">
      <SkeletonBlock className="h-4 w-2/5" />
      <SkeletonBlock className="mt-5 h-28 w-full" />
    </div>
  );
}
