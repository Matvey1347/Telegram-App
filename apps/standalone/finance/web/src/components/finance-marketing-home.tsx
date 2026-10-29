"use client";

import { useState } from "react";
import { ConsumerFinanceLanding } from "@consumer-finance/web/components/app/consumer-finance-landing";

type Locale = "uk" | "en";
type Theme = "light" | "dark";

function savePreference(name: string, value: string) {
  window.localStorage.setItem(name, value);
  document.cookie = `${name}=${encodeURIComponent(value)}; Path=/; Max-Age=31536000; SameSite=Lax`;
}

export function FinanceMarketingHome({ initialLocale, initialTheme }: { initialLocale: Locale; initialTheme: Theme }) {
  const [locale, setLocale] = useState(initialLocale);
  const [theme, setTheme] = useState(initialTheme);
  return <ConsumerFinanceLanding
    locale={locale}
    theme={theme}
    iconUrl={process.env.NODE_ENV === "development" ? "/brand/groshly-dev-dark-icon.png" : "/brand/groshly-dark-icon.png"}
    onLocaleChange={(next) => {
      const value = next === "en" ? "en" : "uk";
      setLocale(value);
      savePreference("groshly-language", value);
      document.documentElement.lang = value;
    }}
    onThemeChange={() => {
      const value = theme === "dark" ? "light" : "dark";
      setTheme(value);
      savePreference("groshly-theme", value);
      document.querySelector('meta[name="theme-color"]')?.setAttribute("content", value === "dark" ? "#101d17" : "#f7f8f4");
    }}
  />;
}
