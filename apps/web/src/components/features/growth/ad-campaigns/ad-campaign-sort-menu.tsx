"use client";

import { SortControl, type SortDirection } from "@/components/ui/sort-control";

export type AdCampaignSort =
  | "date_desc"
  | "date_asc"
  | "cost_desc"
  | "cost_asc"
  | "joined_desc"
  | "joined_asc";

type AdCampaignSortField = "date" | "cost" | "joined";

const OPTIONS: ReadonlyArray<{ value: AdCampaignSortField; label: string }> = [
  { value: "date", label: "Date" },
  { value: "cost", label: "Spend" },
  { value: "joined", label: "Joined" },
];

function splitSort(value: AdCampaignSort) {
  const [field, direction] = value.split("_") as [
    AdCampaignSortField,
    Lowercase<SortDirection>,
  ];
  return { field, direction: direction.toUpperCase() as SortDirection };
}

function joinSort(
  field: AdCampaignSortField,
  direction: SortDirection,
): AdCampaignSort {
  return `${field}_${direction.toLowerCase()}` as AdCampaignSort;
}

export function AdCampaignSortMenu({
  value,
  onChange,
}: {
  value: AdCampaignSort;
  onChange: (value: AdCampaignSort) => void;
}) {
  const current = splitSort(value);
  return (
    <SortControl
      className="w-full sm:w-64"
      field={current.field}
      options={OPTIONS}
      direction={current.direction}
      fieldLabel="Sort campaigns by"
      onFieldChange={(field) => onChange(joinSort(field, current.direction))}
      onDirectionChange={(direction) =>
        onChange(joinSort(current.field, direction))
      }
    />
  );
}
