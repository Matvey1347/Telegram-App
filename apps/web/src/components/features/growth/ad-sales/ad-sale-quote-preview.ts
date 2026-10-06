"use client";

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type Dispatch,
  type SetStateAction,
} from "react";
import type {
  TelegramAdProduct,
  TelegramAdQuotePreviewBatchResponse,
  TelegramAdQuotePreviewRequest,
} from "@telegram-system/shared";
import { TELEGRAM_AD_QUOTE_PREVIEW_MAX_REQUESTS } from "@telegram-system/shared";
import {
  isValidZonedDateTimeInput,
  toNumber,
  zonedDateTimeToUtc,
} from "@/lib/features/growth/telegram-ad-sales";
import { productPrice } from "./ad-sale-placement-draft";
import type { QuoteRequestDraft, SalePlacementDraft } from "./ad-sale-types";

export function buildQuotePreviewRequests(
  placements: QuoteRequestDraft[],
  currency: string,
): TelegramAdQuotePreviewRequest[] {
  return placements.flatMap<TelegramAdQuotePreviewRequest>((placement) =>
    isValidZonedDateTimeInput(placement.date, placement.time)
      ? [
          {
            requestId: placement.key,
            telegramChannelId: placement.channelId,
            telegramAdProductId: placement.productId || undefined,
            pricingMode: placement.pricingMode,
            currency,
            scheduledAt: zonedDateTimeToUtc(
              placement.date,
              placement.time,
              placement.timezone,
            ).toISOString(),
          },
        ]
      : [],
  );
}

export function applyQuotePreviewResults(
  placements: SalePlacementDraft[],
  response: TelegramAdQuotePreviewBatchResponse,
  productsByChannelId: Record<string, TelegramAdProduct[]>,
  preserveAgreedPrice: boolean,
) {
  const resultByPlacementKey = new Map(
    response.items.map((result) => [result.requestId, result]),
  );
  let changed = false;
  const next = placements.map((item) => {
    const result = resultByPlacementKey.get(item.key);
    if (!result) return item;
    if (result.error) {
      const warnings = [result.error.message];
      if (item.warnings.join("|") === warnings.join("|")) return item;
      changed = true;
      return { ...item, warnings };
    }

    const quote = result.quote;
    const product = productsByChannelId[item.channelId]?.find(
      (candidate) => candidate.id === item.productId,
    );
    const recommendedPrice =
      toNumber(quote.recommendedPrice) > 0
        ? quote.recommendedPrice
        : productPrice(product);
    const minimumPrice =
      toNumber(quote.minimumPrice) > 0
        ? quote.minimumPrice
        : (product?.minimumPrice ?? recommendedPrice);
    // A saved draft can contain an amount from a different financial-account
    // currency. A manual amount is preserved only while its quote currency is
    // still the requested currency; changing USD → PLN (or restoring legacy
    // drafts without quote metadata) must refresh it from the channel quote.
    const quoteCurrency = quote.currency?.toUpperCase() ?? item.quotedCurrency ?? "";
    const agreedPrice =
      preserveAgreedPrice ||
      (item.agreedPriceManuallyEdited && item.quotedCurrency === quoteCurrency)
        ? item.agreedPrice
        : recommendedPrice;
    const warnings = quote.warnings.map((warning) => warning.message);
    if (
      item.expectedViews === quote.expectedViews &&
      item.targetCpm === quote.targetCpm &&
      item.recommendedPrice === recommendedPrice &&
      item.minimumPrice === minimumPrice &&
      item.agreedPrice === agreedPrice &&
      item.quotedCurrency === quoteCurrency &&
      item.warnings.join("|") === warnings.join("|")
    ) {
      return item;
    }
    changed = true;
    return {
      ...item,
      expectedViews: quote.expectedViews,
      targetCpm: quote.targetCpm,
      recommendedPrice,
      minimumPrice,
      agreedPrice,
      quotedCurrency: quoteCurrency,
      warnings,
    };
  });
  return changed ? next : placements;
}

export function useAdSaleQuotePreview({
  open,
  currency,
  quoteRequests,
  productsByChannelId,
  preserveAgreedPrice,
  requestPreview,
  setPlacements,
}: {
  open: boolean;
  currency: string;
  quoteRequests: QuoteRequestDraft[];
  productsByChannelId: Record<string, TelegramAdProduct[]>;
  preserveAgreedPrice: boolean;
  requestPreview: (
    requests: TelegramAdQuotePreviewRequest[],
    signal?: AbortSignal,
  ) => Promise<TelegramAdQuotePreviewBatchResponse>;
  setPlacements: Dispatch<SetStateAction<SalePlacementDraft[]>>;
}) {
  const [errors, setErrors] = useState<string[]>([]);
  const requestKey = useMemo(
    () =>
      open && quoteRequests.length
        ? JSON.stringify({ currency, requests: quoteRequests })
        : "",
    [currency, open, quoteRequests],
  );
  const loadedKeyRef = useRef("");
  const requestCount = buildQuotePreviewRequests(
    quoteRequests,
    currency,
  ).length;
  const limitExceeded =
    requestCount > TELEGRAM_AD_QUOTE_PREVIEW_MAX_REQUESTS;

  useEffect(() => {
    if (!requestKey) {
      loadedKeyRef.current = "";
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setErrors((current) => (current.length ? [] : current));
      return;
    }
    if (loadedKeyRef.current === requestKey || limitExceeded) return;
    loadedKeyRef.current = requestKey;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setErrors((current) => (current.length ? [] : current));
    let current = true;
    const controller = new AbortController();
    const requests = buildQuotePreviewRequests(quoteRequests, currency);
    if (!requests.length) return;

    void (async () => {
      for (let attempt = 0; attempt < 2; attempt += 1) {
        try {
          const response = await requestPreview(requests, controller.signal);
          if (!current) return;
          setErrors(
            response.items.flatMap((item) =>
              item.error ? [item.error.message] : [],
            ),
          );
          setPlacements((placements) =>
            applyQuotePreviewResults(
              placements,
              response,
              productsByChannelId,
              preserveAgreedPrice,
            ),
          );
          return;
        } catch {
          if (!current || controller.signal.aborted) return;
        }
      }
    })();

    return () => {
      current = false;
      controller.abort();
    };
  }, [
    currency,
    limitExceeded,
    preserveAgreedPrice,
    productsByChannelId,
    quoteRequests,
    requestKey,
    requestPreview,
    setPlacements,
  ]);

  return { limitExceeded, requestCount, errors };
}
