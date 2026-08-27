import { beforeEach, describe, expect, it } from "vitest";
import {
  readAdSaleModalDrafts,
  removeAdSaleModalDraft,
  writeAdSaleModalDraft,
  type AdSaleModalDraft,
} from "./ad-sale-modal-draft";

const baseDraft = {
  version: 1,
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

describe("Ad Sale draft storage", () => {
  beforeEach(() => localStorage.clear());

  it("keeps multiple drafts and removes only the selected one", () => {
    writeAdSaleModalDraft(localStorage, { ...baseDraft, id: "draft-one" });
    writeAdSaleModalDraft(localStorage, { ...baseDraft, id: "draft-two" });
    expect(readAdSaleModalDrafts(localStorage).map((draft) => draft.id)).toEqual([
      "draft-one",
      "draft-two",
    ]);
    removeAdSaleModalDraft(localStorage, "draft-one");
    expect(readAdSaleModalDrafts(localStorage).map((draft) => draft.id)).toEqual([
      "draft-two",
    ]);
  });
});
