import { cookies } from "next/headers";
import { FinanceMarketingHome } from "@finance-web/components/finance-marketing-home";

export default async function FinanceHomePage() {
  const preferences = await cookies();
  return <FinanceMarketingHome
    initialLocale={preferences.get("groshly-language")?.value === "en" ? "en" : "uk"}
    initialTheme={preferences.get("groshly-theme")?.value === "dark" ? "dark" : "light"}
  />;
}
