import { useEffect, useMemo, useState } from "react";
import type { TelegramAdAvailabilitySlot } from "@telegram-system/shared";
import type { TelegramChannel } from "@/lib/api";
import {
  expandNetworkChannelIds,
  toNumber,
  zonedDateTimeToUtc,
  isValidZonedDateTimeInput,
} from "@/lib/features/growth/telegram-ad-sales";
import { expandAdSaleDateRange } from "@/lib/features/growth/ad-sales-bulk-date-builder";
import { hasPlacementPostContent } from "./placement-post/placement-post-content";
import type { PublishedPostOption, QuoteRequestDraft, SalePlacementDraft } from "./ad-sale-types";
import {
  commonAdSaleFormats,
  createPlacementDraft,
  productPrice,
  resolveAdSaleCurrency,
} from "./ad-sale-placement-draft";
import { removeAdSaleModalDraft } from "./ad-sale-modal-draft";
import { useAdSaleQuotePreview } from "./ad-sale-quote-preview";
import {
  defaultAdSaleAccountId,
  useAdSaleModalSession,
} from "./ad-sale-modal-session";
import { useAdSaleNetworkPricing } from "./ad-sale-network-pricing";
function channelKey(channelId: string, date: string) {
  return `placement:${channelId}:${date}`;
}
export { defaultAdSaleAccountId };
export type { AdSaleModalProps } from "./ad-sale-modal-types";
import type { AdSaleModalProps } from "./ad-sale-modal-types";
export function useAdSaleModalController(options: AdSaleModalProps) {
  const {
    open, onClose, accounts, channels, networks, productsByChannelId,
    defaultCurrency, workspaceTimezone, onLoadAvailableSlots,
    onLoadPublishedPosts, onRequestQuotePreview, onSubmit,
  } = options;
  const [postMode, setPostMode] = useState<"shared" | "individual">("shared");
  const [placements, setPlacements] = useState<SalePlacementDraft[]>([]);
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
  const {
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
  } = useAdSaleModalSession(options, {
    postMode,
    setPostMode,
    placements,
    setPlacements,
    networkPricing,
  });
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
    setPlacements,
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

  const quotePreview = useAdSaleQuotePreview({
    open,
    currency: paymentCurrency,
    quoteRequests,
    productsByChannelId,
    preserveAgreedPrice: networkPricing.mode === "total",
    requestPreview: onRequestQuotePreview,
    setPlacements,
  });

  const canSubmit =
    !quotePreview.limitExceeded &&
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

  return {
    advertiserTelegram, setAdvertiserTelegram, advertiserContact, setAdvertiserContact,
    selectedAdvertiser, setSelectedAdvertiser, selectedAdvertiserId, setSelectedAdvertiserId,
    advertiserMatches, setAdvertiserMatches, assignedMemberId, setAssignedMemberId,
    saleOrigin, setSaleOrigin, accountId, setAccountId, accountManuallySelectedRef,
    channelSelectionMode, setChannelSelectionMode, selectedNetworkId, setSelectedNetworkId,
    selectedChannelIds, setSelectedChannelIds, placementDateRange, setPlacementDateRange,
    postMode, setPostMode, placements, setPlacements, submissionError, pendingDrafts,
    slotPickerPlacementKey, setSlotPickerPlacementKey, slotPickerLoading, slotPickerError,
    publishedPostsByPlacement, postsLoadingByPlacement, paymentAmount, networkPricing,
    quotePreview,
    effectiveChannelIds, paymentCurrency, commonTime, commonFormats, commonFormatName,
    loadPublishedPosts, canSubmit, openSlotPicker, applySlot, submit, slotPickerPlacement,
    slotsByDate, sharedPostActive, pendingDraftSummaries, continueDraft, deleteDraft,
    createNewDraft
  };
}
