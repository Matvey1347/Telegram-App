import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { AdsSectionTabs, resolveAdsSection } from "./ads-section-tabs";

describe("AdsSectionTabs", () => {
  it("exposes the five visually labelled Ads destinations as top-level tabs", () => {
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
    expect(screen.getByRole("tab", { name: "Own channels" })).toHaveAttribute(
      "href",
      "/ad-campaigns?section=own-promotion",
    );
  });

  it("opens hypotheses from its tab and keeps old deep links compatible", () => {
    expect(resolveAdsSection("own-promotion", null)).toBe("own-promotion");
    expect(resolveAdsSection("hypotheses", null)).toBe("hypotheses");
    expect(resolveAdsSection(null, "hypotheses")).toBe("hypotheses");
    expect(resolveAdsSection(null, "promos")).toBe("promo");
  });

  it("contains dense tabs in a page-width horizontal scroller on mobile", () => {
    const scrollIntoView = vi.fn();
    HTMLElement.prototype.scrollIntoView = scrollIntoView;
    render(<AdsSectionTabs value="promo" />);

    expect(screen.getByTestId("ads-section-tabs-scroll")).toHaveClass(
      "w-full",
      "min-w-0",
      "max-w-full",
      "overflow-x-auto",
    );
    expect(screen.getByRole("tablist")).toHaveClass("min-w-max");
    expect(screen.getByRole("tab", { name: "Promo" })).toHaveClass(
      "shrink-0",
      "whitespace-nowrap",
    );
    expect(scrollIntoView).toHaveBeenCalledWith({
      block: "nearest",
      inline: "center",
    });
  });
});
