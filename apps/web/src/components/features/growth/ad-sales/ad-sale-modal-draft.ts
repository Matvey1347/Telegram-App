import type { TelegramAdSaleOrigin } from "@telegram-system/shared";
import type { SalePlacementDraft } from "./ad-sale-types";
export type AdSaleModalDraft = {
  advertiserTelegram: string;
  advertiserContact: string;
  selectedAdvertiserId: string | null;
  assignedMemberId: string;
  saleOrigin: TelegramAdSaleOrigin;
  accountId: string;
  channelSelectionMode: "network" | "channels";
  selectedNetworkId: string;
  selectedChannelIds: string[];
  placementDateRange: { from: string; to: string };
  postMode: "shared" | "individual";
  placements: SalePlacementDraft[];
  networkPricingMode: "total" | "per-placement";
  networkTotalPrice: string;
};

export function normalizeAdSaleModalDraft(
  value: unknown,
): AdSaleModalDraft | null {
  const draft = value as Partial<AdSaleModalDraft>;
  if (!Array.isArray(draft.placements)) return null;
  const placements = draft.placements.map((placement) => ({
    ...placement,
    time: normalizeDraftTime(placement.time),
  }));
  return {
    ...(draft as AdSaleModalDraft),
    advertiserTelegram: draft.advertiserTelegram ?? "",
    advertiserContact: draft.advertiserContact ?? "",
    selectedAdvertiserId: draft.selectedAdvertiserId ?? null,
    assignedMemberId: draft.assignedMemberId ?? "",
    saleOrigin: draft.saleOrigin ?? "DIRECT",
    accountId: draft.accountId ?? "",
    channelSelectionMode: draft.channelSelectionMode ?? "channels",
    selectedNetworkId: draft.selectedNetworkId ?? "",
    selectedChannelIds:
      draft.selectedChannelIds ?? placements.map((item) => item.channelId),
    placementDateRange: draft.placementDateRange ?? { from: "", to: "" },
    postMode: draft.postMode ?? "shared",
    placements,
    networkPricingMode: draft.networkPricingMode ?? "per-placement",
    networkTotalPrice: draft.networkTotalPrice ?? "",
  };
}

function normalizeDraftTime(value: string | null | undefined) {
  const match = String(value ?? "").match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return "12:00";
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 23 || minutes > 59) return "12:00";
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}

export function hasMeaningfulAdSaleDraft(
  draft: AdSaleModalDraft,
  initialValue?: AdSaleModalDraft | null,
) {
  if (initialValue) return JSON.stringify(draft) !== JSON.stringify(initialValue);
  return Boolean(
    draft.advertiserContact.trim() ||
    draft.selectedNetworkId ||
    draft.selectedChannelIds.length ||
    draft.placements.length,
  );
}
