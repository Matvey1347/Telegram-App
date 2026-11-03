import { cookies } from "next/headers";
import { loadCatalog } from "@/i18n/catalog";
import { APP_LOCALE_COOKIE, normalizeAppLocale } from "@/i18n/types";
import { I18nPreloadedBoundary } from "@/providers/i18n-provider";
import { LeadDiscoveryPage } from "@/components/features/growth/ad-sales/crm/leads/lead-discovery-page";

export default async function Page() {
  const locale = normalizeAppLocale((await cookies()).get(APP_LOCALE_COOKIE)?.value);
  const common = (await loadCatalog(locale, "ad-sales/common")).default;
  return <I18nPreloadedBoundary initialLocale={locale} catalogs={{ "ad-sales/common": common }}><LeadDiscoveryPage /></I18nPreloadedBoundary>;
}
