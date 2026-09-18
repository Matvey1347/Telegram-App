import { describe, expect, it } from "vitest";
import {
  hasMeaningfulAdSaleDraft,
  normalizeAdSaleModalDraft,
  type AdSaleModalDraft,
} from "./ad-sale-modal-draft";

const baseDraft = {
  advertiserTelegram: "",
  advertiserContact: "",
  selectedAdvertiserId: null,
  assignedMemberId: "",
  saleOrigin: "DIRECT",
  accountId: "account-1",
  channelSelectionMode: "channels",
  selectedNetworkId: "",
  selectedChannelIds: [],
  placementDateRange: { from: "2026-08-26", to: "2026-08-26" },
  postMode: "shared",
  placements: [],
  networkPricingMode: "total",
  networkTotalPrice: "0",
} satisfies AdSaleModalDraft;

describe("Ad Sale draft normalization", () => {
  it("repairs legacy placement times", () => {
    const normalized = normalizeAdSaleModalDraft({
      ...baseDraft,
      placements: [{ time: "9:05" }],
    });
    expect(normalized?.placements[0]?.time).toBe("09:05");
  });

  it("does not treat prop-derived seed values as user changes", () => {
    const seeded = {
      ...baseDraft,
      advertiserContact: "@seeded_client",
      selectedAdvertiserId: "advertiser-1",
      selectedChannelIds: ["channel-1"],
      placements: [
        {
          key: "placement:channel-1:2026-08-26",
          channelId: "channel-1",
          date: "2026-08-26",
          time: "12:00",
          timezone: "Europe/Warsaw",
          productId: "product-1",
          expectedViews: 1_000,
          targetCpm: "10",
          recommendedPrice: "10",
          minimumPrice: "10",
          agreedPrice: "10",
          pricingMode: "CPM" as const,
          manualPriceReason: "",
          warnings: [],
          conflict: null,
          agreedPriceManuallyEdited: false,
        },
      ],
    };

    expect(hasMeaningfulAdSaleDraft(seeded, seeded)).toBe(false);
    expect(
      hasMeaningfulAdSaleDraft(
        { ...seeded, advertiserContact: "@changed_client" },
        seeded,
      ),
    ).toBe(true);
  });
});
