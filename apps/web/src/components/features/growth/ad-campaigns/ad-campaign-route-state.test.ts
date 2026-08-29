import { describe, expect, it } from "vitest";
import { resolveInitialAdCampaignsView } from "./ad-campaign-route-state";

describe("Ad Campaigns initial view", () => {
  it("uses the deep-link view before the first render", () => {
    expect(resolveInitialAdCampaignsView("promos", "campaigns")).toBe("promos");
  });

  it("falls back to the saved view and then campaigns", () => {
    expect(resolveInitialAdCampaignsView(null, "hypotheses")).toBe("hypotheses");
    expect(resolveInitialAdCampaignsView("invalid", null)).toBe("campaigns");
  });
});
