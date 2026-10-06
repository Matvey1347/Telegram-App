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
      // A network-total allocation marks each split as manually edited. It is
      // still only valid in the currency in which that allocation was made.
      // Do not preserve an amount such as 354.60 UAH and relabel it as USD
      // while the quote is refreshed for a different financial account.
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
  requestPreview,
  setPlacements,
}: {
  open: boolean;
  currency: string;
  quoteRequests: QuoteRequestDraft[];
  productsByChannelId: Record<string, TelegramAdProduct[]>;
  requestPreview: (
    requests: TelegramAdQuotePreviewRequest[],
    signal?: AbortSignal,
  ) => Promise<TelegramAdQuotePreviewBatchResponse>;
  setPlacements: Dispatch<SetStateAction<SalePlacementDraft[]>>;
}) {
  const [errors, setErrors] = useState<string[]>([]);
  const [completedRequestKey, setCompletedRequestKey] = useState("");
  const quoteRequestsRef = useRef(quoteRequests);
  const productsByChannelIdRef = useRef(productsByChannelId);
  const requestPreviewRef = useRef(requestPreview);
  quoteRequestsRef.current = quoteRequests;
  productsByChannelIdRef.current = productsByChannelId;
  requestPreviewRef.current = requestPreview;
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
      setCompletedRequestKey("");
      return;
    }
    if (loadedKeyRef.current === requestKey || limitExceeded) return;
    loadedKeyRef.current = requestKey;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setErrors((current) => (current.length ? [] : current));
    setCompletedRequestKey("");
    let current = true;
    const controller = new AbortController();
    const requests = buildQuotePreviewRequests(
      quoteRequestsRef.current,
      currency,
    );
    if (!requests.length) return;

    void (async () => {
      for (let attempt = 0; attempt < 2; attempt += 1) {
        try {
          const response = await requestPreviewRef.current(
            requests,
            controller.signal,
          );
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
              productsByChannelIdRef.current,
            ),
          );
          setCompletedRequestKey(requestKey);
          return;
        } catch {
          if (!current || controller.signal.aborted) return;
        }
      }
      if (current) {
        setErrors(["Could not refresh channel prices. Please try again."]);
      }
    })();

    return () => {
      current = false;
      controller.abort();
    };
  }, [
    currency,
    limitExceeded,
    requestKey,
    setPlacements,
  ]);

  return {
    limitExceeded,
    requestCount,
    errors,
    // Seed product prices are expressed in their channel currency. They must
    // never be presented as the financial account's currency before this
    // quote request has completed.
    hasResolvedQuote: completedRequestKey === requestKey && !!requestKey,
  };
}
