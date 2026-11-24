"use client";

import { currencyPresentation } from "@telegram-system/shared";
import { CustomSelect } from "./custom-select";

export function CurrencySelect({
  value,
  onChange,
  currencies,
  disabled,
  ariaLabel,
  nameLocale,
}: {
  value: string;
  onChange: (value: string) => void;
  currencies: string[];
  disabled?: boolean;
  ariaLabel?: string;
  nameLocale?: string;
}) {
  const options = Array.from(
    new Set([value, ...currencies].filter(Boolean)),
  ).sort();

  const names = nameLocale ? new Intl.DisplayNames(nameLocale, { type: "currency" }) : null;

  return (
    <CustomSelect
      value={value.toUpperCase()}
      onChange={(next) => onChange(next.toUpperCase())}
      disabled={disabled}
      ariaLabel={ariaLabel}
      searchable={options.length > 5}
      options={options.map((currency) => {
        const presentation = currencyPresentation(currency);
        return {
          value: presentation.code,
          label: names?.of(presentation.code) ?? presentation.code,
          meta: presentation.symbol,
          iconEmoji: presentation.flag,
        };
      })}
    />
  );
}
