import { describe, expect, it } from "vitest";
import {
  emptyCrossPromotionPost,
  hasMeaningfulCrossPromotionDraft,
  normalizeCrossPromotionModalDraft,
  type CrossPromotionModalDraft,
} from "./cross-promotion-plan-draft";

function draft(): CrossPromotionModalDraft {
  return {
    iconId: null,
    title: "",
    publisherMode: "channels",
    publisherNetworkId: "",
    publisherIds: [],
    partnerIds: [],
    partnerAdvertiserId: null,
    partnerContact: "",
    partnerTelegram: "",
    targets: [],
    post: emptyCrossPromotionPost(),
    date: "2026-09-16",
    partnerDate: "2026-09-16",
    time: "10:00",
    publisherSettings: { formatIds: {}, times: {} },
    partnerSettings: { formatIds: {}, times: {} },
    outboundMode: "PROMO",
    outboundPost: emptyCrossPromotionPost(),
    importedChannels: [],
  };
}

describe("cross promotion modal drafts", () => {
  it("keeps direct-mutual outbound content and placement settings meaningful", () => {
    expect(
      hasMeaningfulCrossPromotionDraft({
        ...draft(),
        outboundPost: { ...emptyCrossPromotionPost(), buttonRows: [[{ text: "Open", url: "https://t.me/example", style: "default" }]] },
      }),
    ).toBe(true);
    expect(
      hasMeaningfulCrossPromotionDraft({
        ...draft(),
        partnerSettings: { formatIds: { channel: "format" }, times: {} },
      }),
    ).toBe(true);
  });

  it("keeps own-channel targets meaningful", () => {
    expect(
      hasMeaningfulCrossPromotionDraft({
        ...draft(),
        targets: [{ telegramChannelId: "channel-1", promoId: "promo-1", inviteLinkId: "link-1" }],
      }),
    ).toBe(true);
  });

  it("migrates drafts created before imported channels were persisted", () => {
    const legacy = draft();
    delete (legacy as Partial<CrossPromotionModalDraft>).importedChannels;
    expect(normalizeCrossPromotionModalDraft(legacy)?.importedChannels).toEqual([]);
  });
});
