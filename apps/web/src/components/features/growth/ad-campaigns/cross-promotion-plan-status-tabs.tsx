import type {
  CrossPromotionPlan,
  CrossPromotionPlanStatus,
} from "@telegram-system/shared";

export type CrossPromotionPlanTab = "ACTIVE" | "SCHEDULED" | "COMPLETED";

const tabDefinitions: Array<{
  value: CrossPromotionPlanTab;
  label: string;
  statuses: CrossPromotionPlanStatus[];
}> = [
  { value: "ACTIVE", label: "Active", statuses: ["ACTIVE"] },
  {
    value: "SCHEDULED",
    label: "Scheduled",
    statuses: ["DRAFT", "SCHEDULED"],
  },
  {
    value: "COMPLETED",
    label: "Completed",
    statuses: ["CANCELLED", "COMPLETED"],
  },
];

export function plansForCrossPromotionTab(
  plans: CrossPromotionPlan[],
  tab: CrossPromotionPlanTab,
) {
  const statuses = tabDefinitions.find((item) => item.value === tab)?.statuses;
  return plans.filter((plan) => statuses?.includes(plan.status));
}

export function CrossPromotionPlanStatusTabs({
  plans,
  value,
  onChange,
}: {
  plans: CrossPromotionPlan[];
  value: CrossPromotionPlanTab;
  onChange: (value: CrossPromotionPlanTab) => void;
}) {
  return (
    <div
      className="flex w-full gap-1 overflow-x-auto rounded-xl border border-neutral-800 bg-neutral-900/70 p-1"
      role="tablist"
      aria-label="Direct exchange status"
    >
      {tabDefinitions.map((tab) => {
        const active = tab.value === value;
        const count = plans.filter((plan) => tab.statuses.includes(plan.status)).length;
        return (
          <button
            key={tab.value}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(tab.value)}
            className={`inline-flex min-h-10 shrink-0 items-center gap-2 rounded-lg px-3 text-sm font-medium transition ${
              active
                ? "bg-blue-600 text-white"
                : "text-neutral-300 hover:bg-neutral-800 hover:text-white"
            }`}
          >
            {tab.label}
            <span
              className={`rounded-full px-1.5 py-0.5 text-xs tabular-nums ${
                active
                  ? "bg-white/15 text-white"
                  : "bg-neutral-800 text-neutral-400"
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
