import {
  normalizeAppLocale,
  type AppLocale,
  type TranslationParams,
} from '@telegram-system/shared';

export type BackendCatalog<Key extends string> = Readonly<
  Record<AppLocale, Readonly<Record<Key, string>>>
>;

export function translateBackend<Key extends string>(
  catalog: BackendCatalog<Key>,
  locale: string | null | undefined,
  key: Key,
  params: TranslationParams = {},
) {
  const template =
    catalog[normalizeAppLocale(locale)][key] ?? catalog.en[key] ?? key;
  return template.replace(/\{([A-Za-z0-9_]+)\}/g, (match, name: string) => {
    const value = params[name];
    return value === undefined || value === null ? match : String(value);
  });
}
