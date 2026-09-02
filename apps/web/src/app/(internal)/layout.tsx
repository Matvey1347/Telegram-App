import { cookies } from "next/headers";
import { AppProvider } from "@/providers/app-provider";
import { APP_LOCALE_COOKIE, normalizeAppLocale } from "@/i18n/types";

export default async function InternalLayout({ children }: { children: React.ReactNode }) {
  const locale = normalizeAppLocale((await cookies()).get(APP_LOCALE_COOKIE)?.value);
  return <AppProvider initialLocale={locale}>{children}</AppProvider>;
}
