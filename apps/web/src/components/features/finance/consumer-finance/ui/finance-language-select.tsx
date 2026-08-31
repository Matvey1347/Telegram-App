import {
  supportedFinanceLocales,
  type FinanceCopy,
  type FinanceLocale,
} from "../finance-i18n";
import { Select } from "./finance-controls";

const FLAGS: Record<FinanceLocale, string> = {
  uk: "🇺🇦",
  ru: "🇷🇺",
  en: "🇬🇧",
};
const COMPACT_LABELS: Record<FinanceLocale, string> = {
  uk: "UA",
  ru: "RU",
  en: "EN",
};

export function FinanceLanguageSelect({
  value,
  onChange,
  copy,
  compact = false,
  disabled,
}: {
  value: FinanceLocale;
  onChange: (value: FinanceLocale) => void;
  copy: FinanceCopy;
  compact?: boolean;
  disabled?: boolean;
}) {
  return (
    <Select
      uiLocale={value}
      aria-label={copy.language}
      value={value}
      disabled={disabled}
      className={compact ? "min-h-10 !w-[5.5rem] !py-1.5" : undefined}
      onChange={(event) => onChange(event.target.value as FinanceLocale)}
    >
      {supportedFinanceLocales.map((locale) => (
        <option key={locale} value={locale} data-icon-emoji={FLAGS[locale]}>
          {compact
            ? COMPACT_LABELS[locale]
            : locale === "uk"
              ? copy.languageUkrainian
              : locale === "ru"
                ? copy.languageRussian
                : copy.languageEnglish}
        </option>
      ))}
    </Select>
  );
}
