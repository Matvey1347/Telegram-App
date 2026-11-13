import { financeBrandIcon } from "@consumer-finance/web/lib/finance-brand-icon";
import type { Metadata } from "next";
import { cookies } from "next/headers";
import { FinanceMarketingHome } from "@finance-web/components/finance-marketing-home";

export async function generateMetadata(): Promise<Metadata> {
  const preferences = await cookies();
  const locale = preferences.get("groshly-language")?.value;
  const theme = preferences.get("groshly-theme")?.value;
  const faviconBase = financeBrandIcon(theme === "dark" ? "dark" : "light");
  return {
    title: locale === "en" ? "Groshly — Personal Finance" : "Groshly — особисті фінанси в Telegram і браузері",
    icons: { icon: `${faviconBase}?theme=${theme === "dark" ? "dark" : "light"}` },
  };
}

export default async function FinanceHomePage() {
  const preferences = await cookies();
  return <FinanceMarketingHome
    initialLocale={preferences.get("groshly-language")?.value === "en" ? "en" : "uk"}
    initialTheme={preferences.get("groshly-theme")?.value === "dark" ? "dark" : "light"}
  />;
}
