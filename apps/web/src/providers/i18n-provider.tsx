"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type PropsWithChildren,
} from "react";
import { usePathname } from "next/navigation";
import {
  initialCommonEnglishCatalog,
  initialNavigationEnglishCatalog,
  loadCatalog,
  type I18nNamespace,
  type TranslationKey,
} from "@/i18n/catalog";
import { namespacesForPath } from "@/i18n/registry";
import {
  APP_LOCALE_COOKIE,
  interpolateTranslation,
  normalizeAppLocale,
  type AppLocale,
  type TranslationValues,
} from "@/i18n/types";
import commonRu from "@/i18n/locales/ru/common";
import navigationRu from "@/i18n/locales/ru/navigation";

export type TranslationFunction = (key: TranslationKey, values?: TranslationValues) => string;

type I18nContextValue = {
  locale: AppLocale;
  setLocale: (locale: AppLocale) => Promise<void>;
  t: TranslationFunction;
  ensureNamespaces: (namespaces: readonly I18nNamespace[]) => Promise<void>;
  hasNamespaces: (namespaces: readonly I18nNamespace[]) => boolean;
};

export type PreloadedI18nCatalogs = Partial<
  Record<I18nNamespace, Readonly<Record<string, string>>>
>;

const I18nContext = createContext<I18nContextValue | null>(null);

export function I18nProvider({
  initialLocale,
  preloadedCatalogs,
  children,
}: PropsWithChildren<{
  initialLocale: AppLocale;
  preloadedCatalogs?: PreloadedI18nCatalogs;
}>) {
  const pathname = usePathname() || "/";
  const [locale, setLocaleState] = useState(initialLocale);
  const [catalogs, setCatalogs] = useState<
    Partial<Record<AppLocale, Partial<Record<I18nNamespace, Readonly<Record<string, string>>>>>>
  >({
    en: {
      common: initialCommonEnglishCatalog,
      navigation: initialNavigationEnglishCatalog,
      ...(initialLocale === "en" ? preloadedCatalogs : undefined),
    },
    ru: {
      common: commonRu,
      navigation: navigationRu,
      ...(initialLocale === "ru" ? preloadedCatalogs : undefined),
    },
  });
  const loaded = useMemo(
    () => new Set(Object.keys(catalogs[locale] || {}) as I18nNamespace[]),
    [catalogs, locale],
  );
  const activeCatalog = useMemo(
    () => Object.assign({}, ...Object.values(catalogs[locale] || {})),
    [catalogs, locale],
  );

  const ensureNamespaces = useCallback(
    async (namespaces: readonly I18nNamespace[]) => {
      const missing = namespaces.filter((namespace) => !loaded.has(namespace));
      if (!missing.length) return;
      const modules = await Promise.all(
        missing.map(async (namespace) => ({
          namespace,
          module: await loadCatalog(locale, namespace),
        })),
      );
      setCatalogs((current) => ({
        ...current,
        [locale]: {
          ...current[locale],
          ...Object.fromEntries(
            modules.map(({ namespace, module }) => [namespace, module.default]),
          ),
        },
      }));
    },
    [loaded, locale],
  );

  const setLocale = useCallback(async (next: AppLocale) => {
    const normalized = normalizeAppLocale(next);
    const namespaces = Array.from(
      new Set([...namespacesForPath(pathname), ...loaded]),
    );
    const missing = namespaces.filter((namespace) => !catalogs[normalized]?.[namespace]);
    if (missing.length) {
      const modules = await Promise.all(
        missing.map(async (namespace) => ({ namespace, module: await loadCatalog(normalized, namespace) })),
      );
      setCatalogs((current) => ({
        ...current,
        [normalized]: {
          ...current[normalized],
          ...Object.fromEntries(modules.map(({ namespace, module }) => [namespace, module.default])),
        },
      }));
    }
    document.cookie = `${APP_LOCALE_COOKIE}=${normalized}; Path=/; Max-Age=31536000; SameSite=Lax`;
    document.documentElement.lang = normalized;
    setLocaleState(normalized);
  }, [catalogs, loaded, pathname]);

  const t = useCallback(
    (key: TranslationKey, values?: TranslationValues) => {
      const message = activeCatalog[key];
      return interpolateTranslation(message || key, values);
    },
    [activeCatalog],
  );

  const hasNamespaces = useCallback(
    (namespaces: readonly I18nNamespace[]) =>
      namespaces.every((namespace) => loaded.has(namespace)),
    [loaded],
  );

  const value = useMemo(
    () => ({ locale, setLocale, t, ensureNamespaces, hasNamespaces }),
    [ensureNamespaces, hasNamespaces, locale, setLocale, t],
  );
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n() {
  const value = useContext(I18nContext);
  if (!value) throw new Error("useI18n must be used within I18nProvider");
  return value;
}

export function useOptionalI18n() {
  return useContext(I18nContext);
}

export function I18nPreloadedBoundary({
  initialLocale,
  catalogs,
  children,
}: PropsWithChildren<{
  initialLocale: AppLocale;
  catalogs: PreloadedI18nCatalogs;
}>) {
  const parent = useI18n();
  const catalog = useMemo(() => Object.assign({}, ...Object.values(catalogs)), [catalogs]);
  const namespaces = useMemo(
    () => new Set(Object.keys(catalogs) as I18nNamespace[]),
    [catalogs],
  );
  const usePreloaded = parent.locale === initialLocale;
  const t = useCallback<TranslationFunction>(
    (key, values) => {
      const message = usePreloaded ? catalog[key] : undefined;
      return message ? interpolateTranslation(message, values) : parent.t(key, values);
    },
    [catalog, parent, usePreloaded],
  );
  const ensureNamespaces = useCallback(
    (requested: readonly I18nNamespace[]) =>
      parent.ensureNamespaces(
        usePreloaded
          ? requested.filter((namespace) => !namespaces.has(namespace))
          : requested,
      ),
    [namespaces, parent, usePreloaded],
  );
  const hasNamespaces = useCallback(
    (requested: readonly I18nNamespace[]) =>
      requested.every(
        (namespace) =>
          (usePreloaded && namespaces.has(namespace)) ||
          parent.hasNamespaces([namespace]),
      ),
    [namespaces, parent, usePreloaded],
  );
  const value = useMemo(
    () => ({ ...parent, t, ensureNamespaces, hasNamespaces }),
    [ensureNamespaces, hasNamespaces, parent, t],
  );
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}
