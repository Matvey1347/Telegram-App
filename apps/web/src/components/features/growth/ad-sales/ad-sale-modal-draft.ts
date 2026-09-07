import type { TelegramAdSaleOrigin } from "@telegram-system/shared";
import type { SalePlacementDraft } from "./ad-sale-types";
import {
  readWorkspaceModalDrafts,
  removeWorkspaceModalDraft,
  writeWorkspaceModalDraft,
} from "@/lib/workspace-modal-drafts";

const DRAFT_NAMESPACE = "telegram-ad-sales:draft";

export type AdSaleModalDraft = {
  version: 1;
  id?: string;
  createdAt?: string;
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

export function readAdSaleModalDraft(storage: Storage | null | undefined) {
  return readAdSaleModalDrafts(storage)[0] ?? null;
}

function normalizeDraftValue(
  value: unknown,
  index: number,
): AdSaleModalDraft | null {
  const draft = value as Partial<AdSaleModalDraft>;
  if (draft.version !== 1 || !Array.isArray(draft.placements)) return null;
  return {
    ...(draft as AdSaleModalDraft),
    id: draft.id || `legacy-${index}`,
    createdAt: draft.createdAt || new Date(0).toISOString(),
    placements: draft.placements.map((placement) => ({
      ...placement,
      time: normalizeDraftTime(placement.time),
    })),
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

export function readAdSaleModalDrafts(storage: Storage | null | undefined) {
  return readWorkspaceModalDrafts(
    storage,
    DRAFT_NAMESPACE,
    normalizeDraftValue,
  );
}

export function writeAdSaleModalDraft(
  storage: Storage | null | undefined,
  draft: AdSaleModalDraft,
) {
  writeWorkspaceModalDraft(
    storage,
    DRAFT_NAMESPACE,
    {
      ...draft,
      placements: draft.placements.map((placement) => ({
        ...placement,
        time: normalizeDraftTime(placement.time),
      })),
    },
    normalizeDraftValue,
  );
}

export function removeAdSaleModalDraft(
  storage: Storage | null | undefined,
  draftId?: string,
) {
  removeWorkspaceModalDraft(
    storage,
    DRAFT_NAMESPACE,
    draftId,
    normalizeDraftValue,
  );
}

export function hasMeaningfulAdSaleDraft(draft: AdSaleModalDraft) {
  return Boolean(
    draft.advertiserContact.trim() ||
    draft.selectedNetworkId ||
    draft.selectedChannelIds.length ||
    draft.placements.length,
  );
}
