"use client";

import { GroshlyApp } from "@finance-web/groshly/main";
import { initial } from "@finance-web/groshly/data";
import type { ComponentType } from "react";

const PreviewApp = GroshlyApp as ComponentType<{
  initialData: ReturnType<typeof initial>;
  previewScreen: "home" | "analytics";
  logoUrl?: string;
  faviconUrl?: string;
  faviconLightUrl?: string;
}>;

/** The same home and analytics components as the app, with isolated sample data. */
export function FinanceProductPreview({
  screen,
  lang,
  theme,
  botId,
}: {
  screen: "home" | "analytics";
  lang?: string;
  theme?: string;
  botId?: string;
}) {
  const data = initial();
  data.onboarded = true;
  data.lang = lang === "en" ? "en" : "uk";
  data.theme = theme === "dark" ? "dark" : "light";
  const iconUrl = botId ? `/api/finance-bots/${encodeURIComponent(botId)}/branding/${data.theme === "dark" ? "favicon-light" : "favicon"}` : "/brand/groshly-icon.png";
  return (
    <div className="finance-product-preview" aria-label="Groshly product preview">
      <PreviewApp initialData={data} previewScreen={screen} logoUrl={iconUrl} faviconUrl={iconUrl} faviconLightUrl={iconUrl} />
      <style jsx global>{`
        html, body { overflow: hidden !important; }
        .finance-product-preview { width: 100vw; height: 100vh; pointer-events: none; }
        .finance-product-preview .app-shell { height: 100vh; }
      `}</style>
    </div>
  );
}
