import { renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type {
  TelegramAdProduct,
  TelegramAdQuotePreviewBatchResponse,
  TelegramAdQuotePreviewRequest,
} from "@telegram-system/shared";
import {
  applyQuotePreviewResults,
  buildQuotePreviewRequests,
  useAdSaleQuotePreview,
} from "./ad-sale-quote-preview";
import type { SalePlacementDraft } from "./ad-sale-types";

function placement(key: string, channelId: string): SalePlacementDraft {
  return {
    key,
    channelId,
    productId: `product-${channelId}`,
    pricingMode: "CPM",
    date: "2099-01-02",
    time: "12:00",
    timezone: "Europe/Warsaw",
    agreedPrice: "10",
    recommendedPrice: "10",
    minimumPrice: "5",
    expectedViews: 100,
    targetCpm: "100",
    manualPriceReason: "",
    agreedPriceManuallyEdited: false,
    warnings: [],
    conflict: null,
  };
}

describe("ad sale quote preview", () => {
  it("builds one batch item per valid placement", () => {
    const requests = buildQuotePreviewRequests(
      [placement("one", "channel-1"), placement("two", "channel-2")],
      "USD",
    );

    expect(requests).toHaveLength(2);
    expect(requests).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          requestId: "one",
          telegramChannelId: "channel-1",
          currency: "USD",
        }),
        expect.objectContaining({
          requestId: "two",
          telegramChannelId: "channel-2",
          currency: "USD",
        }),
      ]),
    );
  });

  it("sends one supported 9,300-item batch", async () => {
    const placements = Array.from({ length: 9_300 }, (_, index) =>
      placement(`placement-${index}`, `channel-${index}`),
    );
    const requestPreview = vi.fn().mockResolvedValue({ items: [] });

    renderHook(() =>
      useAdSaleQuotePreview({
        open: true,
        currency: "USD",
        quoteRequests: placements,
        productsByChannelId: {},
        preserveAgreedPrice: false,
        requestPreview,
        setPlacements: vi.fn(),
      }),
    );

    await waitFor(() => expect(requestPreview).toHaveBeenCalledTimes(1));
    expect(requestPreview.mock.calls[0][0]).toHaveLength(9_300);
  }, 15_000);

  it("does not send a batch above the frozen maximum", () => {
    const placements = Array.from({ length: 10_001 }, (_, index) =>
      placement(`placement-${index}`, `channel-${index}`),
    );
    const requestPreview = vi.fn();
    const { result } = renderHook(() =>
      useAdSaleQuotePreview({
        open: true,
        currency: "USD",
        quoteRequests: placements,
        productsByChannelId: {},
        preserveAgreedPrice: false,
        requestPreview,
        setPlacements: vi.fn(),
      }),
    );

    expect(result.current).toEqual({ limitExceeded: true, requestCount: 10_001 });
    expect(requestPreview).not.toHaveBeenCalled();
  });

  it("retries a failed key once", async () => {
    const requestPreview = vi
      .fn()
      .mockRejectedValueOnce(new Error("temporary"))
      .mockResolvedValueOnce({ items: [] });

    renderHook(() =>
      useAdSaleQuotePreview({
        open: true,
        currency: "USD",
        quoteRequests: [placement("one", "channel-1")],
        productsByChannelId: {},
        preserveAgreedPrice: false,
        requestPreview,
        setPlacements: vi.fn(),
      }),
    );

    await waitFor(() => expect(requestPreview).toHaveBeenCalledTimes(2));
  });

  it("aborts and ignores a stale response", async () => {
    const resolutions: Array<
      (value: TelegramAdQuotePreviewBatchResponse) => void
    > = [];
    const requestPreview = vi.fn(
      (requests: TelegramAdQuotePreviewRequest[], signal?: AbortSignal) => {
        void requests;
        void signal;
        return new Promise<TelegramAdQuotePreviewBatchResponse>((resolve) => {
          resolutions.push(resolve);
        });
      },
    );
    let current = [placement("one", "channel-1")];
    const setPlacements = vi.fn((update) => {
      current = typeof update === "function" ? update(current) : update;
    });
    const quoteRequests = [placement("one", "channel-1")];
    const { rerender } = renderHook(
      ({ currency }) =>
        useAdSaleQuotePreview({
          open: true,
          currency,
          quoteRequests,
          productsByChannelId: {},
          preserveAgreedPrice: false,
          requestPreview,
          setPlacements,
        }),
      { initialProps: { currency: "USD" } },
    );

    await waitFor(() => expect(requestPreview).toHaveBeenCalledTimes(1));
    const firstSignal = requestPreview.mock.calls[0][1]!;
    rerender({ currency: "EUR" });
    await waitFor(() => expect(requestPreview).toHaveBeenCalledTimes(2));
    expect(firstSignal.aborted).toBe(true);

    resolutions[1]({ items: [{ requestId: "one", quote: quote(222) }] });
    await waitFor(() => expect(current[0].expectedViews).toBe(222));
    resolutions[0]({ items: [{ requestId: "one", quote: quote(111) }] });
    await Promise.resolve();
    expect(current[0].expectedViews).toBe(222);
  });

  it("applies successful items while retaining stale values for item errors", () => {
    const first = placement("one", "channel-1");
    const second = placement("two", "channel-2");
    const products = {
      "channel-1": [{ id: "product-channel-1" }],
      "channel-2": [{ id: "product-channel-2" }],
    } as unknown as Record<string, TelegramAdProduct[]>;

    const result = applyQuotePreviewResults(
      [first, second],
      {
        items: [
          {
            requestId: "one",
            quote: {
              expectedViews: 500,
              snapshotId: null,
              targetCpm: "200",
              recommendedPrice: "100",
              minimumPrice: "50",
              currency: "USD",
              dataQuality: "READY",
              warnings: [],
            },
          },
          {
            requestId: "two",
            error: {
              code: "PRODUCT_NOT_FOUND",
              message: "Product is no longer available",
            },
          },
        ],
      },
      products,
      false,
    );

    expect(result[0]).toMatchObject({
      expectedViews: 500,
      recommendedPrice: "100",
      agreedPrice: "100",
    });
    expect(result[1]).toMatchObject({
      expectedViews: 100,
      recommendedPrice: "10",
      agreedPrice: "10",
      warnings: ["Product is no longer available"],
    });
  });
});

function quote(expectedViews: number) {
  return {
    expectedViews,
    snapshotId: null,
    targetCpm: "100",
    recommendedPrice: "10",
    minimumPrice: "5",
    currency: "USD",
    dataQuality: "READY" as const,
    warnings: [],
  };
}
