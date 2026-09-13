import type { AdsSection } from "./ads-section-tabs";

export type AdsSectionHeaderKey = AdsSection | "mutual-folders";

const headers: Record<
  AdsSectionHeaderKey,
  { title: string; subtitle: string; actionLabel: string }
> = {
  campaigns: {
    title: "Ad campaigns",
    subtitle:
      "Plan paid placements, connect creatives and invite links, and measure acquisition performance.",
    actionLabel: "Create campaign",
  },
  hypotheses: {
    title: "Hypotheses",
    subtitle:
      "Test creative ideas and compare their spend, subscribers, CPA, and outcome.",
    actionLabel: "Create hypothesis",
  },
  promo: {
    title: "Promo creatives",
    subtitle:
      "Prepare reusable Telegram creatives and review their opening copy before using them in campaigns.",
    actionLabel: "Create promo",
  },
  "mutual-promotion": {
    title: "Direct mutual promotion",
    subtitle:
      "Exchange placements, schedule partner posts, and compare joins with donor-channel losses.",
    actionLabel: "New placement",
  },
  "mutual-folders": {
    title: "Mutual-promotion folders",
    subtitle:
      "Coordinate shared publication schedules, invite-link attribution, and paid participation across channels.",
    actionLabel: "Create folder",
  },
  "own-promotion": {
    title: "Own-channel promotion",
    subtitle:
      "Promote one owned channel across the others and compare every placement in one view.",
    actionLabel: "New placement",
  },
};

export function adsSectionHeader(key: AdsSectionHeaderKey) {
  return headers[key];
}
