import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type Dispatch,
  type SetStateAction,
} from "react";
import type {
  TelegramAdAvailabilitySlot,
  TelegramAdSaleOrigin,
  TelegramAdvertiser,
} from "@telegram-system/shared";
import type { Account } from "@/lib/api";
import type { useAdSaleNetworkPricing } from "./ad-sale-network-pricing";
import { createPlacementDraft } from "./ad-sale-placement-draft";
import {
  hasMeaningfulAdSaleDraft,
  readAdSaleModalDrafts,
  removeAdSaleModalDraft,
  writeAdSaleModalDraft,
  type AdSaleModalDraft,
} from "./ad-sale-modal-draft";
import type { PublishedPostOption, SalePlacementDraft } from "./ad-sale-types";
import type { AdSaleModalProps } from "./ad-sale-modal-types";

export function defaultAdSaleAccountId(
  accounts: Account[],
  assignedMemberId: string,
) {
  const activeAccounts = accounts.filter((account) => account.isActive);
  return (
    activeAccounts.find(
      (account) =>
        assignedMemberId && account.assignedMemberId === assignedMemberId,
    ) ?? activeAccounts[0]
  )?.id ?? "";
}

type AdSalePlacementSession = {
  postMode: "shared" | "individual";
  setPostMode: Dispatch<SetStateAction<"shared" | "individual">>;
  placements: SalePlacementDraft[];
  setPlacements: Dispatch<SetStateAction<SalePlacementDraft[]>>;
  networkPricing: ReturnType<typeof useAdSaleNetworkPricing>;
};

export function useAdSaleModalSession(
  {
    open,
    accounts,
    productsByChannelId,
    defaultCurrency,
    workspaceTimezone,
    onSearchAdvertisers,
    initialChannelId,
    initialScheduledAt,
    initialInventoryOpportunityKey,
    sessionOpen,
  }: AdSaleModalProps,
  {
    postMode,
    setPostMode,
    placements,
    setPlacements,
    networkPricing,
  }: AdSalePlacementSession,
) {
  const [advertiserTelegram, setAdvertiserTelegram] = useState("");
  const [advertiserContact, setAdvertiserContact] = useState("");
  const [selectedAdvertiser, setSelectedAdvertiser] =
    useState<TelegramAdvertiser | null>(null);
  const [selectedAdvertiserId, setSelectedAdvertiserId] =
    useState<string | null>(null);
  const [advertiserMatches, setAdvertiserMatches] = useState<
    TelegramAdvertiser[]
  >([]);
  const [assignedMemberId, setAssignedMemberId] = useState("");
  const [saleOrigin, setSaleOrigin] = useState<TelegramAdSaleOrigin>("DIRECT");
  const [accountId, setAccountId] = useState("");
  const [channelSelectionMode, setChannelSelectionMode] = useState<
    "network" | "channels"
  >("network");
  const [selectedNetworkId, setSelectedNetworkId] = useState("");
  const [selectedChannelIds, setSelectedChannelIds] = useState<string[]>([]);
  const [placementDateRange, setPlacementDateRange] = useState({
    from: "",
    to: "",
  });
  const [submissionError, setSubmissionError] = useState("");
  const [pendingDrafts, setPendingDrafts] = useState<AdSaleModalDraft[]>([]);
  const [slotPickerPlacementKey, setSlotPickerPlacementKey] = useState<
    string | null
  >(null);
  const [slotPickerSlots, setSlotPickerSlots] = useState<
    TelegramAdAvailabilitySlot[]
  >([]);
  const [slotPickerLoading, setSlotPickerLoading] = useState(false);
  const [slotPickerError, setSlotPickerError] = useState("");
  const [publishedPostsByPlacement, setPublishedPostsByPlacement] = useState<
    Record<string, PublishedPostOption[]>
  >({});
  const [postsLoadingByPlacement, setPostsLoadingByPlacement] = useState<
    Record<string, boolean>
  >({});
  const modalInitializedRef = useRef(false);
  const draftReadyRef = useRef(false);
  const persistedDraftJsonRef = useRef("");
  const [currentDraftId, setCurrentDraftId] = useState(() =>
    crypto.randomUUID(),
  );
  const accountManuallySelectedRef = useRef(false);
  useEffect(() => {
    if (!(sessionOpen ?? open)) {
      modalInitializedRef.current = false;
      return;
    }
    if (!open) return;
    if (modalInitializedRef.current) return;
    modalInitializedRef.current = true;
    draftReadyRef.current = false;
    setAdvertiserTelegram("");
    setAdvertiserContact("");
    setSelectedAdvertiser(null);
    setSelectedAdvertiserId(null);
    setAdvertiserMatches([]);
    setAssignedMemberId("");
    setSaleOrigin("DIRECT");
    accountManuallySelectedRef.current = false;
    setAccountId(defaultAdSaleAccountId(accounts, ""));
    setChannelSelectionMode(initialChannelId ? "channels" : "network");
    setSelectedNetworkId("");
    setSelectedChannelIds(initialChannelId ? [initialChannelId] : []);
    setPostMode("shared");
    const initialDate =
      initialScheduledAt?.slice(0, 10) ?? new Date().toISOString().slice(0, 10);
    setPlacementDateRange({ from: initialDate, to: initialDate });
    setPlacements(
      initialChannelId
        ? [
            createPlacementDraft({
              channelId: initialChannelId,
              product: productsByChannelId[initialChannelId]?.[0],
              date: initialDate,
              time: initialScheduledAt
                ? new Date(initialScheduledAt).toISOString().slice(11, 16)
                : "12:00",
              timezone: workspaceTimezone,
              inventoryOpportunityKey: initialInventoryOpportunityKey ?? null,
            }),
          ]
        : [],
    );
    setSubmissionError("");
    setSlotPickerPlacementKey(null);
    setSlotPickerSlots([]);
    setSlotPickerError("");
    setPublishedPostsByPlacement({});
    setPostsLoadingByPlacement({});
    const storedDrafts = readAdSaleModalDrafts(window.localStorage);
    setPendingDrafts(storedDrafts);
    persistedDraftJsonRef.current = "";
    setCurrentDraftId(crypto.randomUUID());
    draftReadyRef.current = storedDrafts.length === 0;
  }, [
    accounts,
    defaultCurrency,
    initialChannelId,
    initialInventoryOpportunityKey,
    initialScheduledAt,
    open,
    productsByChannelId,
    sessionOpen,
    setPlacements,
    setPostMode,
    workspaceTimezone,
  ]);

  const currentDraft = useMemo<AdSaleModalDraft>(
    () => ({
      version: 1,
      id: currentDraftId,
      advertiserTelegram,
      advertiserContact,
      selectedAdvertiserId,
      assignedMemberId,
      saleOrigin,
      accountId,
      channelSelectionMode,
      selectedNetworkId,
      selectedChannelIds,
      placementDateRange,
      postMode,
      placements,
      networkPricingMode: networkPricing.mode,
      networkTotalPrice: networkPricing.totalPrice,
    }),
    [
      accountId,
      advertiserContact,
      advertiserTelegram,
      assignedMemberId,
      channelSelectionMode,
      currentDraftId,
      networkPricing.mode,
      networkPricing.totalPrice,
      placementDateRange,
      placements,
      postMode,
      saleOrigin,
      selectedAdvertiserId,
      selectedChannelIds,
      selectedNetworkId,
    ],
  );

  useEffect(() => {
    if (!open || !draftReadyRef.current || pendingDrafts.length) return;
    const serialized = JSON.stringify(currentDraft);
    if (serialized === persistedDraftJsonRef.current) return;
    persistedDraftJsonRef.current = serialized;
    if (hasMeaningfulAdSaleDraft(currentDraft))
      writeAdSaleModalDraft(window.localStorage, currentDraft);
    else removeAdSaleModalDraft(window.localStorage, currentDraft.id);
  }, [currentDraft, open, pendingDrafts.length]);

  function continueDraft(draft: AdSaleModalDraft) {
    setCurrentDraftId(draft.id || crypto.randomUUID());
    setAdvertiserTelegram(draft.advertiserTelegram);
    setAdvertiserContact(draft.advertiserContact);
    setSelectedAdvertiser(null);
    setSelectedAdvertiserId(draft.selectedAdvertiserId);
    setAssignedMemberId(draft.assignedMemberId);
    setSaleOrigin(draft.saleOrigin);
    accountManuallySelectedRef.current = Boolean(draft.accountId);
    setAccountId(draft.accountId);
    setChannelSelectionMode(draft.channelSelectionMode);
    setSelectedNetworkId(draft.selectedNetworkId);
    setSelectedChannelIds(draft.selectedChannelIds);
    setPlacementDateRange(draft.placementDateRange);
    setPostMode(draft.postMode);
    setPlacements(draft.placements);
    networkPricing.setMode(draft.networkPricingMode);
    networkPricing.setTotalPrice(draft.networkTotalPrice);
    persistedDraftJsonRef.current = JSON.stringify(draft);
    draftReadyRef.current = true;
    setPendingDrafts([]);
  }

  function deleteDraft(draft: AdSaleModalDraft) {
    removeAdSaleModalDraft(window.localStorage, draft.id);
    // Treat the currently initialized form as the new clean baseline. This
    // prevents deleting a draft from immediately saving an untouched form.
    persistedDraftJsonRef.current = JSON.stringify(currentDraft);
    draftReadyRef.current = true;
    setPendingDrafts((items) => items.filter((item) => item.id !== draft.id));
  }

  function createNewDraft() {
    setCurrentDraftId(crypto.randomUUID());
    persistedDraftJsonRef.current = "";
    draftReadyRef.current = true;
    setPendingDrafts([]);
  }

  useEffect(() => {
    if (!open || accountManuallySelectedRef.current) return;
    const preferredAccountId = defaultAdSaleAccountId(
      accounts,
      assignedMemberId,
    );
    setAccountId((current) =>
      current === preferredAccountId ? current : preferredAccountId,
    );
  }, [accounts, assignedMemberId, open]);

  useEffect(() => {
    if (!open) return;
    const search = advertiserContact.trim();
    if (search.length < 2 || selectedAdvertiserId) {
      return;
    }
    let cancelled = false;
    const timeout = window.setTimeout(async () => {
      const matches = await onSearchAdvertisers(search);
      if (!cancelled) {
        setAdvertiserMatches(matches);
      }
    }, 250);
    return () => {
      cancelled = true;
      window.clearTimeout(timeout);
    };
  }, [advertiserContact, onSearchAdvertisers, open, selectedAdvertiserId]);

  return {
    advertiserTelegram, setAdvertiserTelegram, advertiserContact, setAdvertiserContact,
    selectedAdvertiser, setSelectedAdvertiser, selectedAdvertiserId, setSelectedAdvertiserId,
    advertiserMatches, setAdvertiserMatches, assignedMemberId, setAssignedMemberId,
    saleOrigin, setSaleOrigin, accountId, setAccountId, accountManuallySelectedRef,
    channelSelectionMode, setChannelSelectionMode, selectedNetworkId, setSelectedNetworkId,
    selectedChannelIds, setSelectedChannelIds, placementDateRange, setPlacementDateRange,
    submissionError, setSubmissionError,
    pendingDrafts, slotPickerPlacementKey, setSlotPickerPlacementKey,
    slotPickerSlots, setSlotPickerSlots, slotPickerLoading, setSlotPickerLoading,
    slotPickerError, setSlotPickerError, publishedPostsByPlacement,
    setPublishedPostsByPlacement, postsLoadingByPlacement, setPostsLoadingByPlacement,
    persistedDraftJsonRef, draftReadyRef, currentDraft,
    continueDraft, deleteDraft, createNewDraft
  };
}
