import type { CrmContactStage } from "@telegram-system/shared";

type StageTone = "info" | "warning" | "success" | "danger" | "muted";

const stagePresentation: Record<
  CrmContactStage,
  {
    label: string;
    tone: StageTone;
    className: string;
    selectClassName: string;
  }
> = {
  NEW: {
    label: "NEW",
    tone: "info",
    className: "border-blue-500/50 bg-blue-500/10 text-blue-200",
    selectClassName:
      "[&>div>button]:border-blue-500/50 [&>div>button]:bg-blue-500/10 [&>div>button]:text-blue-200",
  },
  LEAD: {
    label: "LEAD",
    tone: "warning",
    className: "border-amber-500/50 bg-amber-500/10 text-amber-200",
    selectClassName:
      "[&>div>button]:border-amber-500/50 [&>div>button]:bg-amber-500/10 [&>div>button]:text-amber-200",
  },
  CUSTOMER: {
    label: "CUSTOMER",
    tone: "success",
    className: "border-teal-500/50 bg-teal-500/10 text-teal-200",
    selectClassName:
      "[&>div>button]:border-teal-500/50 [&>div>button]:bg-teal-500/10 [&>div>button]:text-teal-200",
  },
  LOST: {
    label: "LOST",
    tone: "danger",
    className: "border-rose-500/50 bg-rose-500/10 text-rose-200",
    selectClassName:
      "[&>div>button]:border-rose-500/50 [&>div>button]:bg-rose-500/10 [&>div>button]:text-rose-200",
  },
  ANOTHER: {
    label: "ANOTHER",
    tone: "muted",
    className: "border-neutral-700 bg-neutral-800/70 text-neutral-300",
    selectClassName:
      "[&>div>button]:border-neutral-700 [&>div>button]:bg-neutral-800/70 [&>div>button]:text-neutral-300",
  },
};

export const crmContactStages = Object.keys(
  stagePresentation,
) as CrmContactStage[];

export function crmContactStagePresentation(stage: CrmContactStage) {
  return stagePresentation[stage];
}
