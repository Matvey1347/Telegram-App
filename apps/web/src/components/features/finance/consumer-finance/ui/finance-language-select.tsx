import {
  supportedFinanceLocales,
  type FinanceCoreCopy,
  type FinanceLocale,
} from "../i18n/core";
import { Select } from "./finance-controls";

const FLAGS: Record<FinanceLocale, string> = {
  uk: "🇺🇦",
  ru: "🇷🇺",
  en: "🇬🇧",
};
export function FinanceLanguageSelect({
  value,
  onChange,
  copy,
  disabled,
}: {
  value: FinanceLocale;
  onChange: (value: FinanceLocale) => void;
  copy: FinanceCoreCopy;
  disabled?: boolean;
}) {
  return (
    <Select
      uiLocale={value}
      aria-label={copy.language}
      triggerAriaLabel={copy.language}
      iconOnly
      hideSelectedOption
      largeOptionIcons
      value={value}
      disabled={disabled}
      className="min-h-11 !w-[4.75rem] !px-3 !py-1.5"
      onChange={(event) => {
        const nextLocale = event.target.value as FinanceLocale;
        if (nextLocale !== value) onChange(nextLocale);
      }}
    >
      {supportedFinanceLocales.map((locale) => (
        <option key={locale} value={locale} data-icon-emoji={FLAGS[locale]}>
          {locale === "uk"
            ? copy.languageUkrainian
            : locale === "ru"
              ? copy.languageRussian
              : copy.languageEnglish}
        </option>
      ))}
    </Select>
  );
}
