import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { telegramAdSalesApi } from "@/lib/api";
import { telegramAdSalesKeys } from "@/lib/features/growth/telegram-ad-sales-query";
import {
  expandNetworkChannelIds,
  toNumber,
  zonedDateTimeToUtc,
  isValidZonedDateTimeInput,
} from "@/lib/features/growth/telegram-ad-sales";
import { expandAdSaleDateRange } from "@/lib/features/growth/ad-sales-bulk-date-builder";
import { hasPlacementPostContent } from "./placement-post/placement-post-content";
// prettier-ignore
import type { QuoteRequestDraft, SalePlacementDraft } from "./ad-sale-types";
import {
  commonAdSaleFormats,
  createPlacementDraft,
  productPrice,
  resolveAdSaleCurrency,
} from "./ad-sale-placement-draft";
import { useAdSaleQuotePreview } from "./ad-sale-quote-preview";
import {
  defaultAdSaleAccountId,
  useAdSaleModalSession,
} from "./ad-sale-modal-session";
import { useAdSaleNetworkPricing } from "./ad-sale-network-pricing";
import { isValidTelegramUsernameInput } from "./ad-sale-client-field";
import { useAdSalePlacementLoaders } from "./use-ad-sale-placement-loaders";
function channelKey(channelId: string, date: string) {
  return `placement:${channelId}:${date}`;
}
export { defaultAdSaleAccountId };
export type { AdSaleModalProps } from "./ad-sale-modal-types";
import type { AdSaleModalProps } from "./ad-sale-modal-types";
export function useAdSaleModalController(options: AdSaleModalProps) {
  // prettier-ignore
  const {
    open, onClose, accounts, channels, networks,
    productsByChannelId: providedProductsByChannelId,
    defaultCurrency, workspaceTimezone,
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
  // prettier-ignore
  const {
    advertiserTelegram, setAdvertiserTelegram, advertiserContact, setAdvertiserContact,
    selectedAdvertiser, setSelectedAdvertiser, selectedAdvertiserId, setSelectedAdvertiserId,
    advertiserMatches, setAdvertiserMatches, assignedMemberId, setAssignedMemberId,
    saleOrigin, setSaleOrigin, financeSkipped, setFinanceSkipped,
    accountId, setAccountId, accountManuallySelectedRef,
    channelSelectionMode, setChannelSelectionMode, selectedNetworkId, setSelectedNetworkId,
    selectedChannelIds, setSelectedChannelIds, placementDateRange, setPlacementDateRange,
    submissionError, setSubmissionError,
    pendingDrafts, publishedPostsByPlacement,
    setPublishedPostsByPlacement, postsLoadingByPlacement, setPostsLoadingByPlacement,
    clearCurrentDraft,
    continueDraft, deleteDraft, createNewDraft,
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
  const missingProductChannelIds = useMemo(
    () =>
      effectiveChannelIds.filter(
        (channelId) => !(channelId in providedProductsByChannelId),
      ),
    [effectiveChannelIds, providedProductsByChannelId],
  );
  const modalProductsQuery = useQuery({
    queryKey: telegramAdSalesKeys.productsByChannels(missingProductChannelIds),
    queryFn: () =>
      telegramAdSalesApi.listProductsByChannels(missingProductChannelIds),
    enabled: open && missingProductChannelIds.length > 0,
    staleTime: 60_000,
  });
  const productsByChannelId = useMemo(
    () => ({
      ...providedProductsByChannelId,
      ...(modalProductsQuery.data ?? {}),
    }),
    [modalProductsQuery.data, providedProductsByChannelId],
  );
  const selectedAccount = useMemo(
    () => accounts.find((account) => account.id === accountId),
    [accountId, accounts],
  );
  const paymentCurrency = useMemo(
    () =>
      (financeSkipped ? undefined : selectedAccount?.currency.toUpperCase()) ??
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
      financeSkipped,
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

  const { loadPublishedPosts } = useAdSalePlacementLoaders({
    onLoadPublishedPosts,
    postsLoadingByPlacement,
    setPostsLoadingByPlacement,
    setPublishedPostsByPlacement,
  });

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
    quoteRequests: financeSkipped ? [] : quoteRequests,
    productsByChannelId,
    requestPreview: onRequestQuotePreview,
    setPlacements,
  });

  const canSubmit =
    (financeSkipped || !quotePreview.limitExceeded) &&
    (financeSkipped || quotePreview.errors.length === 0) &&
    (financeSkipped || quotePreview.hasResolvedQuote) &&
    (financeSkipped || !!accountId) &&
    (financeSkipped || paymentAmount > 0) &&
    effectiveChannelIds.length > 0 &&
    placements.length > 0 &&
    placements.every((placement) =>
      isValidZonedDateTimeInput(placement.date, placement.time),
    ) &&
    (Boolean(selectedAdvertiserId) ||
      !advertiserContact.trim() ||
      isValidTelegramUsernameInput(advertiserContact)) &&
    (financeSkipped ||
      !networkPricing.allocation ||
      Math.round(paymentAmount * 100) ===
        Math.round(networkPricing.allocation.totalAmount * 100));

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
        financeSkipped,
        accountId: financeSkipped ? undefined : accountId,
        paymentAmount: financeSkipped ? undefined : paymentAmount,
        paymentCurrency,
        priceAllocation: financeSkipped ? undefined : networkPricing.allocation,
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
          agreedPrice: financeSkipped ? 0 : toNumber(placement.agreedPrice),
          recommendedPrice: financeSkipped ? 0 : toNumber(placement.recommendedPrice),
          minimumPrice: financeSkipped ? 0 : toNumber(placement.minimumPrice),
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
      clearCurrentDraft();
      onClose();
    } catch (error) {
      setSubmissionError(
        error instanceof Error ? error.message : "Could not create sale",
      );
    }
  }

  const sharedPostActive =
    postMode === "shared" &&
    placements.length >= 1 &&
    placements.every((placement) =>
      hasPlacementPostContent(placement.managedPostDraft),
    );
  // prettier-ignore
  return {
    advertiserTelegram, setAdvertiserTelegram, advertiserContact, setAdvertiserContact,
    selectedAdvertiser, setSelectedAdvertiser, selectedAdvertiserId, setSelectedAdvertiserId,
    advertiserMatches, setAdvertiserMatches, assignedMemberId, setAssignedMemberId,
    saleOrigin, setSaleOrigin, financeSkipped, setFinanceSkipped,
    accountId, setAccountId, accountManuallySelectedRef,
    channelSelectionMode, setChannelSelectionMode, selectedNetworkId, setSelectedNetworkId,
    selectedChannelIds, setSelectedChannelIds, placementDateRange, setPlacementDateRange,
    postMode, setPostMode, placements, setPlacements, submissionError, pendingDrafts,
    publishedPostsByPlacement, postsLoadingByPlacement, paymentAmount, networkPricing,
    quotePreview,
    effectiveChannelIds, paymentCurrency, commonTime, commonFormats, commonFormatName,
    productsByChannelId,
    loadPublishedPosts, canSubmit, submit, sharedPostActive, continueDraft, deleteDraft,
    createNewDraft,
  };
}
