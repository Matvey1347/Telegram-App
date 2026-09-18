import { Skeleton } from "@/components/ui/primitives";

export function AdFormSkeleton() {
  return (
    <div className="space-y-4" role="status" aria-label="Loading form">
      <span className="sr-only">Loading form…</span>
      <div className="grid gap-3 md:grid-cols-2">
        <Skeleton className="h-[68px]" />
        <Skeleton className="h-[68px]" />
      </div>
      <Skeleton className="h-[68px]" />
      <Skeleton className="h-[68px]" />
      <Skeleton className="h-28" />
      <div className="flex justify-end gap-2">
        <Skeleton className="h-10 w-24" />
        <Skeleton className="h-10 w-24" />
      </div>
    </div>
  );
}
