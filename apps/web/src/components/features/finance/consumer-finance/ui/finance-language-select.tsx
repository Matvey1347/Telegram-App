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
  fullWidth = false,
}: {
  value: FinanceLocale;
  onChange: (value: FinanceLocale) => void;
  copy: FinanceCoreCopy;
  disabled?: boolean;
  fullWidth?: boolean;
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
      className={`min-h-11 !px-3 !py-1.5 ${fullWidth ? "!w-full" : "!w-[4.75rem]"}`}
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
