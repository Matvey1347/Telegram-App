import { FinanceRootApp } from "@finance-web/components/finance-root-app";
import { cookies } from "next/headers";

export const metadata = { title: "Увійти в Groshly" };

export default async function FinanceLoginPage() {
  const preferences = await cookies();
  return <FinanceRootApp entry="login"
    initialLocale={preferences.get("groshly-language")?.value === "en" ? "en" : "uk"}
    initialTheme={preferences.get("groshly-theme")?.value === "dark" ? "dark" : "light"}
  />;
}
