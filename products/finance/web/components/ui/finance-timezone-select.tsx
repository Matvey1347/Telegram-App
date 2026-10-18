import { timezonePresentations } from "@finance-web/lib/timezones";
import type { FinanceLocale } from "@consumer-finance/web/components/i18n/core";
import { Select } from "@consumer-finance/web/components/ui/finance-controls";

export function FinanceTimezoneSelect({
  value,
  onChange,
  locale,
  label,
}: {
  value: string;
  onChange: (value: string) => void;
  locale: FinanceLocale;
  label: string;
}) {
  return (
    <Select
      uiLocale={locale}
      aria-label={label}
      value={value}
      onChange={(event) => onChange(event.target.value)}
    >
      {timezonePresentations(value).map((timezone) => (
        <option
          key={timezone.value}
          value={timezone.value}
          data-icon-emoji={timezone.flag}
          data-option-meta={timezone.value === "UTC" ? undefined : timezone.utc}
        >
          {timezone.label}
        </option>
      ))}
    </Select>
  );
}
