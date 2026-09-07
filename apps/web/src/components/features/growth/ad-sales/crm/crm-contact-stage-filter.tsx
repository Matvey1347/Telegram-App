"use client";

import type { CrmContactStage } from "@telegram-system/shared";
import {
  crmContactStagePresentation,
  crmContactStages,
} from "./crm-contact-stage";

export function CrmContactStageFilters({
  value,
  onChange,
}: {
  value: CrmContactStage | "ALL";
  onChange: (value: CrmContactStage | "ALL") => void;
}) {
  const options: Array<CrmContactStage | "ALL"> = ["ALL", ...crmContactStages];
  return (
    <div
      role="group"
      aria-label="Filter contacts by status"
      className="flex max-w-full gap-1.5 overflow-x-auto p-1"
    >
      {options.map((option) => {
        const selected = option === value;
        const presentation =
          option === "ALL" ? null : crmContactStagePresentation(option);
        return (
          <button
            key={option}
            type="button"
            aria-pressed={selected}
            onClick={() => onChange(option)}
            className={`shrink-0 whitespace-nowrap rounded-full border px-2.5 py-1 text-[11px] font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${presentation?.className ?? "border-neutral-700 bg-neutral-900 text-neutral-300"} ${selected ? "ring-2 ring-blue-500 ring-offset-1 ring-offset-neutral-950" : "opacity-70 hover:opacity-100"}`}
          >
            {presentation?.label ?? "ALL"}
          </button>
        );
      })}
    </div>
  );
}

export function crmContactStageFromSearchParams(
  searchParams: Pick<URLSearchParams, "get">,
): CrmContactStage | "ALL" {
  const stage = searchParams.get("stage");
  return crmContactStages.includes(stage as CrmContactStage)
    ? (stage as CrmContactStage)
    : "ALL";
}

export function crmContactStageSearchParams(
  searchParams: Pick<URLSearchParams, "toString">,
  stage: CrmContactStage | "ALL",
) {
  const next = new URLSearchParams(searchParams.toString());
  if (stage === "ALL") next.delete("stage");
  else next.set("stage", stage);
  return next;
}
