"use client";

import { currencyPresentation } from "@telegram-system/shared";
import { CustomSelect } from "./custom-select";

export function CurrencySelect({
  value,
  onChange,
  currencies,
  disabled,
}: {
  value: string;
  onChange: (value: string) => void;
  currencies: string[];
  disabled?: boolean;
}) {
  const options = Array.from(
    new Set([value, ...currencies].filter(Boolean)),
  ).sort();

  return (
    <CustomSelect
      value={value.toUpperCase()}
      onChange={(next) => onChange(next.toUpperCase())}
      disabled={disabled}
      searchable={options.length > 5}
      options={options.map((currency) => {
        const presentation = currencyPresentation(currency);
        return {
          value: presentation.code,
          label: presentation.code,
          meta: presentation.symbol,
          iconEmoji: presentation.flag,
        };
      })}
    />
  );
}
