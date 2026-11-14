import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { MutualPromotionModeTabs } from "./cross-promotion-plans-page";

describe("MutualPromotionModeTabs", () => {
  it("shows own channels between direct exchange and folders", () => {
    render(<MutualPromotionModeTabs mode="direct" />);
    expect(screen.getAllByRole("link").map((link) => link.textContent?.trim())).toEqual([
      "Direct exchange", "Own channels", "Folders",
    ]);
  });
});
