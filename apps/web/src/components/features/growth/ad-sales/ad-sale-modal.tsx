"use client";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Plus } from "lucide-react";
import type {
  TelegramAdAvailabilitySlot,
  TelegramAdPriceQuote,
  TelegramAdProduct,
  TelegramAdSale,
  TelegramAdSaleOrigin,
  TelegramAdvertiser,
  TelegramAdStructuredError,
} from "@telegram-system/shared";
import type {
  Account,
  TelegramChannel,
  TelegramChannelNetwork,
} from "@/lib/api";
import { accountDisplayName } from "@/lib/features/finance/account-display";
import {
  channelLocalDateKey,
  expandNetworkChannelIds,
  toNumber,
  zonedDateTimeToUtc,
  isValidZonedDateTimeInput,
} from "@/lib/features/growth/telegram-ad-sales";
import {
  Button,
  CustomSelect,
  FormField,
  IconButton,
  Input,
  Modal,
  Skeleton,
} from "@/components/ui/primitives";
import { MemberSelect } from "@/components/features/workspace/member-select";
import { TelegramEntityAvatar } from "@/components/features/telegram/telegram/telegram-entity-avatar";
import { adSaleOriginOptions } from "./ad-sale-origin";
import type { PlacementManagedPostDraft } from "./placement-post/placement-post-composer";
import { hasPlacementPostContent } from "./placement-post/placement-post-content";
import type {
  PublishedPostOption,
  QuoteRequestDraft,
  SalePlacementDraft,
} from "./ad-sale-types";
import { expandAdSaleDateRange } from "@/lib/features/growth/ad-sales-bulk-date-builder";
import { formatDateWithWeekday } from "@/lib/date-format";
import { AdSalePlacementScope } from "./ad-sale-placement-scope";
import {
  AdSaleNetworkPricing,
  useAdSaleNetworkPricing,
  type AdSalePriceAllocation,
} from "./ad-sale-network-pricing";
import { AdSaleSharedPost } from "./ad-sale-shared-post";
import {
  applyProductToPlacement,
  commonAdSaleFormats,
  createPlacementDraft,
  productPrice,
  resolveAdSaleCurrency,
} from "./ad-sale-placement-draft";
import { AdSalePlacementCard } from "./ad-sale-placement-card";
import {
  hasMeaningfulAdSaleDraft,
  readAdSaleModalDrafts,
  removeAdSaleModalDraft,
  writeAdSaleModalDraft,
  type AdSaleModalDraft,
} from "./ad-sale-modal-draft";

export type { SalePlacementDraft } from "./ad-sale-types";

function channelKey(channelId: string, date: string) {
  return `placement:${channelId}:${date}`;
}

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

export function AdSaleModal({
  open,
  onClose,
  accounts,
  channels,
  networks,
  productsByChannelId,
  defaultCurrency,
  workspaceTimezone,
  onLoadAvailableSlots,
  onLoadPublishedPosts,
  onRequestQuote,
  onSearchAdvertisers,
  onSubmit,
  busy = false,
  initialChannelId,
  initialScheduledAt,
  initialInventoryOpportunityKey,
  headerAction,
  sessionOpen,
  systemBotUsername,
  onSystemBotReturn,
  onPrepareSystemBot,
  onSendSystemBotPost,
}: {
  open: boolean;
  onClose: () => void;
  accounts: Account[];
  channels: TelegramChannel[];
  networks: TelegramChannelNetwork[];
  productsByChannelId: Record<string, TelegramAdProduct[]>;
  defaultCurrency: string;
  workspaceTimezone: string;
  onLoadAvailableSlots: (params: {
    channelId: string;
    productId?: string;
    from: string;
    to: string;
  }) => Promise<TelegramAdAvailabilitySlot[]>;
  onLoadPublishedPosts: (params: {
    channelId: string;
    date: string;
    timezone: string;
    telegramPostUrl?: string;
  }) => Promise<PublishedPostOption[]>;
  onRequestQuote: (params: {
    channelId: string;
    productId?: string;
    pricingMode?: "CPM" | "FIXED" | "MANUAL";
    currency?: string;
    scheduledAt?: string;
  }) => Promise<TelegramAdPriceQuote>;
  onSearchAdvertisers: (query: string) => Promise<TelegramAdvertiser[]>;
  onSubmit: (payload: {
    advertiserId?: string | null;
    createAdvertiser?: boolean;
    advertiserName: string;
    advertiserTelegram?: string;
    advertiserContact?: string;
    notes?: string;
    origin: TelegramAdSaleOrigin;
    assignedMemberId?: string | null;
    accountId: string;
    paymentAmount: number;
    paymentCurrency: string;
    priceAllocation?: AdSalePriceAllocation;
    placements: Array<{
      channelId: string;
      productId?: string;
      inventoryOpportunityKey?: string | null;
      scheduledAt: string;
      timezone: string;
      agreedPrice: number;
      recommendedPrice: number;
      minimumPrice: number;
      expectedViews: number;
      pricingMode: "CPM" | "FIXED" | "MANUAL";
      manualPriceReason?: string;
      telegramPostId?: string | null;
      managedPostDraft?: PlacementManagedPostDraft | null;
    }>;
  }) => Promise<{
    sale: TelegramAdSale;
    conflicts?: TelegramAdStructuredError[];
  }>;
  busy?: boolean;
  initialChannelId?: string | null;
  initialScheduledAt?: string | null;
  initialInventoryOpportunityKey?: string | null;
  headerAction?: ReactNode;
  sessionOpen?: boolean;
  systemBotUsername?: string | null;
  onSystemBotReturn?: (
    workflowId: string,
    channelIds: string[],
  ) => Promise<PlacementManagedPostDraft | null>;
  onPrepareSystemBot?: () => Promise<string>;
  onSendSystemBotPost?: (draft: PlacementManagedPostDraft) => Promise<void>;
}) {
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
  const [postMode, setPostMode] = useState<"shared" | "individual">("shared");
  const [placements, setPlacements] = useState<SalePlacementDraft[]>([]);
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
  const loadedQuoteKeyRef = useRef("");
  const paymentAmount = useMemo(
    () =>
      placements.reduce(
        (sum, placement) => sum + toNumber(placement.agreedPrice),
        0,
      ),
    [placements],
  );
  const networkPricing = useAdSaleNetworkPricing({
    open,
    placements,
    setPlacements,
  });

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
    loadedQuoteKeyRef.current = "";
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

  const effectiveChannelIds = useMemo(
    () =>
      expandNetworkChannelIds({
        selectedChannelIds:
          channelSelectionMode === "channels" ? selectedChannelIds : [],
        selectedNetworkId:
          channelSelectionMode === "network" ? selectedNetworkId : null,
        networks,
      }),
    [channelSelectionMode, networks, selectedChannelIds, selectedNetworkId],
  );
  const selectedAccount = useMemo(
    () => accounts.find((account) => account.id === accountId),
    [accountId, accounts],
  );
  const paymentCurrency = useMemo(
    () =>
      selectedAccount?.currency.toUpperCase() ??
      resolveAdSaleCurrency({
        channelIds: effectiveChannelIds,
        channels,
        placements,
        productsByChannelId,
        fallback: defaultCurrency,
      }),
    [
      channels,
      defaultCurrency,
      effectiveChannelIds,
      placements,
      productsByChannelId,
      selectedAccount,
    ],
  );
  const selectedPlacementDates = useMemo(
    () => expandAdSaleDateRange(placementDateRange),
    [placementDateRange],
  );
  const commonTime =
    placements.length &&
    placements.every((placement) => placement.time === placements[0].time)
      ? placements[0].time
      : "";
  const commonFormats = useMemo(
    () =>
      commonAdSaleFormats({
        channelIds: effectiveChannelIds,
        productsByChannelId,
      }),
    [effectiveChannelIds, productsByChannelId],
  );
  const commonFormatName = useMemo(() => {
    const names = placements.map(
      (placement) =>
        productsByChannelId[placement.channelId]?.find(
          (product) => product.id === placement.productId,
        )?.name,
    );
    return names.length && names.every((name) => name && name === names[0])
      ? (names[0] ?? "")
      : "";
  }, [placements, productsByChannelId]);

  useEffect(() => {
    // Placement rows are derived from selected channels and products can arrive after opening.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setPlacements((current) => {
      if (!effectiveChannelIds.length || !selectedPlacementDates.length)
        return [];
      const byPlacementKey = new Map(
        current.map((item) => [item.key, item] as const),
      );
      const currentFormatNames = current.map(
        (placement) =>
          productsByChannelId[placement.channelId]?.find(
            (product) => product.id === placement.productId,
          )?.name,
      );
      const inheritedFormatName =
        currentFormatNames.length &&
        currentFormatNames.every(
          (name) => name && name === currentFormatNames[0],
        )
          ? currentFormatNames[0]
          : undefined;
      const inheritedTime =
        current.length && current.every((item) => item.time === current[0].time)
          ? current[0].time
          : "12:00";
      return effectiveChannelIds.flatMap((channelId) =>
        selectedPlacementDates.map((date) => {
          const key = channelKey(channelId, date);
          const existing = byPlacementKey.get(key);
          const channelProducts = productsByChannelId[channelId] ?? [];
          const defaultProduct =
            channelProducts.find(
              (product) => product.name === inheritedFormatName,
            ) ?? channelProducts[0];
          if (existing) {
            if (existing.productId || !defaultProduct) return existing;
            const price = productPrice(defaultProduct);
            return {
              ...existing,
              productId: defaultProduct.id,
              expectedViews: defaultProduct.estimatedViews ?? 0,
              targetCpm: defaultProduct.defaultCpm ?? "0",
              recommendedPrice: price,
              minimumPrice: defaultProduct.minimumPrice ?? price,
              agreedPrice: existing.agreedPriceManuallyEdited
                ? existing.agreedPrice
                : price,
              pricingMode: defaultProduct.defaultPricingMode,
            };
          }
          return createPlacementDraft({
            channelId,
            product: defaultProduct,
            date,
            time: inheritedTime,
            timezone: workspaceTimezone,
          });
        }),
      );
    });
  }, [
    effectiveChannelIds,
    productsByChannelId,
    selectedPlacementDates,
    workspaceTimezone,
  ]);

  const loadPublishedPosts = async (
    placement: SalePlacementDraft,
    telegramPostUrl?: string,
  ): Promise<PublishedPostOption | null> => {
    const cacheKey = `${placement.channelId}:${placement.date}`;
    if (postsLoadingByPlacement[cacheKey]) return null;

    setPostsLoadingByPlacement((current) => ({ ...current, [cacheKey]: true }));

    try {
      const posts = await onLoadPublishedPosts({
        channelId: placement.channelId,
        date: placement.date,
        timezone: placement.timezone,
        telegramPostUrl,
      });
      setPublishedPostsByPlacement((current) => ({
        ...current,
        [cacheKey]: telegramPostUrl
          ? [
              ...new Map(
                [...(current[cacheKey] ?? []), ...posts].map((post) => [
                  post.id,
                  post,
                ]),
              ).values(),
            ]
          : posts,
      }));
      return posts[0] ?? null;
    } catch {
      setPublishedPostsByPlacement((current) => ({
        ...current,
        [cacheKey]: [],
      }));
      return null;
    } finally {
      setPostsLoadingByPlacement((current) => ({
        ...current,
        [cacheKey]: false,
      }));
    }
  };

  const quoteRequests = useMemo<QuoteRequestDraft[]>(
    () =>
      placements.map((placement) => ({
        key: placement.key,
        channelId: placement.channelId,
        productId: placement.productId,
        pricingMode: placement.pricingMode,
        date: placement.date,
        time: placement.time,
        timezone: placement.timezone,
      })),
    [placements],
  );

  const quoteRequestKey = useMemo(
    () =>
      open && quoteRequests.length
        ? JSON.stringify({
            currency: paymentCurrency,
            requests: quoteRequests,
          })
        : "",
    [open, paymentCurrency, quoteRequests],
  );

  useEffect(() => {
    let cancelled = false;
    async function loadQuotes() {
      for (const placement of quoteRequests) {
        if (!isValidZonedDateTimeInput(placement.date, placement.time)) {
          continue;
        }
        const quote = await onRequestQuote({
          channelId: placement.channelId,
          productId: placement.productId || undefined,
          pricingMode: placement.pricingMode,
          currency: paymentCurrency,
          scheduledAt: zonedDateTimeToUtc(
            placement.date,
            placement.time,
            placement.timezone,
          ).toISOString(),
        });
        if (cancelled) return;
        setPlacements((current) => {
          let changed = false;
          const next = current.map((item) => {
            if (item.key !== placement.key) return item;
            const product = productsByChannelId[item.channelId]?.find(
              (candidate) => candidate.id === item.productId,
            );
            const nextRecommendedPrice =
              toNumber(quote.recommendedPrice) > 0
                ? quote.recommendedPrice
                : productPrice(product);
            const nextMinimumPrice =
              toNumber(quote.minimumPrice) > 0
                ? quote.minimumPrice
                : (product?.minimumPrice ?? nextRecommendedPrice);
            const nextAgreedPrice =
              networkPricing.mode === "total" || item.agreedPriceManuallyEdited
                ? item.agreedPrice
                : nextRecommendedPrice;
            const nextWarnings = quote.warnings.map(
              (warning) => warning.message,
            );
            const hasChanged =
              item.expectedViews !== quote.expectedViews ||
              item.targetCpm !== quote.targetCpm ||
              item.recommendedPrice !== nextRecommendedPrice ||
              item.minimumPrice !== nextMinimumPrice ||
              item.agreedPrice !== nextAgreedPrice ||
              item.warnings.join("|") !== nextWarnings.join("|");
            if (!hasChanged) return item;
            changed = true;
            return {
              ...item,
              expectedViews: quote.expectedViews,
              targetCpm: quote.targetCpm,
              recommendedPrice: nextRecommendedPrice,
              minimumPrice: nextMinimumPrice,
              agreedPrice: nextAgreedPrice,
              warnings: nextWarnings,
            };
          });
          return changed ? next : current;
        });
      }
    }
    if (quoteRequestKey && loadedQuoteKeyRef.current !== quoteRequestKey) {
      loadedQuoteKeyRef.current = quoteRequestKey;
      void loadQuotes();
    }
    return () => {
      cancelled = true;
    };
  }, [
    networkPricing.mode,
    onRequestQuote,
    paymentCurrency,
    productsByChannelId,
    quoteRequestKey,
    quoteRequests,
  ]);

  const canSubmit =
    !!accountId &&
    paymentAmount > 0 &&
    effectiveChannelIds.length > 0 &&
    placements.length > 0 &&
    placements.every((placement) =>
      isValidZonedDateTimeInput(placement.date, placement.time),
    ) &&
    (!networkPricing.allocation ||
      Math.round(paymentAmount * 100) ===
        Math.round(networkPricing.allocation.totalAmount * 100));

  async function openSlotPicker(placement: SalePlacementDraft) {
    setSlotPickerPlacementKey(placement.key);
    setSlotPickerSlots([]);
    setSlotPickerError("");
    setSlotPickerLoading(true);
    try {
      const start = new Date(`${placement.date}T00:00:00`);
      start.setDate(start.getDate() - 7);
      const end = new Date(`${placement.date}T23:59:59`);
      end.setDate(end.getDate() + 21);
      const slots = await onLoadAvailableSlots({
        channelId: placement.channelId,
        productId: placement.productId || undefined,
        from: start.toISOString(),
        to: end.toISOString(),
      });
      setSlotPickerSlots(slots);
    } catch (error) {
      setSlotPickerError(
        error instanceof Error
          ? error.message
          : "Could not load available slots.",
      );
    } finally {
      setSlotPickerLoading(false);
    }
  }

  function applySlot(slot: TelegramAdAvailabilitySlot) {
    if (!slotPickerPlacementKey) return;
    setPlacements((current) =>
      current.map((item) =>
        item.key === slotPickerPlacementKey
          ? {
              ...item,
              date: slot.date,
              timezone: slot.timezone,
              inventoryOpportunityKey: null,
              conflict: null,
              telegramPostId: null,
            }
          : item,
      ),
    );
    setSlotPickerPlacementKey(null);
  }

  async function submit() {
    setSubmissionError("");
    try {
      const normalizedContact = advertiserContact.trim();
      const hasAdvertiserDetails = Boolean(
        normalizedContact || selectedAdvertiserId,
      );
      const derivedAdvertiserName =
        selectedAdvertiser?.displayName || normalizedContact || "Direct sale";
      const result = await onSubmit({
        advertiserId: selectedAdvertiserId,
        createAdvertiser: !selectedAdvertiserId && hasAdvertiserDetails,
        advertiserName: derivedAdvertiserName,
        advertiserTelegram:
          normalizedContact.startsWith("@") && !advertiserTelegram.trim()
            ? normalizedContact
            : advertiserTelegram.trim() || undefined,
        advertiserContact: normalizedContact || undefined,
        origin: saleOrigin,
        assignedMemberId: assignedMemberId || null,
        accountId,
        paymentAmount,
        paymentCurrency,
        priceAllocation: networkPricing.allocation,
        placements: placements.map((placement) => ({
          channelId: placement.channelId,
          productId: placement.productId || undefined,
          inventoryOpportunityKey:
            placement.inventoryOpportunityKey ?? undefined,
          scheduledAt: zonedDateTimeToUtc(
            placement.date,
            placement.time,
            placement.timezone,
          ).toISOString(),
          timezone: placement.timezone,
          agreedPrice: toNumber(placement.agreedPrice),
          recommendedPrice: toNumber(placement.recommendedPrice),
          minimumPrice: toNumber(placement.minimumPrice),
          expectedViews: placement.expectedViews ?? 0,
          pricingMode: placement.pricingMode,
          manualPriceReason: placement.manualPriceReason.trim() || undefined,
          telegramPostId: placement.telegramPostId ?? null,
          managedPostDraft: hasPlacementPostContent(placement.managedPostDraft)
            ? placement.managedPostDraft
            : null,
        })),
      });
      if (result.conflicts?.length) {
        const byPlacementId = new Map(
          result.conflicts.map((conflict) => [
            String(
              (
                conflict.details?.conflictPlacement as
                  | { id?: string }
                  | undefined
              )?.id ?? "",
            ),
            conflict.message,
          ]),
        );
        setPlacements((current) =>
          current.map((placement) => ({
            ...placement,
            conflict:
              byPlacementId.get(placement.key) ??
              "Scheduling conflict detected",
          })),
        );
        setSubmissionError(
          "Some placements conflict with existing reservations.",
        );
        return;
      }
      removeAdSaleModalDraft(window.localStorage, currentDraft.id);
      persistedDraftJsonRef.current = "";
      draftReadyRef.current = false;
      onClose();
    } catch (error) {
      setSubmissionError(
        error instanceof Error ? error.message : "Could not create sale",
      );
    }
  }

  const slotPickerPlacement =
    placements.find((item) => item.key === slotPickerPlacementKey) ?? null;
  const slotsByDate = Array.from(
    slotPickerSlots.reduce((groups, slot) => {
      const items = groups.get(slot.date) ?? [];
      items.push(slot);
      groups.set(slot.date, items);
      return groups;
    }, new Map<string, TelegramAdAvailabilitySlot[]>()),
  ).sort(([left], [right]) => left.localeCompare(right));
  const sharedPostActive =
    postMode === "shared" &&
    placements.length >= 2 &&
    placements.every((placement) =>
      hasPlacementPostContent(placement.managedPostDraft),
    );
  const pendingDraftSummaries = useMemo(
    () =>
      pendingDrafts.map((pendingDraft) => {
        const channelIds = [
          ...new Set(
            pendingDraft.placements.map((placement) => placement.channelId),
          ),
        ];
        const amount =
          pendingDraft.networkPricingMode === "total"
            ? toNumber(pendingDraft.networkTotalPrice)
            : pendingDraft.placements.reduce(
                (sum, placement) => sum + toNumber(placement.agreedPrice),
                0,
              );
        return {
          draft: pendingDraft,
          draftChannels: channelIds.map(
            (channelId) =>
              channels.find((channel) => channel.id === channelId) ??
              ({ id: channelId, title: channelId } as TelegramChannel),
          ),
          amount,
          currency:
            accounts
              .find((account) => account.id === pendingDraft.accountId)
              ?.currency.toUpperCase() ??
            resolveAdSaleCurrency({
              channelIds,
              channels,
              placements: pendingDraft.placements,
              productsByChannelId,
              fallback: defaultCurrency,
            }),
        };
      }),
    [accounts, channels, defaultCurrency, pendingDrafts, productsByChannelId],
  );

  return (
    <>
      <Modal
        open={open}
        onClose={onClose}
        title="New ad sale"
        headerAction={headerAction}
        size="xl"
      >
        {pendingDrafts.length ? (
          <div className="space-y-3">
            {pendingDraftSummaries.map(({ draft, ...summary }) => (
              <section
                key={draft.id}
                className="flex flex-wrap items-center gap-3 rounded-xl border border-amber-700/60 bg-amber-950/20 p-3"
              >
                <div className="min-w-0 flex-1">
                  <h3 className="text-sm font-semibold text-white">
                    {(draft.advertiserContact ?? "").trim() ||
                      "Unfinished Ad Sale draft"}
                  </h3>
                  <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
                    <span className="text-neutral-300">
                      {draft.placements.length} placement
                      {draft.placements.length === 1 ? "" : "s"}
                    </span>
                    <span className="font-medium text-emerald-300">
                      {summary.amount.toLocaleString(undefined, {
                        maximumFractionDigits: 2,
                      })}{" "}
                      {summary.currency}
                    </span>
                    {summary.draftChannels.length ? (
                      <span
                        className={`flex max-w-xl items-center text-neutral-400 ${summary.draftChannels.length > 1 ? "-space-x-1" : "gap-1.5"}`}
                        aria-label={`${summary.draftChannels.length} channels selected`}
                      >
                        {summary.draftChannels.map((channel) => (
                          <span
                            key={channel.id}
                            title={channel.title}
                            className="inline-flex items-center gap-1.5"
                          >
                            <TelegramEntityAvatar
                              imageUrl={channel.photoUrl}
                              kind="channel"
                              alt={channel.title}
                              size="xs"
                            />
                            {summary.draftChannels.length === 1
                              ? channel.title
                              : null}
                          </span>
                        ))}
                      </span>
                    ) : (
                      <span className="text-neutral-400">
                        No channels selected
                      </span>
                    )}
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <IconButton
                    type="button"
                    kind="delete"
                    aria-label="Delete draft"
                    title="Delete draft"
                    onClick={() => deleteDraft(draft)}
                  />
                  <IconButton
                    type="button"
                    aria-label="Continue draft"
                    title="Continue editing draft"
                    onClick={() => continueDraft(draft)}
                  />
                </div>
              </section>
            ))}
            <div className="flex justify-end">
              <Button type="button" onClick={createNewDraft}>
                <Plus size={15} /> Create new
              </Button>
            </div>
          </div>
        ) : (
          <>
            <div className="space-y-4 pr-1">
              <section className="space-y-3">
                <div className="grid gap-3 xl:grid-cols-4 xl:items-start">
                  <FormField label="Contact">
                    <div className="space-y-2">
                      <Input
                        value={advertiserContact}
                        onChange={(event) => {
                          setAdvertiserContact(event.target.value);
                          setSelectedAdvertiser(null);
                          setSelectedAdvertiserId(null);
                          setAdvertiserMatches([]);
                        }}
                        placeholder="@username, phone, email"
                      />
                      {selectedAdvertiserId ? (
                        <div className="rounded-lg border border-emerald-700 bg-emerald-950/30 px-3 py-2 text-xs text-emerald-200">
                          Linked to existing advertiser.
                          <button
                            type="button"
                            className="ml-2 text-emerald-100 underline"
                            onClick={() => {
                              setSelectedAdvertiser(null);
                              setSelectedAdvertiserId(null);
                            }}
                          >
                            Unlink
                          </button>
                        </div>
                      ) : null}
                      {!selectedAdvertiserId && advertiserMatches.length ? (
                        <div className="rounded-lg border border-neutral-800 bg-neutral-950">
                          {advertiserMatches.slice(0, 5).map((advertiser) => (
                            <button
                              key={advertiser.id}
                              type="button"
                              className="flex w-full items-start justify-between gap-3 border-b border-neutral-800 px-3 py-2 text-left last:border-b-0 hover:bg-neutral-900"
                              onClick={() => {
                                setSelectedAdvertiser(advertiser);
                                setSelectedAdvertiserId(advertiser.id);
                                setAdvertiserTelegram(
                                  advertiser.telegramUsername ?? "",
                                );
                                setAdvertiserContact(
                                  advertiser.telegramUsername ??
                                    advertiser.email ??
                                    advertiser.phone ??
                                    advertiser.contacts?.find(
                                      (item) => item.isPrimary,
                                    )?.value ??
                                    "",
                                );
                                setAdvertiserMatches([]);
                              }}
                            >
                              <span>
                                <span className="block text-sm text-white">
                                  {advertiser.displayName}
                                </span>
                                <span className="block text-xs text-neutral-400">
                                  {advertiser.companyName ||
                                    advertiser.telegramUsername ||
                                    advertiser.email ||
                                    advertiser.phone ||
                                    "Existing advertiser"}
                                </span>
                              </span>
                              <span className="text-xs text-neutral-500">
                                {advertiser.totalSalesCount} sales
                              </span>
                            </button>
                          ))}
                        </div>
                      ) : null}
                    </div>
                  </FormField>

                  <FormField label="Financial account" required>
                    <CustomSelect
                      value={accountId}
                      onChange={(nextAccountId) => {
                        accountManuallySelectedRef.current = true;
                        setAccountId(nextAccountId);
                      }}
                      placeholder="Select account"
                      options={accounts
                        .filter((account) => account.isActive)
                        .map((account) => ({
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
                        }))}
                    />
                  </FormField>

                  <FormField label="Sale origin">
                    <CustomSelect
                      value={saleOrigin}
                      onChange={(value) =>
                        setSaleOrigin(value as TelegramAdSaleOrigin)
                      }
                      options={adSaleOriginOptions}
                    />
                  </FormField>
                  <FormField label="Member">
                    <MemberSelect
                      value={assignedMemberId}
                      onChange={setAssignedMemberId}
                      defaultToCurrent
                    />
                  </FormField>
                </div>
              </section>

              <AdSalePlacementScope
                mode={channelSelectionMode}
                selectedNetworkId={selectedNetworkId}
                selectedChannelIds={selectedChannelIds}
                dateRange={placementDateRange}
                commonTime={commonTime}
                commonFormatName={commonFormatName}
                commonFormats={commonFormats}
                networks={networks}
                channels={channels}
                networkPricing={
                  placements.length >= 2 ? (
                    <AdSaleNetworkPricing
                      mode={networkPricing.mode}
                      totalPrice={networkPricing.totalPrice}
                      recommendedTotal={networkPricing.recommendedTotal}
                      allocatedTotal={networkPricing.allocatedTotal}
                      currency={paymentCurrency}
                      placementCount={placements.length}
                      onModeChange={networkPricing.setMode}
                      onTotalPriceChange={networkPricing.setTotalPrice}
                    />
                  ) : null
                }
                onModeChange={(mode) => {
                  if (mode === "channels" && selectedNetworkId) {
                    setSelectedChannelIds(
                      expandNetworkChannelIds({
                        selectedChannelIds: [],
                        selectedNetworkId,
                        networks,
                      }),
                    );
                  }
                  setChannelSelectionMode(mode);
                }}
                onNetworkChange={setSelectedNetworkId}
                onChannelsChange={setSelectedChannelIds}
                onDateRangeChange={setPlacementDateRange}
                onCommonTimeChange={(time) =>
                  setPlacements((current) =>
                    current.map((placement) => ({ ...placement, time })),
                  )
                }
                onCommonFormatChange={(formatName) =>
                  setPlacements((current) =>
                    current.map((placement) => {
                      const product = productsByChannelId[
                        placement.channelId
                      ]?.find((candidate) => candidate.name === formatName);
                      return product
                        ? applyProductToPlacement(placement, product)
                        : placement;
                    }),
                  )
                }
              />

              <AdSaleSharedPost
                placements={placements}
                channels={channels}
                mode={postMode}
                systemBotUsername={systemBotUsername}
                onSystemBotReturn={onSystemBotReturn}
                onPrepareSystemBot={onPrepareSystemBot}
                onSendSystemBotPost={onSendSystemBotPost}
                onModeChange={setPostMode}
                setPlacements={setPlacements}
              />

              <section className="space-y-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <h3 className="text-sm font-semibold uppercase tracking-[0.24em] text-neutral-400">
                      Placements
                    </h3>
                    <p className="mt-1 text-sm text-neutral-500">
                      Choose one date for a single placement or a range for
                      multiple placements.
                    </p>
                  </div>
                  <div className="rounded-full border border-neutral-800 bg-neutral-950 px-3 py-1 text-xs text-neutral-400">
                    {placements.length} placement
                    {placements.length === 1 ? "" : "s"}
                  </div>
                </div>

                {placements.length ? (
                  <div className="space-y-2">
                    {placements.map((placement) => {
                      const channel = channels.find(
                        (item) => item.id === placement.channelId,
                      );
                      const products =
                        productsByChannelId[placement.channelId] ?? [];
                      const postsKey = `${placement.channelId}:${placement.date}`;

                      return (
                        <AdSalePlacementCard
                          key={placement.key}
                          placement={placement}
                          channel={channel}
                          products={products}
                          currency={paymentCurrency}
                          priceLocked={networkPricing.mode === "total"}
                          sharedPostActive={sharedPostActive}
                          publishedPosts={
                            publishedPostsByPlacement[postsKey] ?? []
                          }
                          postsLoading={
                            postsLoadingByPlacement[postsKey] ?? false
                          }
                          setPlacements={setPlacements}
                          onFindNearbyDate={() =>
                            void openSlotPicker(placement)
                          }
                          onLoadPublishedPosts={(telegramPostUrl) =>
                            loadPublishedPosts(placement, telegramPostUrl)
                          }
                          onManualPriceEdit={() =>
                            networkPricing.setMode("per-placement")
                          }
                        />
                      );
                    })}
                  </div>
                ) : (
                  <div className="rounded-xl border border-dashed border-neutral-700 bg-neutral-950/50 p-4 text-sm text-neutral-400">
                    Select a network or one or more channels to generate booking
                    rows.
                  </div>
                )}
              </section>
            </div>

            {submissionError ? (
              <p className="mt-4 rounded-lg border border-rose-700 bg-rose-950/30 px-3 py-2 text-sm text-rose-200">
                {submissionError}
              </p>
            ) : null}

            <div className="mt-5 flex justify-end gap-2">
              <div className="flex gap-2">
                <Button variant="secondary" onClick={onClose} disabled={busy}>
                  Cancel
                </Button>
                <Button
                  onClick={() => void submit()}
                  disabled={busy || !canSubmit}
                >
                  {submissionError ? "Retry failed operations" : "Create sale"}
                </Button>
              </div>
            </div>
          </>
        )}
      </Modal>

      <Modal
        open={Boolean(slotPickerPlacement)}
        onClose={() => setSlotPickerPlacementKey(null)}
        title="Choose a nearby date"
        size="xl"
      >
        <p className="mb-4 text-sm text-neutral-400">
          {slotPickerPlacement
            ? `Available dates for ${channels.find((channel) => channel.id === slotPickerPlacement.channelId)?.title ?? "this channel"}. Choose the time manually in the placement.`
            : "Choose an available date. Time stays unchanged."}
        </p>
        {slotPickerLoading ? (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {Array.from({ length: 8 }, (_, index) => (
              <Skeleton key={index} className="h-24" />
            ))}
          </div>
        ) : slotPickerError ? (
          <p className="rounded-lg border border-rose-700 bg-rose-950/30 p-3 text-sm text-rose-200">
            {slotPickerError}
          </p>
        ) : slotsByDate.length ? (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {slotsByDate.map(([date, slots]) => {
              const isToday =
                date === channelLocalDateKey(new Date(), workspaceTimezone);
              const isPast =
                date < channelLocalDateKey(new Date(), workspaceTimezone);
              return (
                <button
                  key={date}
                  type="button"
                  onClick={() => applySlot(slots[0])}
                  className={`rounded-xl border p-3 text-left transition hover:-translate-y-0.5 ${
                    isPast
                      ? "border-rose-700/80 bg-rose-950/30 hover:border-rose-500"
                      : "border-emerald-700/80 bg-emerald-950/30 hover:border-emerald-500"
                  } ${isToday ? "ring-1 ring-emerald-400" : ""}`}
                >
                  <span className="block text-sm font-medium text-white">
                    {formatDateWithWeekday(`${date}T12:00:00`)}
                  </span>
                  <span
                    className={`mt-2 block text-xs ${isPast ? "text-rose-300" : "text-emerald-300"}`}
                  >
                    {isToday
                      ? "Today · Available"
                      : isPast
                        ? "Past date"
                        : "Available"}
                  </span>
                </button>
              );
            })}
          </div>
        ) : (
          <p className="rounded-lg border border-dashed border-neutral-700 p-4 text-sm text-neutral-400">
            No available slots were found in this period.
          </p>
        )}
      </Modal>
    </>
  );
}
