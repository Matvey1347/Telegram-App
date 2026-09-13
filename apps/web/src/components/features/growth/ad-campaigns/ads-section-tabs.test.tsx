import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { AdsSectionTabs, resolveAdsSection } from "./ads-section-tabs";

describe("AdsSectionTabs", () => {
  it("exposes the four Ads destinations as top-level tabs", () => {
    render(<AdsSectionTabs value="campaigns" />);
    expect(screen.getByRole("tab", { name: "Ad campaigns" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    expect(screen.getByRole("tab", { name: "Hypotheses" })).toHaveAttribute(
      "href",
      "/ad-campaigns?section=hypotheses",
    );
    expect(screen.queryByRole("tab", { name: "Network" })).toBeNull();
    expect(screen.getByRole("tab", { name: "Promo" })).toHaveAttribute(
      "href",
      "/ad-campaigns?section=promo",
    );
    expect(
      screen.getByRole("tab", { name: "Mutual promotion" }),
    ).toHaveAttribute("href", "/ad-campaigns?section=mutual-promotion");
  });

  it("opens hypotheses from its tab and keeps old deep links compatible", () => {
    expect(resolveAdsSection("hypotheses", null)).toBe("hypotheses");
    expect(resolveAdsSection(null, "hypotheses")).toBe("hypotheses");
    expect(resolveAdsSection(null, "promos")).toBe("promo");
  });
});
