import { FinanceLegalPage } from "@finance-web/components/finance-legal-page";
import { cookies } from "next/headers";

export default async function TermsPage() {
  const preferences = await cookies();
  return <FinanceLegalPage kind="terms" initialLocale={preferences.get("groshly-language")?.value === "en" ? "en" : "uk"} initialTheme={preferences.get("groshly-theme")?.value === "dark" ? "dark" : "light"} />;
}
