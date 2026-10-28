import { render, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { useFinanceBotBranding } from "@consumer-finance/web/components/hooks/use-finance-bot-branding";

function BrandingImage() {
  const branding = useFinanceBotBranding("finance bot");
  return <span data-logo-url={branding.logoUrl} data-dark-url={branding.faviconLightUrl} />;
}

describe("useFinanceBotBranding", () => {
  it("uses bundled light and dark brand assets", () => {
    const { container } = render(<BrandingImage />);
    expect(container.querySelector("span")).toHaveAttribute("data-logo-url", "/brand/groshly-icon.png");
    expect(container.querySelector("span")).toHaveAttribute("data-dark-url", "/brand/groshly-dark-icon.png");
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
