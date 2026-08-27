import type { TelegramAdProduct } from "@telegram-system/shared";
import type { SalePlacementDraft } from "./ad-sale-types";

export function productPrice(product: TelegramAdProduct | undefined) {
  return product?.estimatedPrice ?? product?.defaultFixedPrice ?? "0";
}

export function applyProductToPlacement(
  placement: SalePlacementDraft,
  product: TelegramAdProduct | undefined,
) {
  const price = productPrice(product);
  return {
    ...placement,
    productId: product?.id ?? "",
    pricingMode: product?.defaultPricingMode ?? "CPM",
    expectedViews: product?.estimatedViews ?? 0,
    targetCpm: product?.defaultCpm ?? "0",
    recommendedPrice: price,
    minimumPrice: product?.minimumPrice ?? price,
    agreedPrice: price,
    agreedPriceManuallyEdited: false,
  } satisfies SalePlacementDraft;
}

export function commonAdSaleFormats({
  channelIds,
  productsByChannelId,
}: {
  channelIds: string[];
  productsByChannelId: Record<string, TelegramAdProduct[]>;
}) {
  const uniqueChannelIds = [...new Set(channelIds)];
  const firstProducts = productsByChannelId[uniqueChannelIds[0] ?? ""] ?? [];
  return firstProducts.filter((product) =>
    uniqueChannelIds.every((channelId) =>
      (productsByChannelId[channelId] ?? []).some(
        (candidate) => candidate.name === product.name,
      ),
    ),
  );
}

export function resolveAdSaleCurrency({
  channelIds,
  channels,
  placements,
  productsByChannelId,
  fallback,
}: {
  channelIds: string[];
  channels: Array<{
    id: string;
    adBaseCpm?: number | string | null;
    adBaseCurrency?: string;
  }>;
  placements: SalePlacementDraft[];
  productsByChannelId: Record<string, TelegramAdProduct[]>;
  fallback: string;
}) {
  const normalizedFallback = fallback.toUpperCase();
  const counts = new Map<string, number>();
  for (const channelId of new Set(channelIds)) {
    const channel = channels.find((item) => item.id === channelId);
    const products = productsByChannelId[channelId] ?? [];
    const selectedProductId = placements.find(
      (placement) => placement.channelId === channelId,
    )?.productId;
    const selectedProduct = products.find(
      (product) => product.id === selectedProductId,
    );
    const currency = (
      channel?.adBaseCpm != null && channel.adBaseCurrency
        ? channel.adBaseCurrency
        : selectedProduct?.currency ??
          products[0]?.currency ??
          channel?.adBaseCurrency ??
          normalizedFallback
    ).toUpperCase();
    const hasConfiguredPricing = channel?.adBaseCpm != null;
    const differsFromInheritedFallback = currency !== normalizedFallback;
    if (!hasConfiguredPricing && !differsFromInheritedFallback) continue;
    counts.set(currency, (counts.get(currency) ?? 0) + 1);
  }
  return [...counts.entries()].sort(
    ([leftCurrency, leftCount], [rightCurrency, rightCount]) =>
      rightCount - leftCount ||
      Number(rightCurrency === normalizedFallback) -
        Number(leftCurrency === normalizedFallback),
  )[0]?.[0] ?? normalizedFallback;
}

export function createPlacementDraft(params: {
  channelId: string;
  product?: TelegramAdProduct;
  date: string;
  time: string;
  timezone: string;
  inventoryOpportunityKey?: string | null;
}): SalePlacementDraft {
  const price = productPrice(params.product);
  return {
    key: `placement:${params.channelId}:${params.date}`,
    channelId: params.channelId,
    date: params.date,
    time: params.time,
    timezone: params.timezone,
    productId: params.product?.id ?? "",
    expectedViews: params.product?.estimatedViews ?? 0,
    targetCpm: params.product?.defaultCpm ?? "0",
    recommendedPrice: price,
    minimumPrice: params.product?.minimumPrice ?? price,
    agreedPrice: price,
    pricingMode: params.product?.defaultPricingMode ?? "CPM",
    manualPriceReason: "",
    warnings: [],
    conflict: null,
    agreedPriceManuallyEdited: false,
    inventoryOpportunityKey: params.inventoryOpportunityKey ?? null,
    telegramPostId: null,
  };
}
