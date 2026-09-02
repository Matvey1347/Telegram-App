import { cookies } from "next/headers";
import { loadCatalog, type I18nNamespace } from "@/i18n/catalog";
import { APP_LOCALE_COOKIE, normalizeAppLocale } from "@/i18n/types";
import { I18nPreloadedBoundary } from "@/providers/i18n-provider";

const namespaces = [
  "ad-sales/common",
  "telegram/posts/common",
  "telegram/posts/editor",
] as const satisfies readonly I18nNamespace[];

export default async function TelegramPostsLayout({ children }: { children: React.ReactNode }) {
  const locale = normalizeAppLocale((await cookies()).get(APP_LOCALE_COOKIE)?.value);
  const modules = await Promise.all(
    namespaces.map(async (namespace) => [namespace, (await loadCatalog(locale, namespace)).default] as const),
  );
  return (
    <I18nPreloadedBoundary initialLocale={locale} catalogs={Object.fromEntries(modules)}>
      {children}
    </I18nPreloadedBoundary>
  );
}
