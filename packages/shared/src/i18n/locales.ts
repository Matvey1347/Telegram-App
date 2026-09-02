export const APP_LOCALES = ["en", "ru"] as const;

export type AppLocale = (typeof APP_LOCALES)[number];

export const DEFAULT_APP_LOCALE: AppLocale = "en";

export function normalizeAppLocale(
  value: string | null | undefined,
): AppLocale {
  const language = value?.trim().toLowerCase().split(/[-_]/, 1)[0];
  return APP_LOCALES.includes(language as AppLocale)
    ? (language as AppLocale)
    : DEFAULT_APP_LOCALE;
}

export function isAppLocale(value: unknown): value is AppLocale {
  return (
    typeof value === "string" && APP_LOCALES.includes(value as AppLocale)
  );
}
