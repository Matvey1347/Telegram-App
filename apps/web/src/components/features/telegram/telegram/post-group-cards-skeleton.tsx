
import { Skeleton } from "@/components/ui/primitives";
import { useI18n } from "@/providers/i18n-provider";

export function PostGroupCardsSkeleton({ count }: { count: number }) {
  const { t } = useI18n();
  return (
    <div
      className="grid gap-3 md:grid-cols-2 xl:grid-cols-3"
      role="status"
      aria-label={t("telegram.posts.support.loadingGroups")}
    >
      {Array.from({ length: count }, (_, index) => (
        <div
          key={index}
          className="min-h-[146px] rounded-xl border border-neutral-800 bg-neutral-900 p-4"
        >
          <div className="flex items-start gap-3">
            <Skeleton className="h-9 w-9 shrink-0 rounded-lg" />
            <div className="min-w-0 flex-1 space-y-2">
              <Skeleton className="h-5 w-36 max-w-[75%]" />
              <Skeleton className="h-6 w-24 rounded-full" />
            </div>
            <Skeleton className="h-8 w-8 rounded-md" />
          </div>
          <div className="mt-5 grid grid-cols-3 gap-2 border-t border-neutral-800 pt-3">
            <Skeleton className="h-8" />
            <Skeleton className="h-8" />
            <Skeleton className="h-8" />
          </div>
        </div>
      ))}
    </div>
  );
}
