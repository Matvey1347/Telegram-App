import { financeBrandIcon } from "@consumer-finance/web/lib/finance-brand-icon";
import type { Metadata } from "next";
import { FinanceRootApp } from "@finance-web/components/finance-root-app";
import { cookies } from "next/headers";

export async function generateMetadata(): Promise<Metadata> {
  const preferences = await cookies();
  const locale = preferences.get("groshly-language")?.value === "en" ? "en" : "uk";
  const theme = preferences.get("groshly-theme")?.value;
  const faviconBase = financeBrandIcon(theme === "dark" ? "dark" : "light");
  const favicon = `${faviconBase}?theme=${theme === "dark" ? "dark" : "light"}`;
  return {
    title: locale === "en" ? "Sign in to Groshly" : "Увійти в Groshly",
    icons: { icon: favicon, shortcut: favicon, apple: favicon },
  };
}

export default async function FinanceLoginPage() {
  const preferences = await cookies();
  return <FinanceRootApp entry="login"
    initialLocale={preferences.get("groshly-language")?.value === "en" ? "en" : "uk"}
    initialTheme={preferences.get("groshly-theme")?.value === "dark" ? "dark" : "light"}
  />;
}
