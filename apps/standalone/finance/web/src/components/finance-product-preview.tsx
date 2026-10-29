"use client";

import { GroshlyApp } from "@finance-web/groshly/main";
import { initial } from "@finance-web/groshly/data";
import { useEffect, useState, type ComponentType } from "react";

const PreviewApp = GroshlyApp as ComponentType<{
  initialData: ReturnType<typeof initial>;
  previewScreen: "home" | "analytics" | "history" | "accounts" | "debts";
  logoUrl?: string;
  faviconUrl?: string;
  faviconLightUrl?: string;
}>;

/** The same home and analytics components as the app, with isolated sample data. */
export function FinanceProductPreview({
  screen,
}: {
  screen: "home" | "analytics" | "history" | "accounts" | "debts";
}) {
  const [preferences, setPreferences] = useState<{ lang: "uk" | "en"; theme: "light" | "dark" }>({ lang: "uk", theme: "light" });
  useEffect(() => {
    const update = (event: MessageEvent) => {
      if (event.origin !== window.location.origin || event.data?.type !== "groshly-preview-preferences") return;
      setPreferences({ lang: event.data.locale === "en" ? "en" : "uk", theme: event.data.theme === "dark" ? "dark" : "light" });
    };
    window.addEventListener("message", update);
    return () => window.removeEventListener("message", update);
  }, []);
  const data = initial();
  data.onboarded = true;
  data.lang = preferences.lang;
  data.theme = preferences.theme;
  const iconUrl = process.env.NODE_ENV === "development" ? "/brand/groshly-dev-dark-icon.png" : "/brand/groshly-dark-icon.png";
  return (
    <div className="finance-product-preview" aria-label="Groshly product preview">
      <PreviewApp initialData={data} previewScreen={screen} logoUrl={iconUrl} faviconUrl={iconUrl} faviconLightUrl={iconUrl} />
      <style jsx global>{`
        html, body { overflow: hidden !important; }
        .finance-product-preview { width: 100vw; height: 100vh; }
        .finance-product-preview .app-shell { height: 100vh; }
      `}</style>
    </div>
  );
}
