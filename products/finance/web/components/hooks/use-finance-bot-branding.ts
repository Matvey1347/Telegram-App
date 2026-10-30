"use client";

import { useEffect } from "react";

const iconUrl = "/brand/groshly-icon.png";
const darkIconUrl = "/brand/groshly-dark-icon.png";

export function useFinanceBotBranding(botId: string, applyBranding = true) {
  useEffect(() => {
    if (!applyBranding) return;
    const links = Array.from(document.head.querySelectorAll<HTMLLinkElement>(
      'link[rel="icon"], link[rel="shortcut icon"], link[rel="apple-touch-icon"]',
    ));
    const previous = links.map((link) => link.href);
    links.forEach((link) => { link.href = darkIconUrl; });
    return () => links.forEach((link, index) => { link.href = previous[index]; });
  }, [applyBranding]);

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
