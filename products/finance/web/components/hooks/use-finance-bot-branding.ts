"use client";

import { useEffect } from "react";

import { financeBrandIcon } from "@consumer-finance/web/lib/finance-brand-icon";

const iconUrl = financeBrandIcon("light");
const darkIconUrl = financeBrandIcon("dark");

export function applyFinanceDocumentMetadata(
  theme: "light" | "dark",
  locale: "uk" | "ru" | "en",
  title: string,
) {
  const icon = `${financeBrandIcon(theme)}?theme=${theme}&v=2`;
  document.title = title;
  document.documentElement.lang = locale;
  document
    .querySelector('meta[name="theme-color"]')
    ?.setAttribute("content", theme === "dark" ? "#0c1712" : "#f7f8f4");
  document.head
    .querySelectorAll<HTMLLinkElement>('link[rel="icon"], link[rel="shortcut icon"]')
    .forEach((link) => link.remove());
  for (const rel of ["icon", "shortcut icon"]) {
    const link = document.createElement("link");
    link.rel = rel;
    link.href = icon;
    document.head.appendChild(link);
  }
}

export function useFinanceBotBranding(botId: string, applyBranding = true) {
  useEffect(() => {
    if (!applyBranding) return;
    let manifest = document.head.querySelector<HTMLLinkElement>('link[rel="manifest"]');
    const created = !manifest;
    if (!manifest) {
      manifest = document.createElement("link");
      manifest.rel = "manifest";
      document.head.appendChild(manifest);
    }
    const previous = manifest.href;
    manifest.href = `/finance/${encodeURIComponent(botId)}/manifest.webmanifest`;
    return () => {
      if (created) manifest.remove();
      else manifest.href = previous;
    };
  }, [botId, applyBranding]);

  return { logoUrl: iconUrl, faviconUrl: darkIconUrl, faviconLightUrl: darkIconUrl };
}
