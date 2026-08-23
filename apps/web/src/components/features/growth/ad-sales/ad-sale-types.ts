import type { PlacementManagedPostDraft } from "./placement-post/placement-post-composer";

export type SalePlacementDraft = {
  key: string;
  channelId: string;
  date: string;
  time: string;
  timezone: string;
  productId: string;
  expectedViews: number | null;
  targetCpm: string;
  recommendedPrice: string;
  minimumPrice: string;
  agreedPrice: string;
  pricingMode: "CPM" | "FIXED" | "MANUAL";
  manualPriceReason: string;
  warnings: string[];
  conflict: string | null;
  agreedPriceManuallyEdited: boolean;
  inventoryOpportunityKey?: string | null;
  telegramPostId?: string | null;
  managedPostDraft?: PlacementManagedPostDraft | null;
};

export type PublishedPostOption = {
  id: string;
  title: string;
  publishedAt: string;
};

export type QuoteRequestDraft = {
  key: string;
  channelId: string;
  productId: string;
  pricingMode: SalePlacementDraft["pricingMode"];
  date: string;
  time: string;
  timezone: string;
};
