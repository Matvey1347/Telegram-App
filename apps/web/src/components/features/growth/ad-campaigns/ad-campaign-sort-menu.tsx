"use client";

import { SortControl, type SortDirection } from "@/components/ui/sort-control";
import { useI18n } from "@/providers/i18n-provider";

export type AdCampaignSort =
  | "date_desc"
  | "date_asc"
  | "cost_desc"
  | "cost_asc"
  | "joined_desc"
  | "joined_asc";

type AdCampaignSortField = "date" | "cost" | "joined";

const OPTION_KEYS = [
  ["date", "ads.sort_date"],
  ["cost", "ads.sort_spend"],
  ["joined", "ads.sort_joined"],
] as const;

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
  const { t } = useI18n();
  const current = splitSort(value);
  return (
    <SortControl
      className="w-full sm:w-64"
      field={current.field}
      options={OPTION_KEYS.map(([option, key]) => ({ value: option, label: t(key) }))}
      direction={current.direction}
      fieldLabel={t("ads.sort_by")}
      onFieldChange={(field) => onChange(joinSort(field, current.direction))}
      onDirectionChange={(direction) =>
        onChange(joinSort(current.field, direction))
      }
    />
  );
}
