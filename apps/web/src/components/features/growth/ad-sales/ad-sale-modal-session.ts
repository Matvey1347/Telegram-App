import {
  useCallback,
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
  normalizeAdSaleModalDraft,
  type AdSaleModalDraft,
} from "./ad-sale-modal-draft";
import {
  useWorkspaceModalDrafts,
  type WorkspaceFormDraft,
} from "@/hooks/use-workspace-modal-drafts";
import { selectedWorkspaceDraftScope } from "@/lib/workspace-modal-drafts";
import type { PublishedPostOption, SalePlacementDraft } from "./ad-sale-types";
import type { AdSaleModalProps } from "./ad-sale-modal-types";

export function defaultAdSaleAccountId(
  accounts: Account[],
  assignedMemberId: string,
) {
  const activeAccounts = accounts.filter((account) => account.isActive);
  return (
    (
      activeAccounts.find(
        (account) =>
          assignedMemberId && account.assignedMemberId === assignedMemberId,
      ) ?? activeAccounts[0]
    )?.id ?? ""
  );
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
    channels,
    productsByChannelId,
    workspaceTimezone,
    systemBotWorkspaceId,
    initialChannelId,
    initialScheduledAt,
    initialInventoryOpportunityKey,
    initialAdvertiser,
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
  const [selectedAdvertiserId, setSelectedAdvertiserId] = useState<
    string | null
  >(null);
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
  const accountManuallySelectedRef = useRef(false);
  const initialDraftRef = useRef<AdSaleModalDraft | null>(null);
  const createInitialDraft = useCallback((): AdSaleModalDraft => {
    const initialDate =
      initialScheduledAt?.slice(0, 10) ?? new Date().toISOString().slice(0, 10);
    const initialPlacements = initialChannelId
      ? [
          createPlacementDraft({
            channelId: initialChannelId,
            product: productsByChannelId[initialChannelId]?.[0],
            date: initialDate,
            time: "12:00",
            timezone: workspaceTimezone,
            inventoryOpportunityKey: initialInventoryOpportunityKey ?? null,
          }),
        ]
      : [];
    return {
      advertiserTelegram: initialAdvertiser?.telegramUsername ?? "",
      advertiserContact:
        initialAdvertiser?.telegramUsername ??
        initialAdvertiser?.email ??
        initialAdvertiser?.phone ??
        "",
      selectedAdvertiserId: initialAdvertiser?.id ?? null,
      assignedMemberId: "",
      saleOrigin: "DIRECT",
      accountId: defaultAdSaleAccountId(accounts, ""),
      channelSelectionMode: initialChannelId ? "channels" : "network",
      selectedNetworkId: "",
      selectedChannelIds: initialChannelId ? [initialChannelId] : [],
      placementDateRange: { from: initialDate, to: initialDate },
      postMode: "shared",
      placements: initialPlacements,
      networkPricingMode: "total",
      networkTotalPrice: initialPlacements.length
        ? String(
            initialPlacements.reduce(
              (total, placement) =>
                total + Number(placement.recommendedPrice || 0),
              0,
            ),
          )
        : "",
    };
  }, [
    accounts,
    initialAdvertiser,
    initialChannelId,
    initialInventoryOpportunityKey,
    initialScheduledAt,
    productsByChannelId,
    workspaceTimezone,
  ]);

  const restoreDraft = useCallback(
    (
      draft: AdSaleModalDraft,
      storedDraft?: WorkspaceFormDraft<AdSaleModalDraft>,
    ) => {
      initialDraftRef.current = storedDraft ? null : draft;
      setAdvertiserTelegram(draft.advertiserTelegram);
      setAdvertiserContact(draft.advertiserContact);
      setSelectedAdvertiser(
        draft.selectedAdvertiserId === initialAdvertiser?.id
          ? (initialAdvertiser ?? null)
          : null,
      );
      setSelectedAdvertiserId(draft.selectedAdvertiserId);
      setAdvertiserMatches([]);
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
    setSubmissionError("");
    setSlotPickerPlacementKey(null);
    setSlotPickerSlots([]);
    setSlotPickerError("");
    setPublishedPostsByPlacement({});
    setPostsLoadingByPlacement({});
    },
    [initialAdvertiser, networkPricing, setPlacements, setPostMode],
  );

  const currentDraft = useMemo<AdSaleModalDraft>(
    () => ({
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
  const drafts = useWorkspaceModalDrafts<AdSaleModalDraft>({
    namespace: "telegram-ad-sales:draft",
    workspaceId: systemBotWorkspaceId ?? selectedWorkspaceDraftScope(),
    schemaVersion: 1,
    open,
    enabled: sessionOpen ?? open,
    value: currentDraft,
    createInitialValue: createInitialDraft,
    normalize: normalizeAdSaleModalDraft,
    onRestore: restoreDraft,
    isMeaningful: (draft) =>
      hasMeaningfulAdSaleDraft(draft, initialDraftRef.current),
    previewFor: (draft) => ({
      title: draft.advertiserContact || "Unfinished Ad Sale draft",
      subtitle: `${draft.selectedChannelIds.length || draft.placements.length} channels`,
      avatars: channels
        .filter((channel) =>
          (draft.selectedChannelIds.length
            ? draft.selectedChannelIds
            : draft.placements.map((placement) => placement.channelId)
          ).includes(channel.id),
        )
        .map((channel) => ({
          label: channel.title,
          imageUrl: channel.photoUrl,
        })),
    }),
  });

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

  return {
    advertiserTelegram,
    setAdvertiserTelegram,
    advertiserContact,
    setAdvertiserContact,
    selectedAdvertiser,
    setSelectedAdvertiser,
    selectedAdvertiserId,
    setSelectedAdvertiserId,
    advertiserMatches,
    setAdvertiserMatches,
    assignedMemberId,
    setAssignedMemberId,
    saleOrigin,
    setSaleOrigin,
    accountId,
    setAccountId,
    accountManuallySelectedRef,
    channelSelectionMode,
    setChannelSelectionMode,
    selectedNetworkId,
    setSelectedNetworkId,
    selectedChannelIds,
    setSelectedChannelIds,
    placementDateRange,
    setPlacementDateRange,
    submissionError,
    setSubmissionError,
    pendingDrafts: drafts.pendingDrafts,
    slotPickerPlacementKey,
    setSlotPickerPlacementKey,
    slotPickerSlots,
    setSlotPickerSlots,
    slotPickerLoading,
    setSlotPickerLoading,
    slotPickerError,
    setSlotPickerError,
    publishedPostsByPlacement,
    setPublishedPostsByPlacement,
    postsLoadingByPlacement,
    setPostsLoadingByPlacement,
    currentDraft,
    clearCurrentDraft: drafts.clearCurrentDraft,
    continueDraft: drafts.continueDraft,
    deleteDraft: drafts.deleteDraft,
    createNewDraft: drafts.createNewDraft,
  };
}
