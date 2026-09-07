"use client";

import { Modal, Skeleton } from "@/components/ui/primitives";

function ChannelCardSkeleton() {
  return (
    <div className="rounded-xl border border-neutral-800 bg-neutral-950/40 p-4">
      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2.5">
          <Skeleton className="h-9 w-9 shrink-0 rounded-full" />
          <div className="min-w-0 flex-1 space-y-2">
            <Skeleton className="h-4 w-44 max-w-full" />
            <Skeleton className="h-3 w-24" />
          </div>
        </div>
        <Skeleton className="h-6 w-20 shrink-0 rounded-full" />
      </div>
      <div className="mt-4 grid grid-cols-3 gap-3">
        {Array.from({ length: 3 }, (_, index) => (
          <div key={index} className="space-y-2">
            <Skeleton className="h-3 w-16 max-w-full" />
            <Skeleton className="h-5 w-10" />
          </div>
        ))}
      </div>
    </div>
  );
}

export function MutualPromotionFolderDetailSkeletonModal({
  open,
  title,
  onClose,
}: {
  open: boolean;
  title?: string;
  onClose: () => void;
}) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title ?? "Folder details"}
      size="xl"
      headerAction={<Skeleton className="h-6 w-14 rounded-full" />}
    >
      <div
        role="status"
        aria-label="Loading folder details…"
        aria-busy="true"
        className="space-y-5"
      >
        <span className="sr-only">Loading folder details…</span>

        <div className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-neutral-800 bg-neutral-950/40 p-4">
          <div className="min-w-[240px] flex-1 space-y-2.5">
            <Skeleton className="h-4 w-72 max-w-full" />
            <Skeleton className="h-4 w-48 max-w-[80%]" />
          </div>
          <div className="flex gap-2">
            <Skeleton className="h-9 w-28" />
            <Skeleton className="h-9 w-24" />
          </div>
        </div>

        <div className="rounded-xl border border-neutral-800 bg-neutral-950/40 p-4">
          <Skeleton className="h-5 w-64 max-w-full" />
          <Skeleton className="mt-2 h-3 w-full max-w-2xl" />
          <div className="mt-4 grid gap-3 sm:grid-cols-[minmax(0,1fr)_120px_190px]">
            <Skeleton className="h-10" />
            <Skeleton className="h-10" />
            <Skeleton className="h-10" />
          </div>
        </div>

        <section className="space-y-3">
          <div className="space-y-2">
            <Skeleton className="h-5 w-52" />
            <Skeleton className="h-3 w-full max-w-xl" />
          </div>
          <div className="grid gap-3 lg:grid-cols-2">
            <ChannelCardSkeleton />
            <ChannelCardSkeleton />
          </div>
        </section>

        <section className="space-y-3">
          <Skeleton className="h-5 w-40" />
          <div className="space-y-2">
            <Skeleton className="h-16 w-full rounded-xl" />
            <Skeleton className="h-16 w-full rounded-xl" />
          </div>
        </section>
      </div>
    </Modal>
  );
}
