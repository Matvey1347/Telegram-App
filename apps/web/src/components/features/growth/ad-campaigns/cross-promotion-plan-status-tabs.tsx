import type {
  CrossPromotionPlan,
  CrossPromotionPlanStatus,
} from "@telegram-system/shared";
import { Check, Circle, Clock3, FilePenLine, type LucideIcon } from "lucide-react";

export type CrossPromotionPlanTab =
  | "DRAFT"
  | "ACTIVE"
  | "SCHEDULED"
  | "COMPLETED";

export const crossPromotionPlanTabDefinitions: Array<{
  value: CrossPromotionPlanTab;
  label: string;
  statuses: CrossPromotionPlanStatus[];
  icon: LucideIcon;
  activeClassName: string;
  countClassName: string;
}> = [
  {
    value: "DRAFT",
    label: "Draft",
    statuses: ["DRAFT"],
    icon: FilePenLine,
    activeClassName: "bg-violet-600 text-white",
    countClassName: "bg-violet-500/15 text-violet-300",
  },
  {
    value: "ACTIVE",
    label: "Active",
    statuses: ["ACTIVE"],
    icon: Circle,
    activeClassName: "bg-emerald-600 text-white",
    countClassName: "bg-emerald-500/15 text-emerald-300",
  },
  {
    value: "SCHEDULED",
    label: "Scheduled",
    statuses: ["SCHEDULED"],
    icon: Clock3,
    activeClassName: "bg-sky-600 text-white",
    countClassName: "bg-sky-500/15 text-sky-300",
  },
  {
    value: "COMPLETED",
    label: "Completed",
    statuses: ["CANCELLED", "COMPLETED"],
    icon: Check,
    activeClassName: "bg-neutral-600 text-white",
    countClassName: "bg-neutral-700 text-neutral-300",
  },
];

export function plansForCrossPromotionTab(
  plans: CrossPromotionPlan[],
  tab: CrossPromotionPlanTab,
) {
  const statuses = crossPromotionPlanTabDefinitions.find((item) => item.value === tab)?.statuses;
  return plans.filter((plan) => statuses?.includes(plan.status));
}

export function CrossPromotionPlanStatusTabs({
  plans,
  value,
  onChange,
  ariaLabel = "Promotion status",
}: {
  plans: CrossPromotionPlan[];
  value: CrossPromotionPlanTab;
  onChange: (value: CrossPromotionPlanTab) => void;
  ariaLabel?: string;
}) {
  return (
    <div
      className="flex w-full gap-1 overflow-x-auto rounded-xl border border-neutral-800 bg-neutral-900/70 p-1"
      role="tablist"
      aria-label={ariaLabel}
    >
      {crossPromotionPlanTabDefinitions.map((tab) => {
        const active = tab.value === value;
        const count = plans.filter((plan) => tab.statuses.includes(plan.status)).length;
        const Icon = tab.icon;
        return (
          <button
            key={tab.value}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(tab.value)}
            className={`inline-flex min-h-10 shrink-0 items-center gap-2 rounded-lg px-3 text-sm font-medium transition ${
              active
                ? tab.activeClassName
                : "text-neutral-300 hover:bg-neutral-800 hover:text-white"
            }`}
          >
            <Icon aria-hidden="true" size={15} strokeWidth={2} className="shrink-0" />
            {tab.label}
            <span
              className={`rounded-full px-1.5 py-0.5 text-xs tabular-nums ${
                active
                  ? "bg-white/15 text-white"
                  : tab.countClassName
              }`}
            >
              {count}
            </span>
          </button>
        );
      })}
    </div>
  );
}
