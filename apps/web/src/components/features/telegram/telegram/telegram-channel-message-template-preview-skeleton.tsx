import { Card, Skeleton } from "@/components/ui/primitives";

export function TelegramChannelMessageTemplatePreviewSkeleton() {
  return (
    <div role="status" aria-label="Loading message template preview">
      <Card className="space-y-3 border-sky-950/80 bg-sky-950/20">
        <div className="flex items-center gap-3">
          <Skeleton className="size-9 shrink-0 rounded-full" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-3 w-2/5" />
            <Skeleton className="h-2.5 w-1/4" />
          </div>
        </div>
        <div className="space-y-2 rounded-xl bg-slate-900/80 p-4">
          <Skeleton className="h-3 w-4/5" />
          <Skeleton className="h-3 w-3/5" />
          <Skeleton className="h-3 w-5/6" />
          <Skeleton className="h-3 w-2/3" />
          <Skeleton className="h-3 w-3/4" />
          <Skeleton className="h-3 w-1/2" />
        </div>
        <span className="sr-only">Loading channel data and prices…</span>
      </Card>
    </div>
  );
}
