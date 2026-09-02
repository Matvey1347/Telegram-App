export { APP_LOCALES, normalizeAppLocale } from "@telegram-system/shared";
export type { AppLocale } from "@telegram-system/shared";

export const APP_LOCALE_COOKIE = "telegram-system-locale";

export type TranslationValues = Readonly<
  Record<string, string | number | boolean | null | undefined>
>;

export type TranslationCatalog = Readonly<Record<string, string>>;

export function interpolateTranslation(
  message: string,
  values?: TranslationValues,
) {
  if (!values) return message;
  return message.replace(/\{([a-zA-Z][a-zA-Z0-9]*)\}/g, (match, key) => {
    const value = values[key];
    return value == null ? match : String(value);
  });
}
