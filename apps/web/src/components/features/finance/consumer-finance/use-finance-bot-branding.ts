"use client";

import { useEffect, useMemo } from "react";
import { resolveConsumerFinanceApiBase } from "@/lib/features/finance/consumer-finance-http";

const DEFAULT_FAVICON = "/brand/favicon-finance.png";

export function useFinanceBotBranding(botId: string) {
  const root = useMemo(
    () =>
      `${resolveConsumerFinanceApiBase()}/finance-bots/${encodeURIComponent(botId)}/branding`,
    [botId],
  );

  useEffect(() => {
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
      links.forEach((link) => (link.href = DEFAULT_FAVICON));
    preload.src = faviconUrl;
    return () => links.forEach((link, index) => (link.href = previous[index]));
  }, [root]);

  return { logoUrl: `${root}/logo` };
}
