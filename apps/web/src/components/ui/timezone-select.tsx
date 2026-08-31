"use client";

import { timezonePresentations } from "@/lib/timezones";
import { CustomSelect } from "./primitives";

export function TimezoneSelect({
  value,
  onChange,
  disabled,
}: {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
}) {
  return (
    <CustomSelect
      value={value}
      onChange={onChange}
      disabled={disabled}
      placeholder="Select timezone"
      options={timezonePresentations(value).map((timezone) => ({
        value: timezone.value,
        label: timezone.label,
        meta: timezone.utc,
        iconEmoji: timezone.flag,
      }))}
    />
  );
}
