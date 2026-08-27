import type { TelegramAdSaleOrigin } from "@telegram-system/shared";
import type { SalePlacementDraft } from "./ad-sale-types";

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

function storageKey(storage: Pick<Storage, "getItem">) {
  const workspaceId = storage.getItem("selected-workspace-id") || "default";
  return `telegram-ad-sales:draft:${workspaceId}`;
}

export function readAdSaleModalDraft(storage: Storage | null | undefined) {
  return readAdSaleModalDrafts(storage)[0] ?? null;
}

function normalizeDraft(
  draft: Partial<AdSaleModalDraft>,
  index: number,
): AdSaleModalDraft | null {
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
  if (!storage) return [];
  try {
    const raw = storage.getItem(storageKey(storage));
    if (!raw) return [];
    const parsed = JSON.parse(raw) as
      | Partial<AdSaleModalDraft>
      | { version: 2; drafts?: Partial<AdSaleModalDraft>[] };
    const source =
      "drafts" in parsed && Array.isArray(parsed.drafts)
        ? parsed.drafts
        : [parsed as Partial<AdSaleModalDraft>];
    return source
      .map(normalizeDraft)
      .filter((draft): draft is AdSaleModalDraft => Boolean(draft));
  } catch {
    return [];
  }
}

export function writeAdSaleModalDraft(
  storage: Storage | null | undefined,
  draft: AdSaleModalDraft,
) {
  if (!storage) return;
  try {
    const drafts = readAdSaleModalDrafts(storage);
    const id = draft.id || crypto.randomUUID();
    const persisted = {
      ...draft,
      id,
      createdAt: draft.createdAt || new Date().toISOString(),
      placements: draft.placements.map((placement) => ({
        ...placement,
        time: normalizeDraftTime(placement.time),
      })),
    };
    const existingIndex = drafts.findIndex((item) => item.id === id);
    if (existingIndex >= 0) drafts[existingIndex] = persisted;
    else drafts.push(persisted);
    storage.setItem(
      storageKey(storage),
      JSON.stringify({ version: 2, drafts }),
    );
  } catch {
    // Draft persistence is best-effort in restricted browsing modes.
  }
}

export function removeAdSaleModalDraft(
  storage: Storage | null | undefined,
  draftId?: string,
) {
  if (!storage) return;
  try {
    if (!draftId) {
      storage.removeItem(storageKey(storage));
      return;
    }
    const drafts = readAdSaleModalDrafts(storage).filter(
      (draft) => draft.id !== draftId,
    );
    if (!drafts.length) storage.removeItem(storageKey(storage));
    else
      storage.setItem(
        storageKey(storage),
        JSON.stringify({ version: 2, drafts }),
      );
  } catch {
    // Draft cleanup is best-effort in restricted browsing modes.
  }
}

export function hasMeaningfulAdSaleDraft(draft: AdSaleModalDraft) {
  return Boolean(
    draft.advertiserContact.trim() ||
    draft.selectedNetworkId ||
    draft.selectedChannelIds.length ||
    draft.placements.length,
  );
}
