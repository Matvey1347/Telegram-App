"use client";

import { useEffect, useMemo, useSyncExternalStore } from "react";
import { resolveConsumerFinanceApiBase } from "@consumer-finance/web/lib/api/consumer-finance-http";

const DEFAULT_FAVICON = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 1 1'/%3E";
const subscribeToStaticApiTopology = () => () => undefined;

export function useFinanceBotBranding(botId: string, applyBranding = true) {
  const sameOriginRoot = useMemo(
    () => `/api/finance-bots/${encodeURIComponent(botId)}/branding`,
    [botId],
  );
  const browserRoot = useMemo(
    () =>
      `${resolveConsumerFinanceApiBase()}/finance-bots/${encodeURIComponent(botId)}/branding`,
    [botId],
  );
  const root = useSyncExternalStore(
    subscribeToStaticApiTopology,
    () => browserRoot,
    () => sameOriginRoot,
  );

  useEffect(() => {
    if (!applyBranding) return;
    const links = Array.from(
      document.head.querySelectorAll<HTMLLinkElement>(
        'link[rel="icon"], link[rel="shortcut icon"], link[rel="apple-touch-icon"]',
      ),
    );
    const previous = links.map((link) => link.href);
    const faviconUrl = `${root}/favicon`;
    const preload = new Image();
    preload.onload = () => links.forEach((link) => (link.href = faviconUrl));
    preload.onerror = () =>
      links.forEach((link, index) => (link.href = previous[index] || DEFAULT_FAVICON));
    preload.src = faviconUrl;
    return () => links.forEach((link, index) => (link.href = previous[index]));
  }, [root, applyBranding]);

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

  return { logoUrl: `${root}/favicon`, faviconUrl: `${root}/favicon`, faviconLightUrl: `${root}/favicon-light` };
}
