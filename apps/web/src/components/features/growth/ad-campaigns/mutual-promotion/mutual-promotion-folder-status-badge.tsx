import type { MutualPromotionFolderStatus } from "@telegram-system/shared";

const statusPresentation: Record<
  MutualPromotionFolderStatus,
  { label: string; badge: string; dot: string }
> = {
  DRAFT: {
    label: "Draft",
    badge: "border-slate-700 bg-slate-900 text-slate-300",
    dot: "bg-slate-400",
  },
  SCHEDULED: {
    label: "Scheduled",
    badge: "border-sky-700/70 bg-sky-950/70 text-sky-200",
    dot: "bg-sky-400",
  },
  ACTIVE: {
    label: "Active",
    badge: "border-emerald-600/70 bg-emerald-950/80 text-emerald-200",
    dot: "bg-emerald-400",
  },
  DELETING: {
    label: "Finishing",
    badge: "border-amber-700/70 bg-amber-950/70 text-amber-200",
    dot: "bg-amber-400",
  },
  COMPLETED: {
    label: "Completed",
    badge: "border-violet-800/70 bg-violet-950/60 text-violet-200",
    dot: "bg-violet-400",
  },
  CANCELLED: {
    label: "Cancelled",
    badge: "border-rose-900/70 bg-rose-950/50 text-rose-300",
    dot: "bg-rose-500",
  },
};

export function MutualPromotionFolderStatusBadge({
  status,
}: {
  status: MutualPromotionFolderStatus;
}) {
  const presentation = statusPresentation[status];
  return (
    <span
      className={`inline-flex shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-medium ${presentation.badge}`}
    >
      <span
        data-testid="folder-status-dot"
        className={`h-1.5 w-1.5 rounded-full ${presentation.dot}`}
      />
      {presentation.label}
    </span>
  );
}
