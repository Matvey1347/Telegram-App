import type { Account } from "@/lib/api";
import { accountDisplayName } from "@/lib/features/finance/account-display";
import type { AdCampaignsViewMode } from "./ad-campaign-route-state";

export const AD_CAMPAIGN_VIEW_MODES: readonly AdCampaignsViewMode[] = [
  "campaigns",
  "promos",
  "hypotheses",
];

export const AD_CAMPAIGN_VIEW_OPTIONS = [
  { value: "campaigns", label: "Campaigns", iconEmoji: "🎯" },
  { value: "promos", label: "Promos", iconEmoji: "📣" },
  { value: "hypotheses", label: "Hypotheses", iconEmoji: "🧪" },
];

export function accountAdCampaignSelectOption(account: Account) {
  return {
    value: account.id,
    label: `${accountDisplayName(account)} (${account.currency})`,
    iconUrl:
      account.iconPresentation?.type === "image"
        ? account.iconPresentation.url
        : undefined,
    iconEmoji:
      account.iconPresentation?.type === "unicode"
        ? account.iconPresentation.value
        : undefined,
    iconFallback: account.name,
  };
}
