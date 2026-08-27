import { CURRENCIES, currencyPresentation } from "@telegram-system/shared";
import { Select } from "./finance-controls";
import type { FinanceLocale } from "../finance-i18n";

export function FinanceCurrencySelect({
  value,
  onChange,
  locale,
  currencies = CURRENCIES,
}: {
  value: string;
  onChange: (value: string) => void;
  locale: FinanceLocale;
  currencies?: readonly string[];
}) {
  const options = Array.from(new Set([value, ...currencies].filter(Boolean)));
  return (
    <Select
      uiLocale={locale}
      value={value}
      onChange={(event) => onChange(event.target.value.toUpperCase())}
    >
      {options.map((currency) => {
        const presentation = currencyPresentation(currency);
        return (
          <option
            key={presentation.code}
            value={presentation.code}
            data-icon-emoji={presentation.flag}
            data-option-meta={presentation.symbol}
          >
            {presentation.code}
          </option>
        );
      })}
    </Select>
  );
}
