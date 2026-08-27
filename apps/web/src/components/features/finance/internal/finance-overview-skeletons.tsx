import { Skeleton } from "@/components/ui/primitives";

function AvatarSkeleton() {
  return <Skeleton className="h-9 w-9 shrink-0 rounded-lg" />;
}

function TextSkeleton() {
  return (
    <div className="min-w-0 flex-1 space-y-2">
      <Skeleton className="h-4 w-40 max-w-[75%]" />
      <Skeleton className="h-3 w-28 max-w-[55%]" />
    </div>
  );
}

export function AccountCardsSkeleton({ count }: { count: number }) {
  return (
    <div
      className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4"
      role="status"
      aria-label="Loading accounts"
    >
      {Array.from({ length: count }, (_, index) => (
        <div
          key={index}
          className="rounded-xl border border-neutral-800 bg-neutral-900 p-4"
        >
          <div className="flex items-center gap-3">
            <AvatarSkeleton />
            <TextSkeleton />
            <Skeleton className="h-7 w-7 shrink-0 rounded-md" />
          </div>
          <Skeleton className="mt-5 h-6 w-32" />
          <Skeleton className="mt-2 h-3 w-24" />
        </div>
      ))}
    </div>
  );
}

export function TransactionRowsSkeleton({ count }: { count: number }) {
  return (
    <div
      className="overflow-hidden rounded-xl border border-neutral-800"
      role="status"
      aria-label="Loading transactions"
    >
      {Array.from({ length: count }, (_, index) => (
        <div
          key={index}
          className="grid min-h-[65px] gap-3 border-b border-neutral-800 bg-neutral-950 px-4 py-3 last:border-0 sm:grid-cols-[minmax(0,1fr)_auto_32px] sm:items-center"
        >
          <div className="flex min-w-0 items-center gap-3">
            <AvatarSkeleton />
            <TextSkeleton />
          </div>
          <Skeleton className="h-5 w-24" />
          <Skeleton className="h-7 w-7 rounded-md" />
        </div>
      ))}
    </div>
  );
}

export function CategoryCardsSkeleton({ count }: { count: number }) {
  return (
    <div
      className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4"
      role="status"
      aria-label="Loading categories"
    >
      {Array.from({ length: count }, (_, index) => (
        <div
          key={index}
          className="flex min-h-[54px] items-center gap-2 rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2.5"
        >
          <Skeleton className="h-8 w-8 shrink-0 rounded-lg" />
          <Skeleton className="h-4 w-28 flex-1" />
          <Skeleton className="h-7 w-7 shrink-0 rounded-md" />
        </div>
      ))}
    </div>
  );
}

export function TransferRowsSkeleton({ count }: { count: number }) {
  return (
    <div className="grid gap-2" role="status" aria-label="Loading transfers">
      {Array.from({ length: count }, (_, index) => (
        <div
          key={index}
          className="grid min-h-[86px] gap-3 rounded-xl border border-neutral-800 bg-neutral-950 px-4 py-3 md:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)_32px] md:items-center"
        >
          <div className="flex items-center gap-3">
            <AvatarSkeleton />
            <TextSkeleton />
          </div>
          <Skeleton className="hidden h-5 w-5 md:block" />
          <div className="flex items-center gap-3">
            <AvatarSkeleton />
            <TextSkeleton />
          </div>
          <Skeleton className="h-7 w-7 rounded-md" />
        </div>
      ))}
    </div>
  );
}
