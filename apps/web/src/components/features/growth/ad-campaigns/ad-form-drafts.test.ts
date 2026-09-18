import { describe, expect, it } from "vitest";
import {
  isMeaningfulCampaignDraft,
  type CampaignValues,
} from "./campaign-form-modal";
import {
  isMeaningfulHypothesisDraft,
  type HypothesisDraftValues,
} from "./hypothesis-form-modal";

const campaign = (overrides: Partial<CampaignValues> = {}): CampaignValues => ({
  telegramChannelId: "",
  assignedMemberId: null,
  promoIds: [],
  inviteLinkIds: [],
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
});
