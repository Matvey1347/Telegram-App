import type { Metadata } from "next";
import type { ReactNode } from "react";
import { cookies } from "next/headers";
import { loadCatalog } from "@/i18n/catalog";
import { APP_LOCALE_COOKIE, normalizeAppLocale } from "@/i18n/types";
import { I18nPreloadedBoundary } from "@/providers/i18n-provider";

export async function generateMetadata(): Promise<Metadata> {
  const locale = normalizeAppLocale(
    (await cookies()).get(APP_LOCALE_COOKIE)?.value,
  );
  const account = (await loadCatalog(locale, "account")).default;
  return { title: account["account.meta.title"] };
}

export default async function AccountLayout({
  children,
}: {
  children: ReactNode;
}) {
  const locale = normalizeAppLocale(
    (await cookies()).get(APP_LOCALE_COOKIE)?.value,
  );
  const account = (await loadCatalog(locale, "account")).default;
  return (
    <I18nPreloadedBoundary initialLocale={locale} catalogs={{ account }}>
      {children}
    </I18nPreloadedBoundary>
  );
}
