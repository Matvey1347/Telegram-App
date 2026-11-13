import { Skeleton } from "@/components/ui/primitives";

export function CampaignsTableSkeleton() {
  return (
    <div role="status" aria-label="Loading campaigns" aria-busy="true" className="space-y-3">
      <Skeleton className="h-11 w-full rounded-lg" />
      {Array.from({ length: 3 }, (_, index) => (
        <div key={index} className="grid gap-4 rounded-xl border border-neutral-800 p-4 lg:grid-cols-[1.2fr_1fr_auto]">
          <div className="space-y-3">
            <Skeleton className="h-5 w-2/3" />
            <Skeleton className="h-4 w-1/2" />
          </div>
          <Skeleton className="h-20 w-full rounded-lg" />
          <Skeleton className="h-9 w-9 justify-self-end rounded-md" />
        </div>
      ))}
    </div>
  );
}
