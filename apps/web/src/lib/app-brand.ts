export const SYSTEM_BRAND = {
  name: "Nexeloq",
  tagline: "Smarter operations",
  productionLogo: "/brand/telegram-system.png",
  developmentLogo: "/brand/telegram-system-dev.png",
  productionFavicon: "/brand/favicon-prod.png",
  developmentFavicon: "/brand/favicon-dev.png",
  financeLogo: "/brand/finance.png",
  financeFavicon: "/brand/favicon-finance.png",
} as const;

export function isDevelopmentHost(hostname: string) {
  const normalized = hostname.trim().toLowerCase();
  return (
    normalized === "localhost" ||
    normalized === "127.0.0.1" ||
    normalized === "::1" ||
    normalized.endsWith(".localhost")
  );
}

export function systemBrandForHost(hostname: string) {
  const development = isDevelopmentHost(hostname);
  return {
    ...SYSTEM_BRAND,
    development,
    logo: development
      ? SYSTEM_BRAND.developmentLogo
      : SYSTEM_BRAND.productionLogo,
    favicon: development
      ? SYSTEM_BRAND.developmentFavicon
      : SYSTEM_BRAND.productionFavicon,
  };
}
