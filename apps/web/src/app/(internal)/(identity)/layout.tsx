import { cookies } from "next/headers";
import { loadCatalog } from "@/i18n/catalog";
import { APP_LOCALE_COOKIE, normalizeAppLocale } from "@/i18n/types";
import { I18nPreloadedBoundary } from "@/providers/i18n-provider";

export default async function IdentityLayout({ children }: { children: React.ReactNode }) {
  const locale = normalizeAppLocale((await cookies()).get(APP_LOCALE_COOKIE)?.value);
  const auth = (await loadCatalog(locale, "auth")).default;
  return (
    <I18nPreloadedBoundary initialLocale={locale} catalogs={{ auth }}>
      {children}
    </I18nPreloadedBoundary>
  );
}
