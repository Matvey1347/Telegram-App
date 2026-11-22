import type { AdsSection } from "./ads-section-tabs";

export type AdsSectionHeaderKey = AdsSection;

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
    title: "Mutual promotion",
    subtitle:
      "Manage partner exchanges, own-channel promotions, and folders in one place.",
    actionLabel: "New placement",
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
