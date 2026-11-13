import { render, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { applyFinanceDocumentMetadata, useFinanceBotBranding } from "@consumer-finance/web/components/hooks/use-finance-bot-branding";

function BrandingImage() {
  const branding = useFinanceBotBranding("finance bot");
  return <span data-logo-url={branding.logoUrl} data-dark-url={branding.faviconLightUrl} data-favicon-url={branding.faviconUrl} />;
}

describe("useFinanceBotBranding", () => {
  it("uses the matching logo for light and dark surfaces", () => {
    const { container } = render(<BrandingImage />);
    expect(container.querySelector("span")).toHaveAttribute("data-logo-url", "/brand/groshly-icon-transparent.png");
    expect(container.querySelector("span")).toHaveAttribute("data-dark-url", "/brand/groshly-dark-icon.png");
    expect(container.querySelector("span")).toHaveAttribute("data-favicon-url", "/brand/groshly-dark-icon.png");
  });

  it("replaces stale browser icons with the transparent icon for the selected theme", () => {
    const stale = document.createElement("link");
    stale.rel = "icon";
    stale.href = "/old.png";
    document.head.appendChild(stale);
    applyFinanceDocumentMetadata("light", "en", "Groshly");
    expect(document.head.querySelector('link[rel="icon"]')?.getAttribute("href")).toContain("groshly-icon-transparent.png?theme=light");
    applyFinanceDocumentMetadata("dark", "uk", "Groshly");
    expect(document.head.querySelector('link[rel="icon"]')?.getAttribute("href")).toContain("groshly-dark-icon.png?theme=dark");
    document.head.querySelectorAll('link[rel="icon"], link[rel="shortcut icon"]').forEach((link) => link.remove());
  });

  it("switches the PWA manifest while preserving the prior value on unmount", async () => {
    const manifest = document.createElement("link");
    manifest.rel = "manifest";
    manifest.href = "/manifest.webmanifest";
    document.head.appendChild(manifest);
    const { unmount } = render(<BrandingImage />);
    await waitFor(() => expect(manifest.getAttribute("href")).toBe("/finance/finance%20bot/manifest.webmanifest"));
    unmount();
    expect(manifest.href).toContain("/manifest.webmanifest");
    manifest.remove();
  });
});
