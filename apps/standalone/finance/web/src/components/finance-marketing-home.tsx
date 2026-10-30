"use client";

import { useEffect, useState } from "react";
import { ConsumerFinanceLanding } from "@consumer-finance/web/components/app/consumer-finance-landing";
import { consumerFinanceAuthApi } from "@consumer-finance/web/lib/api/consumer-finance-auth-api";

type Locale = "uk" | "en";
type Theme = "light" | "dark";

function savePreference(name: string, value: string) {
  window.localStorage.setItem(name, value);
  document.cookie = `${name}=${encodeURIComponent(value)}; Path=/; Max-Age=31536000; SameSite=Lax`;
}

export function FinanceMarketingHome({ initialLocale, initialTheme }: { initialLocale: Locale; initialTheme: Theme }) {
  const [locale, setLocale] = useState(initialLocale);
  const [theme, setTheme] = useState(initialTheme);
  useEffect(() => {
    const botId = window.localStorage.getItem("finance-active-bot-id")?.trim();
    if (!botId) return;
    let active = true;
    void consumerFinanceAuthApi.session(botId).then((session) => {
      if (active && session.authenticated) window.location.replace("/app");
    }).catch(() => undefined);
    return () => { active = false; };
  }, []);
  return <ConsumerFinanceLanding
    locale={locale}
    theme={theme}
    iconUrl={process.env.NODE_ENV === "development"
      ? theme === "dark" ? "/brand/groshly-dev-dark-icon.png" : "/brand/groshly-dev-icon.png"
      : theme === "dark" ? "/brand/groshly-dark-icon.png" : "/brand/groshly-icon.png"}
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
