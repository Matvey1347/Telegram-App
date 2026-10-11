import { describe, expect, it } from "vitest";
import {
  isMeaningfulCampaignDraft,
  normalizeCampaignDraft,
  type CampaignValues,
} from "./campaign-form-draft";
import {
  isMeaningfulHypothesisDraft,
  type HypothesisDraftValues,
} from "./hypothesis-form-modal";

const campaign = (overrides: Partial<CampaignValues> = {}): CampaignValues => ({
  telegramChannelId: "",
  assignedMemberId: null,
  promoIds: [],
  inviteLinkIds: [],
  botInviteLinkIds: [],
  trackingLinkKind: "BOT",
  trackingChannelIds: [],
  trackCrossChannelRequests: false,
  advertisingChannelIds: [],
  price: 0,
  accountId: "",
  date: "2026-09-15",
  customTitle: "",
  notes: "",
  ...overrides,
});

const hypothesis = (
  overrides: Partial<HypothesisDraftValues> = {},
): HypothesisDraftValues => ({
  iconId: null,
  telegramChannelId: "",
  assignedMemberId: null,
  name: "",
  description: "",
  selectedIds: [],
  ...overrides,
});

describe("ad form draft meaning", () => {
  it("does not retain untouched campaign and hypothesis seeds", () => {
    expect(isMeaningfulCampaignDraft(campaign(), "2026-09-15")).toBe(false);
    expect(isMeaningfulHypothesisDraft(hypothesis())).toBe(false);
  });

  it("retains campaign selections and hypothesis content", () => {
    expect(
      isMeaningfulCampaignDraft(
        campaign({ advertisingChannelIds: ["channel:one"] }),
        "2026-09-15",
      ),
    ).toBe(true);
    expect(isMeaningfulHypothesisDraft(hypothesis({ name: "Idea" }))).toBe(true);
  });

  it("normalizes incomplete local campaign drafts before restoring them", () => {
    expect(
      normalizeCampaignDraft({
        telegramChannelId: "channel-1",
        promoIds: ["promo-1", 4],
        inviteLinkIds: "not-an-array",
        price: "125.5",
        notes: 10,
      }),
    ).toEqual({
      telegramChannelId: "channel-1",
      assignedMemberId: null,
      promoIds: ["promo-1"],
      inviteLinkIds: [],
      botInviteLinkIds: [],
      trackingLinkKind: "BOT",
      trackingChannelIds: [],
      trackCrossChannelRequests: false,
      advertisingChannelIds: [],
      price: 125.5,
      accountId: "",
      date: undefined,
      endedAt: undefined,
      customTitle: "",
      notes: "",
    });
    expect(normalizeCampaignDraft(null)).toBeNull();
  });
});
