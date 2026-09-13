"use client";

import { ArrowUpDown, Check, ChevronDown } from "lucide-react";
import { ActionMenu, ActionMenuItem } from "@/components/ui/action-menu";

export type AdCampaignSort =
  | "date_desc"
  | "date_asc"
  | "cost_desc"
  | "joined_desc";

const OPTIONS: ReadonlyArray<{ value: AdCampaignSort; label: string }> = [
  { value: "date_desc", label: "Newest" },
  { value: "date_asc", label: "Oldest" },
  { value: "cost_desc", label: "Highest spend" },
  { value: "joined_desc", label: "Most joined" },
];

export function AdCampaignSortMenu({
  value,
  onChange,
}: {
  value: AdCampaignSort;
  onChange: (value: AdCampaignSort) => void;
}) {
  const selected =
    OPTIONS.find((option) => option.value === value) ?? OPTIONS[0];

  return (
    <ActionMenu
      label="Sort campaigns"
      trigger={
        <>
          <ArrowUpDown size={16} aria-hidden="true" />
          <span>{selected.label}</span>
          <ChevronDown
            size={14}
            className="text-neutral-500"
            aria-hidden="true"
          />
        </>
      }
      triggerClassName="inline-flex h-9 items-center justify-center gap-2 rounded-lg border border-neutral-700 bg-neutral-900 px-3 text-sm text-neutral-200 transition hover:border-neutral-600 hover:bg-neutral-800 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
      menuClassName="absolute right-0 top-10 z-50 w-52 rounded-lg border border-neutral-700 bg-neutral-950 p-1.5 shadow-2xl"
    >
      {OPTIONS.map((option) => (
        <ActionMenuItem
          key={option.value}
          icon={
            option.value === value ? (
              <Check size={15} className="text-blue-400" aria-hidden="true" />
            ) : (
              <span className="w-[15px]" aria-hidden="true" />
            )
          }
          onClick={() => onChange(option.value)}
        >
          {option.label}
        </ActionMenuItem>
      ))}
    </ActionMenu>
  );
}
