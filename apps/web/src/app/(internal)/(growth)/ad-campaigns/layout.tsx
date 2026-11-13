import { cookies } from "next/headers";
import { loadCatalog } from "@/i18n/catalog";
import { APP_LOCALE_COOKIE, normalizeAppLocale } from "@/i18n/types";
import { I18nPreloadedBoundary } from "@/providers/i18n-provider";

export default async function AdsLayout({ children }: { children: React.ReactNode }) {
  const locale = normalizeAppLocale((await cookies()).get(APP_LOCALE_COOKIE)?.value);
  const catalog = (await loadCatalog(locale, "ad-sales/common")).default;
  return <I18nPreloadedBoundary initialLocale={locale} catalogs={{ "ad-sales/common": catalog }}>{children}</I18nPreloadedBoundary>;
}
