import type { CrmContactStage } from "@telegram-system/shared";

type StageTone =
  | "info"
  | "warning"
  | "success"
  | "danger"
  | "muted";

const stagePresentation: Record<
  CrmContactStage,
  { label: string; tone: StageTone; className: string }
> = {
  NEW: {
    label: "NEW",
    tone: "info",
    className: "border-blue-500/50 bg-blue-500/10 text-blue-200",
  },
  LEAD: {
    label: "LEAD",
    tone: "warning",
    className: "border-amber-500/50 bg-amber-500/10 text-amber-200",
  },
  QUALIFIED: {
    label: "QUALIFIED",
    tone: "info",
    className: "border-violet-500/50 bg-violet-500/10 text-violet-200",
  },
  FOLLOW_UP: {
    label: "FOLLOW-UP",
    tone: "info",
    className: "border-sky-500/50 bg-sky-500/10 text-sky-200",
  },
  CUSTOMER: {
    label: "CUSTOMER",
    tone: "success",
    className: "border-teal-500/50 bg-teal-500/10 text-teal-200",
  },
  LOST: {
    label: "LOST",
    tone: "danger",
    className: "border-rose-500/50 bg-rose-500/10 text-rose-200",
  },
  ARCHIVED: {
    label: "ARCHIVED",
    tone: "muted",
    className: "border-neutral-700 bg-neutral-800/70 text-neutral-300",
  },
};

export const crmContactStages = Object.keys(
  stagePresentation,
) as CrmContactStage[];

export function crmContactStagePresentation(stage: CrmContactStage) {
  return stagePresentation[stage];
}
