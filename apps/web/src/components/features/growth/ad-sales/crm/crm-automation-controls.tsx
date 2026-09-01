import type {
  CrmAutomationOverride,
  CrmCustomerAutomationType,
} from "@telegram-system/shared";
import { Select } from "@/components/ui/primitives";
import { formatDateTime } from "@/lib/date-format";

export const automationTypes: Array<{
  type: CrmCustomerAutomationType;
  label: string;
}> = [
  { type: "PRE_PUBLICATION_REMINDER", label: "Pre-publication reminder" },
  { type: "PUBLISHED_LINKS", label: "Published links" },
  { type: "FOLLOW_UP", label: "Customer follow-up" },
];

export const overrideOptions: Array<{
  value: CrmAutomationOverride;
  label: string;
}> = [
  { value: "INHERIT", label: "Inherit" },
  { value: "ENABLED", label: "Enabled" },
  { value: "DISABLED", label: "Disabled" },
];

export function ActivationTime({ value }: { value: string | null }) {
  return (
    <span className="text-xs text-neutral-500">
      {value ? `Activated ${formatDateTime(value)}` : "No activation cutover"}
    </span>
  );
}

export function TypeOverrideSelect({
  label,
  value,
  enabledAt,
  disabled,
  onChange,
}: {
  label: string;
  value: CrmAutomationOverride;
  enabledAt: string | null;
  disabled: boolean;
  onChange: (override: CrmAutomationOverride) => void;
}) {
  return (
    <label className="block min-w-0">
      <span className="mb-1 block text-xs text-neutral-400">{label}</span>
      <Select
        value={value}
        disabled={disabled}
        onChange={(event) =>
          onChange(event.target.value as CrmAutomationOverride)
        }
      >
        {overrideOptions.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </Select>
      <ActivationTime value={enabledAt} />
    </label>
  );
}
