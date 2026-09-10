import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { AdsSectionTabs } from "./ads-section-tabs";

describe("AdsSectionTabs", () => {
  it("exposes the four Ads destinations as top-level tabs", () => {
    render(<AdsSectionTabs value="campaigns" />);
    expect(screen.getByRole("tab", { name: "Ad campaigns" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    expect(screen.getByRole("tab", { name: "Network" })).toHaveAttribute(
      "href",
      "/telegram-channels?tab=networks",
    );
    expect(screen.getByRole("tab", { name: "Promo" })).toHaveAttribute(
      "href",
      "/ad-campaigns?section=promo&view=promos",
    );
    expect(
      screen.getByRole("tab", { name: "Mutual promotion" }),
    ).toHaveAttribute("href", "/ad-campaigns?section=mutual-promotion");
  });
});
