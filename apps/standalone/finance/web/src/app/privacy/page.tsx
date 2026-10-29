import { FinanceLegalPage } from "@finance-web/components/finance-legal-page";
import { cookies } from "next/headers";

export default async function PrivacyPage() {
  const preferences = await cookies();
  return <FinanceLegalPage kind="privacy" initialLocale={preferences.get("groshly-language")?.value === "en" ? "en" : "uk"} initialTheme={preferences.get("groshly-theme")?.value === "dark" ? "dark" : "light"} />;
}
