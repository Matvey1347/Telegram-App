import { cookies } from "next/headers";
import { loadCatalog } from "@/i18n/catalog";
import { APP_LOCALE_COOKIE, normalizeAppLocale } from "@/i18n/types";
import { I18nPreloadedBoundary } from "@/providers/i18n-provider";

export default async function TelegramPostsCalendarLayout({ children }: { children: React.ReactNode }) {
  const locale = normalizeAppLocale((await cookies()).get(APP_LOCALE_COOKIE)?.value);
  const catalog = (await loadCatalog(locale, "telegram/posts/calendar")).default;
  return (
    <I18nPreloadedBoundary initialLocale={locale} catalogs={{ "telegram/posts/calendar": catalog }}>
      {children}
    </I18nPreloadedBoundary>
  );
}
