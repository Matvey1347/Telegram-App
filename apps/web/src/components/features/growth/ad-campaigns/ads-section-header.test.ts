import { describe, expect, it } from "vitest";
import { adsSectionHeader } from "./ads-section-header";

describe("adsSectionHeader", () => {
  it("gives every ads section its own purpose and creation action", () => {
    const campaigns = adsSectionHeader("campaigns");
    const hypotheses = adsSectionHeader("hypotheses");
    const promo = adsSectionHeader("promo");

    expect(campaigns.title).toBe("Ad campaigns");
    expect(hypotheses.subtitle).toContain("creative ideas");
    expect(promo.actionLabel).toBe("Create promo");
    expect(
      new Set([campaigns.subtitle, hypotheses.subtitle, promo.subtitle]).size,
    ).toBe(3);
  });

  it("uses a combined mutual-promotion title", () => {
    expect(adsSectionHeader("mutual-promotion").title).toBe(
      "Mutual promotion",
    );
    expect(adsSectionHeader("own-promotion").title).toBe(
      "Own-channel promotion",
    );
  });
});
